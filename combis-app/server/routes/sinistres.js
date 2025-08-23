const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Obtenir tous les sinistres
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      statut = 'all',
      type_sinistre_id,
      membre_id,
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
      conditions.push(`s.statut = $${paramCount}`);
      params.push(statut);
    }

    if (type_sinistre_id) {
      paramCount++;
      conditions.push(`s.type_sinistre_id = $${paramCount}`);
      params.push(type_sinistre_id);
    }

    if (membre_id) {
      paramCount++;
      conditions.push(`s.membre_id = $${paramCount}`);
      params.push(membre_id);
    }

    if (date_debut) {
      paramCount++;
      conditions.push(`s.date_sinistre >= $${paramCount}`);
      params.push(date_debut);
    }

    if (date_fin) {
      paramCount++;
      conditions.push(`s.date_sinistre <= $${paramCount}`);
      params.push(date_fin);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const query = `
      SELECT 
        s.*,
        m.nom_complet,
        m.telephone_1,
        ts.nom as type_sinistre_nom,
        ts.montant_couverture,
        ts.necessite_validation,
        approver.nom_complet as approuve_par_nom,
        TO_CHAR(s.date_sinistre, 'DD/MM/YYYY') as date_sinistre_formatted,
        TO_CHAR(s.date_declaration, 'DD/MM/YYYY') as date_declaration_formatted,
        TO_CHAR(s.date_approbation, 'DD/MM/YYYY') as date_approbation_formatted,
        TO_CHAR(s.date_paiement, 'DD/MM/YYYY') as date_paiement_formatted
      FROM sinistres s
      JOIN membres m ON s.membre_id = m.id
      JOIN types_sinistres ts ON s.type_sinistre_id = ts.id
      LEFT JOIN membres approver ON s.approuve_par = approver.id
      ${whereClause}
      ORDER BY s.date_declaration DESC, s.id DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    // Compter le total
    const countQuery = `
      SELECT COUNT(s.id) as total
      FROM sinistres s
      JOIN membres m ON s.membre_id = m.id
      JOIN types_sinistres ts ON s.type_sinistre_id = ts.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, paramCount));

    res.json({
      sinistres: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur récupération sinistres:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les types de sinistres
router.get('/types', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM types_sinistres ORDER BY montant_couverture DESC'
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Erreur récupération types sinistres:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Déclarer un nouveau sinistre
router.post('/', [
  authenticateToken,
  body('type_sinistre_id').isInt().withMessage('Type de sinistre requis'),
  body('date_sinistre').isISO8601().withMessage('Date de sinistre invalide'),
  body('description').notEmpty().withMessage('Description requise'),
  body('montant_demande').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      type_sinistre_id,
      date_sinistre,
      description,
      montant_demande
    } = req.body;

    const membre_id = req.user.id;

    // Vérifier que le membre est à jour de ses cotisations
    const cotisationCheck = await pool.query(`
      SELECT COUNT(*) as retards
      FROM cotisations c
      WHERE c.membre_id = $1 
        AND c.statut = 'impayee' 
        AND c.date_echeance < $2
    `, [membre_id, date_sinistre]);

    if (parseInt(cotisationCheck.rows[0].retards) > 0) {
      return res.status(400).json({ 
        message: 'Vous devez être à jour de vos cotisations pour déclarer un sinistre' 
      });
    }

    // Récupérer les informations du type de sinistre
    const typeSinistreResult = await pool.query(
      'SELECT * FROM types_sinistres WHERE id = $1',
      [type_sinistre_id]
    );

    if (typeSinistreResult.rows.length === 0) {
      return res.status(404).json({ message: 'Type de sinistre non trouvé' });
    }

    const typeSinistre = typeSinistreResult.rows[0];
    const montantFinal = montant_demande || typeSinistre.montant_couverture;

    // Insérer le sinistre
    const insertQuery = `
      INSERT INTO sinistres (
        membre_id, 
        type_sinistre_id, 
        date_sinistre, 
        description, 
        montant_demande,
        statut
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const result = await pool.query(insertQuery, [
      membre_id,
      type_sinistre_id,
      date_sinistre,
      description,
      montantFinal,
      typeSinistre.necessite_validation ? 'en_attente' : 'approuve'
    ]);

    const sinistreId = result.rows[0].id;

    // Si pas besoin de validation, approuver automatiquement
    if (!typeSinistre.necessite_validation) {
      await pool.query(`
        UPDATE sinistres 
        SET montant_approuve = $1, date_approbation = CURRENT_DATE
        WHERE id = $2
      `, [montantFinal, sinistreId]);
    }

    res.status(201).json({
      message: 'Sinistre déclaré avec succès',
      sinistre_id: sinistreId,
      necessite_validation: typeSinistre.necessite_validation
    });

  } catch (error) {
    console.error('Erreur déclaration sinistre:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Approuver/rejeter un sinistre (admin/trésorier)
router.patch('/:id/statut', [
  authenticateToken,
  requireRole(['admin', 'tresorier']),
  body('statut').isIn(['approuve', 'rejete']).withMessage('Statut invalide'),
  body('montant_approuve').optional().isInt({ min: 0 }),
  body('motif_rejet').optional().isString(),
  body('remarques').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { statut, montant_approuve, motif_rejet, remarques } = req.body;

    // Vérifier que le sinistre existe
    const sinistreResult = await pool.query(`
      SELECT s.*, m.nom_complet, ts.nom as type_nom
      FROM sinistres s
      JOIN membres m ON s.membre_id = m.id
      JOIN types_sinistres ts ON s.type_sinistre_id = ts.id
      WHERE s.id = $1
    `, [id]);

    if (sinistreResult.rows.length === 0) {
      return res.status(404).json({ message: 'Sinistre non trouvé' });
    }

    const sinistre = sinistreResult.rows[0];

    if (sinistre.statut !== 'en_attente') {
      return res.status(400).json({ message: 'Ce sinistre a déjà été traité' });
    }

    // Mettre à jour le sinistre
    const updateQuery = `
      UPDATE sinistres 
      SET 
        statut = $1,
        montant_approuve = $2,
        motif_rejet = $3,
        remarques = $4,
        date_approbation = CURRENT_DATE,
        approuve_par = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `;

    await pool.query(updateQuery, [
      statut,
      statut === 'approuve' ? (montant_approuve || sinistre.montant_demande) : null,
      statut === 'rejete' ? motif_rejet : null,
      remarques,
      req.user.id,
      id
    ]);

    const action = statut === 'approuve' ? 'approuvé' : 'rejeté';
    res.json({
      message: `Sinistre ${action} pour ${sinistre.nom_complet} - ${sinistre.type_nom}`,
      sinistre_id: id
    });

  } catch (error) {
    console.error('Erreur traitement sinistre:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Enregistrer le paiement d'un sinistre (admin/trésorier)
router.post('/:id/paiement', [
  authenticateToken,
  requireRole(['admin', 'tresorier']),
  body('montant').isInt({ min: 1 }).withMessage('Montant requis'),
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
      montant,
      mode_paiement,
      reference_paiement,
      date_paiement = new Date().toISOString().split('T')[0]
    } = req.body;

    // Vérifier que le sinistre peut être payé
    const sinistreResult = await pool.query(`
      SELECT s.*, m.nom_complet
      FROM sinistres s
      JOIN membres m ON s.membre_id = m.id
      WHERE s.id = $1 AND s.statut = 'approuve'
    `, [id]);

    if (sinistreResult.rows.length === 0) {
      return res.status(404).json({ message: 'Sinistre non trouvé ou non approuvé' });
    }

    const sinistre = sinistreResult.rows[0];

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Mettre à jour le sinistre
      await client.query(`
        UPDATE sinistres 
        SET statut = 'paye', date_paiement = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [date_paiement, id]);

      // Enregistrer le paiement
      await client.query(`
        INSERT INTO paiements_sinistres (
          sinistre_id, 
          montant, 
          date_paiement, 
          mode_paiement, 
          reference_paiement, 
          effectue_par
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [id, montant, date_paiement, mode_paiement, reference_paiement, req.user.id]);

      await client.query('COMMIT');

      res.json({
        message: `Paiement enregistré pour ${sinistre.nom_complet} - ${montant} FCFA`,
        sinistre_id: id
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Erreur paiement sinistre:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir un sinistre spécifique avec détails
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        s.*,
        m.nom_complet,
        m.telephone_1,
        m.telephone_2,
        ts.nom as type_sinistre_nom,
        ts.montant_couverture,
        ts.necessite_validation,
        approver.nom_complet as approuve_par_nom,
        TO_CHAR(s.date_sinistre, 'DD/MM/YYYY') as date_sinistre_formatted,
        TO_CHAR(s.date_declaration, 'DD/MM/YYYY') as date_declaration_formatted,
        TO_CHAR(s.date_approbation, 'DD/MM/YYYY') as date_approbation_formatted,
        TO_CHAR(s.date_paiement, 'DD/MM/YYYY') as date_paiement_formatted
      FROM sinistres s
      JOIN membres m ON s.membre_id = m.id
      JOIN types_sinistres ts ON s.type_sinistre_id = ts.id
      LEFT JOIN membres approver ON s.approuve_par = approver.id
      WHERE s.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sinistre non trouvé' });
    }

    // Récupérer les paiements associés
    const paiementsQuery = `
      SELECT 
        ps.*,
        m.nom_complet as effectue_par_nom,
        TO_CHAR(ps.date_paiement, 'DD/MM/YYYY') as date_paiement_formatted
      FROM paiements_sinistres ps
      JOIN membres m ON ps.effectue_par = m.id
      WHERE ps.sinistre_id = $1
      ORDER BY ps.date_paiement DESC
    `;

    const paiementsResult = await pool.query(paiementsQuery, [id]);

    res.json({
      sinistre: result.rows[0],
      paiements: paiementsResult.rows
    });

  } catch (error) {
    console.error('Erreur récupération sinistre:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Statistiques des sinistres
router.get('/stats/resume', authenticateToken, async (req, res) => {
  try {
    const { annee = new Date().getFullYear() } = req.query;

    const statsQuery = `
      SELECT 
        COUNT(s.id) as total_sinistres,
        COUNT(CASE WHEN s.statut = 'en_attente' THEN 1 END) as en_attente,
        COUNT(CASE WHEN s.statut = 'approuve' THEN 1 END) as approuves,
        COUNT(CASE WHEN s.statut = 'rejete' THEN 1 END) as rejetes,
        COUNT(CASE WHEN s.statut = 'paye' THEN 1 END) as payes,
        COALESCE(SUM(CASE WHEN s.statut = 'paye' THEN s.montant_approuve ELSE 0 END), 0) as montant_paye,
        COALESCE(SUM(CASE WHEN s.statut = 'approuve' THEN s.montant_approuve ELSE 0 END), 0) as montant_a_payer,
        COALESCE(AVG(CASE WHEN s.statut = 'paye' THEN s.montant_approuve END), 0) as montant_moyen
      FROM sinistres s
      WHERE EXTRACT(YEAR FROM s.date_sinistre) = $1
    `;

    const statsResult = await pool.query(statsQuery, [annee]);

    // Statistiques par type
    const typeStatsQuery = `
      SELECT 
        ts.nom,
        ts.montant_couverture,
        COUNT(s.id) as nombre,
        COALESCE(SUM(CASE WHEN s.statut = 'paye' THEN s.montant_approuve ELSE 0 END), 0) as montant_paye
      FROM types_sinistres ts
      LEFT JOIN sinistres s ON ts.id = s.type_sinistre_id AND EXTRACT(YEAR FROM s.date_sinistre) = $1
      GROUP BY ts.id, ts.nom, ts.montant_couverture
      ORDER BY nombre DESC
    `;

    const typeStatsResult = await pool.query(typeStatsQuery, [annee]);

    res.json({
      statistiques_generales: statsResult.rows[0],
      statistiques_par_type: typeStatsResult.rows
    });

  } catch (error) {
    console.error('Erreur statistiques sinistres:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;