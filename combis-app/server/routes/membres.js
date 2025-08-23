const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Obtenir tous les membres
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', statut = 'all' } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereClause += `WHERE (m.nom_complet ILIKE $${paramCount} OR m.telephone_1 LIKE $${paramCount} OR m.profession ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (statut !== 'all') {
      paramCount++;
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += `m.statut = $${paramCount}`;
      params.push(statut);
    }

    const query = `
      SELECT 
        m.*,
        COALESCE(array_agg(r.nom) FILTER (WHERE r.nom IS NOT NULL), ARRAY[]::VARCHAR[]) as roles,
        COALESCE(SUM(CASE WHEN c.statut = 'payee' THEN c.montant_mensuel ELSE 0 END), 0) as total_paye,
        COALESCE(SUM(CASE WHEN c.statut = 'impayee' THEN c.montant_mensuel ELSE 0 END), 0) as total_impaye,
        COUNT(s.id) as nombre_sinistres
      FROM membres m
      LEFT JOIN membre_roles mr ON m.id = mr.membre_id
      LEFT JOIN roles r ON mr.role_id = r.id
      LEFT JOIN cotisations c ON m.id = c.membre_id AND c.annee = EXTRACT(YEAR FROM CURRENT_DATE)
      LEFT JOIN sinistres s ON m.id = s.membre_id
      ${whereClause}
      GROUP BY m.id
      ORDER BY m.nom_complet
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    // Compter le total pour la pagination
    const countQuery = `
      SELECT COUNT(DISTINCT m.id) as total
      FROM membres m
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, paramCount));

    res.json({
      membres: result.rows.map(membre => ({
        ...membre,
        date_naissance: membre.date_naissance.toISOString().split('T')[0],
        cotisation_mensuelle: Math.round(membre.cotisation_annuelle / 12)
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur récupération membres:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir un membre par ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        m.*,
        COALESCE(array_agg(r.nom) FILTER (WHERE r.nom IS NOT NULL), ARRAY[]::VARCHAR[]) as roles
      FROM membres m
      LEFT JOIN membre_roles mr ON m.id = mr.membre_id
      LEFT JOIN roles r ON mr.role_id = r.id
      WHERE m.id = $1
      GROUP BY m.id
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Membre non trouvé' });
    }

    const membre = result.rows[0];
    membre.date_naissance = membre.date_naissance.toISOString().split('T')[0];

    res.json(membre);

  } catch (error) {
    console.error('Erreur récupération membre:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Ajouter un nouveau membre (admin seulement)
router.post('/', [
  authenticateToken,
  requireRole(['admin']),
  body('nom').notEmpty().withMessage('Nom requis'),
  body('prenom').notEmpty().withMessage('Prénom requis'),
  body('date_naissance').isISO8601().withMessage('Date de naissance invalide'),
  body('telephone_1').notEmpty().withMessage('Téléphone principal requis'),
  body('profession').optional(),
  body('cotisation_annuelle').isInt({ min: 1 }).withMessage('Cotisation annuelle requise')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      nom,
      prenom,
      date_naissance,
      telephone_1,
      telephone_2,
      email,
      profession,
      cotisation_annuelle
    } = req.body;

    const nom_complet = `${nom} ${prenom}`;

    // Vérifier que le téléphone n'existe pas déjà
    const existingQuery = `
      SELECT id FROM membres 
      WHERE telephone_1 = $1 OR telephone_2 = $1 
      ${telephone_2 ? 'OR telephone_1 = $2 OR telephone_2 = $2' : ''}
    `;
    const existingParams = telephone_2 ? [telephone_1, telephone_2] : [telephone_1];
    const existingResult = await pool.query(existingQuery, existingParams);

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ message: 'Ce numéro de téléphone est déjà utilisé' });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insérer le membre
      const insertQuery = `
        INSERT INTO membres (nom, prenom, nom_complet, date_naissance, telephone_1, telephone_2, email, profession, cotisation_annuelle)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;
      
      const insertResult = await client.query(insertQuery, [
        nom, prenom, nom_complet, date_naissance, telephone_1, telephone_2, email, profession, cotisation_annuelle
      ]);

      const membreId = insertResult.rows[0].id;

      // Attribuer le rôle "membre" par défaut
      await client.query(
        'INSERT INTO membre_roles (membre_id, role_id) VALUES ($1, (SELECT id FROM roles WHERE nom = $2))',
        [membreId, 'membre']
      );

      // Créer les cotisations pour l'année en cours
      const anneeActuelle = new Date().getFullYear();
      const cotisationMensuelle = Math.round(cotisation_annuelle / 12);

      for (let mois = 1; mois <= 12; mois++) {
        await client.query(`
          INSERT INTO cotisations (membre_id, annee, mois, montant_mensuel, date_echeance)
          VALUES ($1, $2, $3, $4, $5)
        `, [membreId, anneeActuelle, mois, cotisationMensuelle, `${anneeActuelle}-${mois.toString().padStart(2, '0')}-12`]);
      }

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Membre ajouté avec succès',
        membre_id: membreId
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Erreur ajout membre:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Modifier un membre (admin seulement)
router.put('/:id', [
  authenticateToken,
  requireRole(['admin']),
  body('nom').optional().notEmpty(),
  body('prenom').optional().notEmpty(),
  body('date_naissance').optional().isISO8601(),
  body('telephone_1').optional().notEmpty(),
  body('cotisation_annuelle').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateFields = req.body;

    // Construire la requête de mise à jour dynamiquement
    const fields = Object.keys(updateFields).filter(key => updateFields[key] !== undefined);
    
    if (fields.length === 0) {
      return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
    }

    // Mettre à jour nom_complet si nom ou prenom change
    if (updateFields.nom || updateFields.prenom) {
      const currentMember = await pool.query('SELECT nom, prenom FROM membres WHERE id = $1', [id]);
      if (currentMember.rows.length > 0) {
        const { nom: currentNom, prenom: currentPrenom } = currentMember.rows[0];
        updateFields.nom_complet = `${updateFields.nom || currentNom} ${updateFields.prenom || currentPrenom}`;
        fields.push('nom_complet');
      }
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = [id, ...fields.map(field => updateFields[field])];

    const query = `
      UPDATE membres 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Membre non trouvé' });
    }

    res.json({
      message: 'Membre mis à jour avec succès',
      membre: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur modification membre:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Suspendre/activer un membre (admin seulement)
router.patch('/:id/statut', [
  authenticateToken,
  requireRole(['admin']),
  body('statut').isIn(['actif', 'inactif', 'suspendu']).withMessage('Statut invalide')
], async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    const result = await pool.query(
      'UPDATE membres SET statut = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING nom_complet',
      [statut, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Membre non trouvé' });
    }

    res.json({
      message: `Statut du membre ${result.rows[0].nom_complet} mis à jour: ${statut}`
    });

  } catch (error) {
    console.error('Erreur changement statut:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir le statut de cotisation d'un membre
router.get('/:id/statut-cotisation', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const annee = req.query.annee || new Date().getFullYear();

    const query = `
      SELECT 
        m.nom_complet,
        m.cotisation_annuelle,
        COUNT(c.id) as total_mois,
        COUNT(CASE WHEN c.statut = 'payee' THEN 1 END) as mois_payes,
        COUNT(CASE WHEN c.statut = 'impayee' AND c.date_echeance < CURRENT_DATE THEN 1 END) as mois_en_retard,
        COALESCE(SUM(CASE WHEN c.statut = 'payee' THEN c.montant_mensuel ELSE 0 END), 0) as total_paye,
        COALESCE(SUM(CASE WHEN c.statut = 'impayee' THEN c.montant_mensuel ELSE 0 END), 0) as total_impaye
      FROM membres m
      LEFT JOIN cotisations c ON m.id = c.membre_id AND c.annee = $2
      WHERE m.id = $1
      GROUP BY m.id, m.nom_complet, m.cotisation_annuelle
    `;

    const result = await pool.query(query, [id, annee]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Membre non trouvé' });
    }

    const statut = result.rows[0];
    const estAJour = statut.mois_en_retard === '0';

    res.json({
      ...statut,
      est_a_jour: estAJour,
      pourcentage_paye: statut.total_mois > 0 ? Math.round((statut.mois_payes / statut.total_mois) * 100) : 0
    });

  } catch (error) {
    console.error('Erreur statut cotisation:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;