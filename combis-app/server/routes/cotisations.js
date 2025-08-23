const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Obtenir les cotisations avec filtres
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      annee = new Date().getFullYear(),
      mois,
      statut = 'all',
      membre_id,
      search = ''
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE c.annee = $1';
    const params = [annee];
    let paramCount = 1;

    if (mois) {
      paramCount++;
      whereClause += ` AND c.mois = $${paramCount}`;
      params.push(mois);
    }

    if (statut !== 'all') {
      paramCount++;
      whereClause += ` AND c.statut = $${paramCount}`;
      params.push(statut);
    }

    if (membre_id) {
      paramCount++;
      whereClause += ` AND c.membre_id = $${paramCount}`;
      params.push(membre_id);
    }

    if (search) {
      paramCount++;
      whereClause += ` AND m.nom_complet ILIKE $${paramCount}`;
      params.push(`%${search}%`);
    }

    const query = `
      SELECT 
        c.*,
        m.nom_complet,
        m.telephone_1,
        TO_CHAR(c.date_echeance, 'DD/MM/YYYY') as date_echeance_formatted,
        TO_CHAR(c.date_paiement, 'DD/MM/YYYY') as date_paiement_formatted,
        CASE 
          WHEN c.statut = 'impayee' AND c.date_echeance < CURRENT_DATE THEN 'en_retard'
          ELSE c.statut
        END as statut_reel,
        CASE 
          WHEN c.statut = 'impayee' AND c.date_echeance < CURRENT_DATE 
          THEN CURRENT_DATE - c.date_echeance
          ELSE 0
        END as jours_retard
      FROM cotisations c
      JOIN membres m ON c.membre_id = m.id
      ${whereClause}
      ORDER BY c.date_echeance DESC, m.nom_complet
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    // Compter le total
    const countQuery = `
      SELECT COUNT(c.id) as total
      FROM cotisations c
      JOIN membres m ON c.membre_id = m.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, paramCount));

    res.json({
      cotisations: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur récupération cotisations:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir le résumé des cotisations par année
router.get('/resume/:annee', authenticateToken, async (req, res) => {
  try {
    const { annee } = req.params;

    const query = `
      SELECT 
        COUNT(c.id) as total_cotisations,
        COUNT(CASE WHEN c.statut = 'payee' THEN 1 END) as cotisations_payees,
        COUNT(CASE WHEN c.statut = 'impayee' THEN 1 END) as cotisations_impayees,
        COUNT(CASE WHEN c.statut = 'impayee' AND c.date_echeance < CURRENT_DATE THEN 1 END) as cotisations_en_retard,
        COALESCE(SUM(CASE WHEN c.statut = 'payee' THEN c.montant_mensuel ELSE 0 END), 0) as montant_encaisse,
        COALESCE(SUM(CASE WHEN c.statut = 'impayee' THEN c.montant_mensuel ELSE 0 END), 0) as montant_attendu,
        ROUND(AVG(CASE WHEN c.statut = 'payee' THEN c.montant_mensuel END)) as montant_moyen
      FROM cotisations c
      WHERE c.annee = $1
    `;

    const result = await pool.query(query, [annee]);

    // Statistiques par mois
    const monthlyQuery = `
      SELECT 
        c.mois,
        TO_CHAR(TO_DATE(c.mois::text, 'MM'), 'Month') as nom_mois,
        COUNT(c.id) as total,
        COUNT(CASE WHEN c.statut = 'payee' THEN 1 END) as payes,
        COALESCE(SUM(CASE WHEN c.statut = 'payee' THEN c.montant_mensuel ELSE 0 END), 0) as montant_encaisse
      FROM cotisations c
      WHERE c.annee = $1
      GROUP BY c.mois
      ORDER BY c.mois
    `;

    const monthlyResult = await pool.query(monthlyQuery, [annee]);

    res.json({
      resume: result.rows[0],
      par_mois: monthlyResult.rows
    });

  } catch (error) {
    console.error('Erreur résumé cotisations:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Enregistrer un paiement (trésorier/admin)
router.post('/:id/paiement', [
  authenticateToken,
  requireRole(['admin', 'tresorier']),
  body('mode_paiement').isIn(['especes', 'virement', 'mobile_money']).withMessage('Mode de paiement invalide'),
  body('reference_paiement').optional().isString(),
  body('date_paiement').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      mode_paiement,
      reference_paiement,
      date_paiement = new Date().toISOString().split('T')[0]
    } = req.body;

    // Vérifier que la cotisation existe et n'est pas déjà payée
    const cotisationResult = await pool.query(`
      SELECT c.*, m.nom_complet
      FROM cotisations c
      JOIN membres m ON c.membre_id = m.id
      WHERE c.id = $1
    `, [id]);

    if (cotisationResult.rows.length === 0) {
      return res.status(404).json({ message: 'Cotisation non trouvée' });
    }

    const cotisation = cotisationResult.rows[0];

    if (cotisation.statut === 'payee') {
      return res.status(400).json({ message: 'Cette cotisation est déjà payée' });
    }

    // Enregistrer le paiement
    await pool.query(`
      UPDATE cotisations 
      SET 
        statut = 'payee',
        date_paiement = $1,
        mode_paiement = $2,
        reference_paiement = $3
      WHERE id = $4
    `, [date_paiement, mode_paiement, reference_paiement, id]);

    res.json({
      message: `Paiement enregistré pour ${cotisation.nom_complet} - ${cotisation.mois}/${cotisation.annee}`,
      cotisation_id: id
    });

  } catch (error) {
    console.error('Erreur enregistrement paiement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Annuler un paiement (admin seulement)
router.delete('/:id/paiement', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE cotisations 
      SET 
        statut = 'impayee',
        date_paiement = NULL,
        mode_paiement = NULL,
        reference_paiement = NULL
      WHERE id = $1 AND statut = 'payee'
      RETURNING membre_id, mois, annee
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cotisation non trouvée ou non payée' });
    }

    const { membre_id, mois, annee } = result.rows[0];

    res.json({
      message: `Paiement annulé pour la cotisation ${mois}/${annee}`,
      cotisation_id: id
    });

  } catch (error) {
    console.error('Erreur annulation paiement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les cotisations en retard
router.get('/retards', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        c.*,
        m.nom_complet,
        m.telephone_1,
        m.telephone_2,
        TO_CHAR(c.date_echeance, 'DD/MM/YYYY') as date_echeance_formatted,
        CURRENT_DATE - c.date_echeance as jours_retard
      FROM cotisations c
      JOIN membres m ON c.membre_id = m.id
      WHERE c.statut = 'impayee' AND c.date_echeance < CURRENT_DATE
      ORDER BY c.date_echeance ASC, m.nom_complet
    `;

    const result = await pool.query(query);

    // Grouper par membre
    const retards = {};
    result.rows.forEach(row => {
      const membreId = row.membre_id;
      if (!retards[membreId]) {
        retards[membreId] = {
          membre: {
            id: membreId,
            nom_complet: row.nom_complet,
            telephone_1: row.telephone_1,
            telephone_2: row.telephone_2
          },
          cotisations: [],
          total_du: 0,
          jours_retard_max: 0
        };
      }

      retards[membreId].cotisations.push({
        id: row.id,
        mois: row.mois,
        annee: row.annee,
        montant: row.montant_mensuel,
        date_echeance: row.date_echeance_formatted,
        jours_retard: row.jours_retard
      });

      retards[membreId].total_du += row.montant_mensuel;
      retards[membreId].jours_retard_max = Math.max(
        retards[membreId].jours_retard_max,
        row.jours_retard
      );
    });

    res.json({
      retards: Object.values(retards),
      statistiques: {
        nombre_membres_en_retard: Object.keys(retards).length,
        montant_total_retard: Object.values(retards).reduce((sum, r) => sum + r.total_du, 0),
        nombre_cotisations_en_retard: result.rows.length
      }
    });

  } catch (error) {
    console.error('Erreur récupération retards:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Générer les cotisations pour une nouvelle année (admin)
router.post('/generer-annee', [
  authenticateToken,
  requireRole(['admin']),
  body('annee').isInt({ min: 2020, max: 2050 }).withMessage('Année invalide')
], async (req, res) => {
  try {
    const { annee } = req.body;

    // Vérifier si les cotisations existent déjà pour cette année
    const existingResult = await pool.query(
      'SELECT COUNT(*) as count FROM cotisations WHERE annee = $1',
      [annee]
    );

    if (parseInt(existingResult.rows[0].count) > 0) {
      return res.status(400).json({ message: `Les cotisations pour ${annee} existent déjà` });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Récupérer tous les membres actifs
      const membresResult = await client.query(
        'SELECT id, cotisation_annuelle FROM membres WHERE statut = $1',
        ['actif']
      );

      let totalCotisations = 0;

      // Créer les cotisations pour chaque membre
      for (const membre of membresResult.rows) {
        const cotisationMensuelle = Math.round(membre.cotisation_annuelle / 12);

        for (let mois = 1; mois <= 12; mois++) {
          await client.query(`
            INSERT INTO cotisations (membre_id, annee, mois, montant_mensuel, date_echeance)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            membre.id,
            annee,
            mois,
            cotisationMensuelle,
            `${annee}-${mois.toString().padStart(2, '0')}-12`
          ]);
          totalCotisations++;
        }
      }

      await client.query('COMMIT');

      res.json({
        message: `Cotisations générées avec succès pour ${annee}`,
        nombre_membres: membresResult.rows.length,
        total_cotisations: totalCotisations
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Erreur génération cotisations:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;