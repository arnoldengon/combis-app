const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token d\'accès requis' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Vérifier que l'utilisateur existe toujours
    const result = await pool.query(
      'SELECT id, nom_complet, statut FROM membres WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Utilisateur non trouvé' });
    }

    const user = result.rows[0];
    if (user.statut !== 'actif') {
      return res.status(401).json({ message: 'Compte suspendu ou inactif' });
    }

    req.user = {
      id: user.id,
      nom_complet: user.nom_complet,
      roles: decoded.roles || []
    };

    next();
  } catch (error) {
    console.error('Erreur authentification:', error);
    return res.status(403).json({ message: 'Token invalide' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const hasRole = roles.some(role => req.user.roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ message: 'Permissions insuffisantes' });
    }

    next();
  };
};

module.exports = { authenticateToken, requireRole };