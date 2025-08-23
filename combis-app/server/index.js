const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Initialiser les services
const notificationService = require('./services/notificationService');
notificationService.init(server);

// Middleware de sécurité
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limite chaque IP à 100 requêtes par fenêtre de 15min
});
app.use(limiter);

// Middleware
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/membres', require('./routes/membres'));
app.use('/api/cotisations', require('./routes/cotisations'));
app.use('/api/sinistres', require('./routes/sinistres'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/exports', require('./routes/exports'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/votes', require('./routes/votes'));
app.use('/api/reunions', require('./routes/reunions'));

// Route de base
app.get('/', (req, res) => {
  res.json({ 
    message: 'API LES COMBIS - Système d\'assistance solidaire',
    version: '1.0.0',
    status: 'active'
  });
});

// Gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route non trouvée' });
});

// Middleware de gestion d'erreurs global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Erreur serveur interne',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Serveur COMBIS démarré sur le port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`WebSocket activé pour les notifications temps réel`);
});