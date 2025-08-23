const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Connexion
router.post('/login', [
  body('telephone').notEmpty().withMessage('Téléphone requis'),
  body('password').notEmpty().withMessage('Mot de passe requis')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { telephone, password } = req.body;

    // Rechercher le membre par téléphone
    const memberQuery = `
      SELECT m.*, COALESCE(array_agg(r.nom) FILTER (WHERE r.nom IS NOT NULL), ARRAY[]::VARCHAR[]) as roles
      FROM membres m
      LEFT JOIN membre_roles mr ON m.id = mr.membre_id
      LEFT JOIN roles r ON mr.role_id = r.id
      WHERE (m.telephone_1 = $1 OR m.telephone_2 = $1) AND m.statut = 'actif'
      GROUP BY m.id
    `;
    
    const result = await pool.query(memberQuery, [telephone]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Téléphone ou mot de passe incorrect' });
    }

    const member = result.rows[0];

    // Pour la première connexion, utiliser la date de naissance comme mot de passe temporaire
    // Format: DDMMYYYY (ex: 02061992 pour 02/06/1992)
    const tempPassword = member.date_naissance.toISOString().split('T')[0].replace(/-/g, '').slice(6) + 
                         member.date_naissance.toISOString().split('T')[0].replace(/-/g, '').slice(4, 6) + 
                         member.date_naissance.toISOString().split('T')[0].replace(/-/g, '').slice(0, 4);
    
    let isValidPassword = false;
    
    if (member.mot_de_passe) {
      // Vérifier avec le mot de passe hashé
      isValidPassword = await bcrypt.compare(password, member.mot_de_passe);
    } else {
      // Première connexion avec date de naissance
      isValidPassword = password === tempPassword;
    }

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Téléphone ou mot de passe incorrect' });
    }

    // Générer le token JWT
    const token = jwt.sign(
      { 
        userId: member.id,
        telephone: member.telephone_1,
        roles: member.roles
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      token,
      user: {
        id: member.id,
        nom_complet: member.nom_complet,
        telephone: member.telephone_1,
        roles: member.roles,
        premiere_connexion: !member.mot_de_passe
      }
    });

  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Changer le mot de passe (première connexion)
router.post('/change-password', [
  authenticateToken,
  body('nouveauMotDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nouveauMotDePasse } = req.body;
    const hashedPassword = await bcrypt.hash(nouveauMotDePasse, 12);

    await pool.query(
      'UPDATE membres SET mot_de_passe = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    res.json({ message: 'Mot de passe mis à jour avec succès' });

  } catch (error) {
    console.error('Erreur changement mot de passe:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Vérifier le token
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.id, m.nom_complet, m.telephone_1, m.statut,
             COALESCE(array_agg(r.nom) FILTER (WHERE r.nom IS NOT NULL), ARRAY[]::VARCHAR[]) as roles
      FROM membres m
      LEFT JOIN membre_roles mr ON m.id = mr.membre_id
      LEFT JOIN roles r ON mr.role_id = r.id
      WHERE m.id = $1 AND m.statut = 'actif'
      GROUP BY m.id, m.nom_complet, m.telephone_1, m.statut
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Utilisateur non trouvé' });
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        nom_complet: user.nom_complet,
        telephone: user.telephone_1,
        roles: user.roles
      }
    });

  } catch (error) {
    console.error('Erreur vérification token:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Déconnexion
router.post('/logout', authenticateToken, (req, res) => {
  // Dans une implémentation complète, on pourrait blacklister le token
  res.json({ message: 'Déconnexion réussie' });
});

module.exports = router;