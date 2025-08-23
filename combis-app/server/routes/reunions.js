const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const smsService = require('../services/smsService');

const router = express.Router();

// Créer une réunion (admin/trésorier)
router.post('/', [
  authenticateToken,
  requireRole(['admin', 'tresorier']),
  body('titre').notEmpty().withMessage('Titre requis'),
  body('date_reunion').isISO8601().withMessage('Date de réunion invalide'),
  body('lieu').optional().isString(),
  body('lien_visio').optional().isURL(),
  body('type_reunion').optional().isIn(['ordinaire', 'extraordinaire', 'assemblee_generale']),
  body('ordre_du_jour').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      titre,
      description = '',
      date_reunion,
      lieu = '',
      lien_visio = '',
      type_reunion = 'ordinaire',
      ordre_du_jour = ''
    } = req.body;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Créer la réunion
      const reunionResult = await client.query(`
        INSERT INTO reunions (
          titre, description, date_reunion, lieu, lien_visio,
          type_reunion, ordre_du_jour, cree_par
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [titre, description, date_reunion, lieu, lien_visio, type_reunion, ordre_du_jour, req.user.id]);

      const reunion = reunionResult.rows[0];

      // Obtenir tous les membres actifs pour les convocations
      const membresResult = await client.query(`
        SELECT id, nom_complet, telephone_1 
        FROM membres 
        WHERE statut = 'actif' AND id != $1
      `, [req.user.id]);

      // Créer les convocations
      for (const membre of membresResult.rows) {
        await client.query(`
          INSERT INTO convocations (reunion_id, membre_id)
          VALUES ($1, $2)
        `, [reunion.id, membre.id]);
      }

      await client.query('COMMIT');

      // Envoyer les SMS de convocation
      if (membresResult.rows.length > 0) {
        const destinataires = membresResult.rows.map(m => ({
          id: m.id,
          nom_complet: m.nom_complet,
          telephone: m.telephone_1,
          titre: reunion.titre,
          date: new Date(reunion.date_reunion).toLocaleDateString('fr-FR'),
          heure: new Date(reunion.date_reunion).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          lieu: reunion.lieu || 'Lieu à confirmer'
        }));

        // Envoyer en arrière-plan
        smsService.envoyerSMSMasse(destinataires, 'Convocation réunion', {
          expediteur_id: req.user.id
        }).catch(error => {
          console.error('Erreur envoi SMS convocations:', error);
        });
      }

      res.status(201).json({
        message: 'Réunion créée et convocations envoyées',
        reunion: {
          id: reunion.id,
          titre: reunion.titre,
          date_reunion: reunion.date_reunion,
          nombre_convoques: membresResult.rows.length
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Erreur création réunion:', error);
    res.status(500).json({ message: 'Erreur lors de la création de la réunion' });
  }
});

// Obtenir les réunions
router.get('/', [authenticateToken], async (req, res) => {
  try {
    const {
      statut = 'all',
      type_reunion = 'all',
      page = 1,
      limit = 20
    } = req.query;

    let whereClause = '';
    const params = [];
    let paramCount = 0;
    const conditions = [];

    if (statut !== 'all') {
      paramCount++;
      conditions.push(`r.statut = $${paramCount}`);
      params.push(statut);
    }

    if (type_reunion !== 'all') {
      paramCount++;
      conditions.push(`r.type_reunion = $${paramCount}`);
      params.push(type_reunion);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        r.*,
        createur.nom_complet as cree_par_nom,
        COUNT(c.id) as nombre_convoques,
        COUNT(CASE WHEN c.statut_convocation = 'confirme' THEN 1 END) as nombre_confirmes,
        TO_CHAR(r.date_reunion, 'DD/MM/YYYY HH24:MI') as date_reunion_formatted,
        TO_CHAR(r.created_at, 'DD/MM/YYYY') as created_at_formatted
      FROM reunions r
      JOIN membres createur ON r.cree_par = createur.id
      LEFT JOIN convocations c ON r.id = c.reunion_id
      ${whereClause}
      GROUP BY r.id, createur.nom_complet
      ORDER BY r.date_reunion DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    res.json({
      reunions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Erreur récupération réunions:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Répondre à une convocation
router.post('/:id/repondre', [
  authenticateToken,
  body('statut_convocation').isIn(['confirme', 'decline']).withMessage('Statut invalide'),
  body('commentaire').optional().isString()
], async (req, res) => {
  try {
    const { id } = req.params;
    const { statut_convocation, commentaire = null } = req.body;

    const result = await pool.query(`
      UPDATE convocations 
      SET statut_convocation = $1, date_reponse = CURRENT_TIMESTAMP, commentaire = $2
      WHERE reunion_id = $3 AND membre_id = $4
      RETURNING *
    `, [statut_convocation, commentaire, id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Convocation non trouvée' });
    }

    res.json({ 
      message: `Réponse enregistrée: ${statut_convocation === 'confirme' ? 'Présence confirmée' : 'Absence signalée'}` 
    });

  } catch (error) {
    console.error('Erreur réponse convocation:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;