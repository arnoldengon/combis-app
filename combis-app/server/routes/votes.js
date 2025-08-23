const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const voteService = require('../services/voteService');

const router = express.Router();

// Créer un nouveau vote (admin/trésorier)
router.post('/', [
  authenticateToken,
  requireRole(['admin', 'tresorier']),
  body('objet_type').isIn(['sinistre', 'membre', 'decision']).withMessage('Type d\'objet invalide'),
  body('objet_id').isInt().withMessage('ID objet requis'),
  body('titre').notEmpty().withMessage('Titre requis'),
  body('description').notEmpty().withMessage('Description requise'),
  body('type_vote').optional().isIn(['simple_majorite', 'majorite_qualifiee', 'unanimite', 'quorum']),
  body('duree_heures').optional().isInt({ min: 1, max: 168 }),
  body('quorum_requis').optional().isInt({ min: 1 }),
  body('membres_eligibles').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      objet_type,
      objet_id,
      titre,
      description,
      type_vote = 'simple_majorite',
      duree_heures = 72,
      quorum_requis = null,
      membres_eligibles = null
    } = req.body;

    const vote = await voteService.creerVote({
      objet_type,
      objet_id,
      titre,
      description,
      type_vote,
      duree_heures,
      quorum_requis,
      cree_par: req.user.id,
      membres_eligibles
    });

    res.status(201).json({
      message: 'Vote créé avec succès',
      vote: {
        id: vote.id,
        titre: vote.titre,
        date_fin: vote.date_fin,
        quorum_requis: vote.quorum_requis,
        nombre_eligibles: vote.nombre_eligibles
      }
    });

  } catch (error) {
    console.error('Erreur création vote:', error);
    res.status(500).json({ message: 'Erreur lors de la création du vote' });
  }
});

// Obtenir la liste des votes
router.get('/', [authenticateToken], async (req, res) => {
  try {
    const {
      statut = 'all',
      objet_type = 'all',
      page = 1,
      limit = 20
    } = req.query;

    const result = await voteService.getVotes({
      statut,
      objet_type,
      page: parseInt(page),
      limit: parseInt(limit),
      membre_id: req.user.id
    });

    res.json(result);

  } catch (error) {
    console.error('Erreur récupération votes:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les détails d'un vote
router.get('/:id', [authenticateToken], async (req, res) => {
  try {
    const { id } = req.params;

    const vote = await voteService.getVoteDetails(parseInt(id), req.user.id);

    if (!vote) {
      return res.status(404).json({ message: 'Vote non trouvé' });
    }

    res.json({ vote });

  } catch (error) {
    console.error('Erreur récupération vote:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Voter
router.post('/:id/voter', [
  authenticateToken,
  body('reponse').isIn(['pour', 'contre', 'abstention']).withMessage('Réponse invalide'),
  body('commentaire').optional().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { reponse, commentaire = null } = req.body;

    await voteService.voter(parseInt(id), req.user.id, reponse, commentaire);

    res.json({ message: 'Vote enregistré avec succès' });

  } catch (error) {
    console.error('Erreur vote:', error);
    if (error.message === 'Vote non trouvé ou fermé' || error.message === 'Vous avez déjà voté') {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Erreur lors du vote' });
    }
  }
});

// Obtenir les réponses d'un vote (détaillées pour admin/trésorier)
router.get('/:id/reponses', [
  authenticateToken,
  requireRole(['admin', 'tresorier'])
], async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        rv.*,
        m.nom_complet,
        TO_CHAR(rv.date_reponse, 'DD/MM/YYYY HH24:MI') as date_reponse_formatted
      FROM reponses_votes rv
      JOIN membres m ON rv.membre_id = m.id
      WHERE rv.vote_id = $1
      ORDER BY rv.date_reponse DESC
    `, [id]);

    res.json({ reponses: result.rows });

  } catch (error) {
    console.error('Erreur récupération réponses vote:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Fermer manuellement un vote (admin seulement)
router.patch('/:id/fermer', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { id } = req.params;

    const resultat = await voteService.verifierEtFermerVote(parseInt(id));

    res.json({
      message: 'Vote fermé',
      statut: resultat
    });

  } catch (error) {
    console.error('Erreur fermeture vote:', error);
    res.status(500).json({ message: 'Erreur lors de la fermeture du vote' });
  }
});

// Obtenir les votes concernant un objet spécifique
router.get('/objet/:type/:id', [authenticateToken], async (req, res) => {
  try {
    const { type, id } = req.params;

    const result = await pool.query(`
      SELECT v.*,
             createur.nom_complet as cree_par_nom,
             COUNT(DISTINCT rv.id) as total_votes,
             COUNT(CASE WHEN rv.reponse = 'pour' THEN 1 END) as votes_pour,
             COUNT(CASE WHEN rv.reponse = 'contre' THEN 1 END) as votes_contre,
             TO_CHAR(v.date_debut, 'DD/MM/YYYY HH24:MI') as date_debut_formatted,
             TO_CHAR(v.date_fin, 'DD/MM/YYYY HH24:MI') as date_fin_formatted
      FROM votes v
      JOIN membres createur ON v.cree_par = createur.id
      LEFT JOIN reponses_votes rv ON v.id = rv.vote_id
      WHERE v.objet_type = $1 AND v.objet_id = $2
      GROUP BY v.id, createur.nom_complet
      ORDER BY v.date_debut DESC
    `, [type, id]);

    res.json({
      votes: result.rows.map(vote => ({
        ...vote,
        est_expire: new Date() > new Date(vote.date_fin)
      }))
    });

  } catch (error) {
    console.error('Erreur récupération votes objet:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir mes votes (votes où j'ai participé)
router.get('/mes-votes/participation', [authenticateToken], async (req, res) => {
  try {
    const { statut = 'all', page = 1, limit = 20 } = req.query;

    let whereClause = 'WHERE rv.membre_id = $1';
    const params = [req.user.id];
    let paramCount = 1;

    if (statut !== 'all') {
      paramCount++;
      whereClause += ` AND v.statut = $${paramCount}`;
      params.push(statut);
    }

    const offset = (page - 1) * limit;

    const query = `
      SELECT v.*,
             rv.reponse as ma_reponse,
             rv.commentaire as mon_commentaire,
             rv.date_reponse as ma_date_reponse,
             createur.nom_complet as cree_par_nom,
             COUNT(DISTINCT all_rv.id) as total_votes,
             COUNT(CASE WHEN all_rv.reponse = 'pour' THEN 1 END) as votes_pour,
             COUNT(CASE WHEN all_rv.reponse = 'contre' THEN 1 END) as votes_contre,
             TO_CHAR(v.date_debut, 'DD/MM/YYYY HH24:MI') as date_debut_formatted,
             TO_CHAR(v.date_fin, 'DD/MM/YYYY HH24:MI') as date_fin_formatted,
             TO_CHAR(rv.date_reponse, 'DD/MM/YYYY HH24:MI') as ma_date_reponse_formatted
      FROM reponses_votes rv
      JOIN votes v ON rv.vote_id = v.id
      JOIN membres createur ON v.cree_par = createur.id
      LEFT JOIN reponses_votes all_rv ON v.id = all_rv.vote_id
      ${whereClause}
      GROUP BY v.id, rv.reponse, rv.commentaire, rv.date_reponse, createur.nom_complet
      ORDER BY rv.date_reponse DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    // Compter le total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM reponses_votes rv
      JOIN votes v ON rv.vote_id = v.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, paramCount));

    res.json({
      votes: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur récupération mes votes:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les statistiques des votes (admin/trésorier)
router.get('/stats/general', [
  authenticateToken,
  requireRole(['admin', 'tresorier'])
], async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;

    const stats = await voteService.getStatistiques({
      date_debut,
      date_fin
    });

    // Statistiques de participation par membre
    const participationResult = await pool.query(`
      SELECT 
        m.nom_complet,
        COUNT(rv.id) as votes_participes,
        COUNT(CASE WHEN rv.reponse = 'pour' THEN 1 END) as votes_pour,
        COUNT(CASE WHEN rv.reponse = 'contre' THEN 1 END) as votes_contre,
        COUNT(CASE WHEN rv.reponse = 'abstention' THEN 1 END) as votes_abstention
      FROM membres m
      LEFT JOIN reponses_votes rv ON m.id = rv.membre_id
      WHERE m.statut = 'actif'
      GROUP BY m.id, m.nom_complet
      ORDER BY votes_participes DESC
      LIMIT 10
    `);

    res.json({
      ...stats,
      top_participants: participationResult.rows
    });

  } catch (error) {
    console.error('Erreur statistiques votes:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Tâche de maintenance: fermer les votes expirés
router.post('/maintenance/fermer-expires', [
  authenticateToken,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const resultats = await voteService.fermerVotesExpires();

    res.json({
      message: `${resultats.length} vote(s) fermé(s)`,
      details: resultats
    });

  } catch (error) {
    console.error('Erreur fermeture votes expirés:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les configurations de vote
router.get('/config/types', [authenticateToken], (req, res) => {
  const typesVote = [
    { value: 'simple_majorite', label: 'Majorité simple (>50%)', description: 'Plus de la moitié des votes' },
    { value: 'majorite_qualifiee', label: 'Majorité qualifiée (≥2/3)', description: 'Au moins 2/3 des votes' },
    { value: 'unanimite', label: 'Unanimité (100%)', description: 'Tous les votes doivent être pour' },
    { value: 'quorum', label: 'Quorum personnalisé', description: 'Nombre de votes minimum défini' }
  ];

  const objetsVote = [
    { value: 'sinistre', label: 'Sinistre', description: 'Validation d\'un sinistre' },
    { value: 'membre', label: 'Membre', description: 'Décision concernant un membre' },
    { value: 'decision', label: 'Décision générale', description: 'Décision d\'assemblée ou de groupe' }
  ];

  res.json({
    types_vote: typesVote,
    objets_vote: objetsVote
  });
});

module.exports = router;