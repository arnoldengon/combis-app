const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const smsService = require('../services/smsService');

const router = express.Router();

// Obtenir toutes les notifications SMS (admin/trésorier)
router.get('/sms', [authenticateToken, requireRole(['admin', 'tresorier'])], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      statut = 'all',
      type_notification = 'all',
      date_debut,
      date_fin
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = '';
    const params = [];
    let paramCount = 0;

    const conditions = [];

    if (statut !== 'all') {
      paramCount++;
      conditions.push(`ns.statut = $${paramCount}`);
      params.push(statut);
    }

    if (type_notification !== 'all') {
      paramCount++;
      conditions.push(`ns.type_notification = $${paramCount}`);
      params.push(type_notification);
    }

    if (date_debut) {
      paramCount++;
      conditions.push(`ns.created_at >= $${paramCount}`);
      params.push(date_debut);
    }

    if (date_fin) {
      paramCount++;
      conditions.push(`ns.created_at <= $${paramCount}`);
      params.push(date_fin);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const query = `
      SELECT 
        ns.*,
        m.nom_complet as destinataire_nom,
        exp.nom_complet as expediteur_nom,
        TO_CHAR(ns.created_at, 'DD/MM/YYYY HH24:MI') as date_creation_formatted,
        TO_CHAR(ns.date_envoi, 'DD/MM/YYYY HH24:MI') as date_envoi_formatted,
        TO_CHAR(ns.date_livraison, 'DD/MM/YYYY HH24:MI') as date_livraison_formatted
      FROM notifications_sms ns
      LEFT JOIN membres m ON ns.destinataire_id = m.id
      LEFT JOIN membres exp ON ns.expediteur_id = exp.id
      ${whereClause}
      ORDER BY ns.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    // Compter le total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM notifications_sms ns
      LEFT JOIN membres m ON ns.destinataire_id = m.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, paramCount));

    res.json({
      notifications: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur récupération notifications SMS:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Envoyer un SMS individuel (admin/trésorier)
router.post('/sms/envoyer', [
  authenticateToken,
  requireRole(['admin', 'tresorier']),
  body('destinataire_id').isInt().withMessage('Destinataire requis'),
  body('message').notEmpty().withMessage('Message requis'),
  body('type_notification').notEmpty().withMessage('Type de notification requis')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { destinataire_id, message, type_notification } = req.body;

    // Récupérer les infos du destinataire
    const membreResult = await pool.query(
      'SELECT nom_complet, telephone_1 FROM membres WHERE id = $1',
      [destinataire_id]
    );

    if (membreResult.rows.length === 0) {
      return res.status(404).json({ message: 'Membre non trouvé' });
    }

    const membre = membreResult.rows[0];

    // Envoyer le SMS
    const result = await smsService.envoyerSMS(
      destinataire_id,
      membre.telephone_1,
      message,
      type_notification,
      req.user.id
    );

    if (result.success) {
      res.json({
        message: `SMS envoyé avec succès à ${membre.nom_complet}`,
        notification_id: result.notificationId,
        reference: result.reference
      });
    } else {
      res.status(400).json({
        message: 'Échec de l\'envoi du SMS',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Erreur envoi SMS:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Envoyer des SMS en masse (admin seulement)
router.post('/sms/masse', [
  authenticateToken,
  requireRole(['admin']),
  body('destinataires').isArray().withMessage('Liste de destinataires requise'),
  body('template_nom').notEmpty().withMessage('Template requis'),
  body('variables').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { destinataires, template_nom, variables = {} } = req.body;

    // Récupérer les infos des destinataires
    const membresIds = destinataires.map(d => d.id);
    const membresResult = await pool.query(
      'SELECT id, nom_complet, telephone_1 FROM membres WHERE id = ANY($1::int[])',
      [membresIds]
    );

    const membresData = membresResult.rows.map(m => ({
      id: m.id,
      nom_complet: m.nom_complet,
      telephone: m.telephone_1,
      ...destinataires.find(d => d.id === m.id) // Merge avec données supplémentaires
    }));

    // Envoyer les SMS
    const resultats = await smsService.envoyerSMSMasse(
      membresData,
      template_nom,
      { ...variables, expediteur_id: req.user.id }
    );

    const succes = resultats.filter(r => r.success).length;
    const echecs = resultats.filter(r => !r.success).length;

    res.json({
      message: `SMS envoyés: ${succes} succès, ${echecs} échecs`,
      details: resultats
    });

  } catch (error) {
    console.error('Erreur SMS masse:', error);
    res.status(500).json({ message: error.message });
  }
});

// Envoyer les rappels de cotisations automatiques (admin)
router.post('/sms/rappels-cotisations', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const resultats = await smsService.envoyerRappelsCotisations();

    res.json({
      message: `Rappels envoyés à ${resultats.length} membres`,
      details: resultats
    });

  } catch (error) {
    console.error('Erreur rappels cotisations:', error);
    res.status(500).json({ message: error.message });
  }
});

// Obtenir les templates SMS (admin/trésorier)
router.get('/sms/templates', [authenticateToken, requireRole(['admin', 'tresorier'])], async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM modeles_sms 
      ORDER BY type_notification, nom
    `);

    res.json(result.rows);

  } catch (error) {
    console.error('Erreur récupération templates:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer/modifier un template SMS (admin)
router.post('/sms/templates', [
  authenticateToken,
  requireRole(['admin']),
  body('nom').notEmpty().withMessage('Nom du template requis'),
  body('type_notification').notEmpty().withMessage('Type de notification requis'),
  body('template').notEmpty().withMessage('Template requis')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nom, type_notification, template, actif = true } = req.body;

    const result = await pool.query(`
      INSERT INTO modeles_sms (nom, type_notification, template, actif)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (nom) DO UPDATE SET
        type_notification = EXCLUDED.type_notification,
        template = EXCLUDED.template,
        actif = EXCLUDED.actif
      RETURNING *
    `, [nom, type_notification, template, actif]);

    res.json({
      message: 'Template SMS sauvegardé',
      template: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur sauvegarde template:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Statistiques SMS (admin/trésorier)
router.get('/sms/statistiques', [authenticateToken, requireRole(['admin', 'tresorier'])], async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;

    const stats = await smsService.getStatistiques(date_debut, date_fin);

    // Statistiques par mois (12 derniers mois)
    const statsParMois = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as mois,
        COUNT(*) as total,
        COUNT(CASE WHEN statut = 'envoye' THEN 1 END) as envoyes,
        SUM(cout_fcfa) as cout
      FROM notifications_sms
      WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY mois DESC
    `);

    // Top destinataires
    const topDestinataires = await pool.query(`
      SELECT 
        m.nom_complet,
        COUNT(ns.id) as nb_sms_recus,
        SUM(ns.cout_fcfa) as cout_total
      FROM notifications_sms ns
      JOIN membres m ON ns.destinataire_id = m.id
      GROUP BY m.id, m.nom_complet
      ORDER BY nb_sms_recus DESC
      LIMIT 10
    `);

    res.json({
      global: stats.global,
      par_type: stats.par_type,
      par_mois: statsParMois.rows.map(row => ({
        mois: row.mois.toISOString().slice(0, 7),
        total: parseInt(row.total),
        envoyes: parseInt(row.envoyes),
        cout: parseInt(row.cout || 0)
      })),
      top_destinataires: topDestinataires.rows
    });

  } catch (error) {
    console.error('Erreur statistiques SMS:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les configurations SMS (admin)
router.get('/sms/configuration', [authenticateToken, requireRole(['admin'])], async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cle, valeur, description 
      FROM configurations 
      WHERE cle LIKE 'sms_%' OR cle LIKE 'rappel_%'
      ORDER BY cle
    `);

    const config = {};
    result.rows.forEach(row => {
      config[row.cle] = {
        valeur: row.valeur,
        description: row.description
      };
    });

    res.json(config);

  } catch (error) {
    console.error('Erreur récupération config SMS:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour la configuration SMS (admin)
router.put('/sms/configuration', [
  authenticateToken,
  requireRole(['admin']),
  body('configurations').isObject().withMessage('Configurations requises')
], async (req, res) => {
  try {
    const { configurations } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const [cle, valeur] of Object.entries(configurations)) {
        await client.query(`
          UPDATE configurations 
          SET valeur = $1, updated_at = CURRENT_TIMESTAMP 
          WHERE cle = $2
        `, [valeur, cle]);
      }

      await client.query('COMMIT');

      res.json({ message: 'Configuration SMS mise à jour' });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Erreur mise à jour config SMS:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;