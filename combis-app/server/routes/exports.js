const express = require('express');
const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { authenticateToken, requireRole } = require('../middleware/auth');
const exportService = require('../services/exportService');

const router = express.Router();

// Exporter la liste des membres
router.post('/membres', [
  authenticateToken,
  requireRole(['admin', 'tresorier']),
  body('format').isIn(['pdf', 'excel']).withMessage('Format invalide'),
  body('statut').optional().isIn(['all', 'actif', 'inactif', 'suspendu']),
  body('includeStats').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { format, statut = 'all', includeStats = false } = req.body;

    const result = await exportService.exporterMembres(format, {
      statut,
      includeStats
    });

    res.json({
      message: 'Export généré avec succès',
      ...result
    });

  } catch (error) {
    console.error('Erreur export membres:', error);
    res.status(500).json({ message: 'Erreur lors de la génération de l\'export' });
  }
});

// Exporter les cotisations
router.post('/cotisations', [
  authenticateToken,
  requireRole(['admin', 'tresorier']),
  body('format').isIn(['pdf', 'excel']).withMessage('Format invalide'),
  body('annee').optional().isInt({ min: 2020, max: 2030 }),
  body('mois').optional().isInt({ min: 1, max: 12 }),
  body('statut').optional().isIn(['all', 'payee', 'impayee', 'en_retard']),
  body('membre_id').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      format, 
      annee = new Date().getFullYear(), 
      mois = null, 
      statut = 'all',
      membre_id = null 
    } = req.body;

    const result = await exportService.exporterCotisations(format, {
      annee,
      mois,
      statut,
      membre_id
    });

    res.json({
      message: 'Export généré avec succès',
      ...result
    });

  } catch (error) {
    console.error('Erreur export cotisations:', error);
    res.status(500).json({ message: 'Erreur lors de la génération de l\'export' });
  }
});

// Exporter les sinistres
router.post('/sinistres', [
  authenticateToken,
  requireRole(['admin', 'tresorier']),
  body('format').isIn(['pdf', 'excel']).withMessage('Format invalide'),
  body('annee').optional().isInt({ min: 2020, max: 2030 }),
  body('statut').optional().isIn(['all', 'en_attente', 'approuve', 'rejete', 'paye']),
  body('type_sinistre_id').optional().isInt(),
  body('membre_id').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      format, 
      annee = new Date().getFullYear(), 
      statut = 'all',
      type_sinistre_id = null,
      membre_id = null 
    } = req.body;

    const result = await exportService.exporterSinistres(format, {
      annee,
      statut,
      type_sinistre_id,
      membre_id
    });

    res.json({
      message: 'Export généré avec succès',
      ...result
    });

  } catch (error) {
    console.error('Erreur export sinistres:', error);
    res.status(500).json({ message: 'Erreur lors de la génération de l\'export' });
  }
});

// Générer rapport financier complet
router.post('/rapport-financier', [
  authenticateToken,
  requireRole(['admin', 'tresorier']),
  body('format').isIn(['pdf', 'excel']).withMessage('Format invalide'),
  body('annee').optional().isInt({ min: 2020, max: 2030 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { format, annee = new Date().getFullYear() } = req.body;

    const result = await exportService.genererRapportFinancier(format, {
      annee
    });

    res.json({
      message: 'Rapport financier généré avec succès',
      ...result
    });

  } catch (error) {
    console.error('Erreur rapport financier:', error);
    res.status(500).json({ message: 'Erreur lors de la génération du rapport' });
  }
});

// Télécharger un export
router.get('/download/:filename', [authenticateToken], async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validation du nom de fichier pour éviter les attaques de path traversal
    if (!/^[a-zA-Z0-9_-]+\.(pdf|xlsx)$/.test(filename)) {
      return res.status(400).json({ message: 'Nom de fichier invalide' });
    }

    const filepath = path.join(__dirname, '../uploads/exports', filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Fichier non trouvé' });
    }

    // Définir les headers appropriés
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Envoyer le fichier
    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Erreur téléchargement:', error);
    res.status(500).json({ message: 'Erreur lors du téléchargement' });
  }
});

// Lister les exports disponibles (admin/trésorier)
router.get('/liste', [authenticateToken, requireRole(['admin', 'tresorier'])], async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '../uploads/exports');
    
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ exports: [] });
    }

    const files = fs.readdirSync(uploadsDir);
    const exports = files
      .filter(file => file.match(/\.(pdf|xlsx)$/))
      .map(file => {
        const filepath = path.join(uploadsDir, file);
        const stats = fs.statSync(filepath);
        
        return {
          filename: file,
          size: stats.size,
          created_at: stats.mtime,
          created_at_formatted: stats.mtime.toLocaleDateString('fr-FR'),
          type: path.extname(file) === '.pdf' ? 'PDF' : 'Excel',
          download_url: `/api/exports/download/${file}`
        };
      })
      .sort((a, b) => b.created_at - a.created_at);

    res.json({ exports });

  } catch (error) {
    console.error('Erreur liste exports:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un export (admin)
router.delete('/:filename', [authenticateToken, requireRole(['admin'])], async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!/^[a-zA-Z0-9_-]+\.(pdf|xlsx)$/.test(filename)) {
      return res.status(400).json({ message: 'Nom de fichier invalide' });
    }

    const filepath = path.join(__dirname, '../uploads/exports', filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Fichier non trouvé' });
    }

    fs.unlinkSync(filepath);

    res.json({ message: 'Export supprimé avec succès' });

  } catch (error) {
    console.error('Erreur suppression export:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression' });
  }
});

// Nettoyer les anciens exports (admin)
router.post('/nettoyer', [authenticateToken, requireRole(['admin'])], async (req, res) => {
  try {
    const { ageMaxJours = 7 } = req.body;

    const result = await exportService.nettoyerAnciensExports(ageMaxJours);

    res.json({
      message: `${result.filesSupprimes} fichier(s) supprimé(s)`,
      files_supprimes: result.filesSupprimes
    });

  } catch (error) {
    console.error('Erreur nettoyage exports:', error);
    res.status(500).json({ message: 'Erreur lors du nettoyage' });
  }
});

// Obtenir les statistiques d'exports
router.get('/statistiques', [authenticateToken, requireRole(['admin', 'tresorier'])], async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '../uploads/exports');
    
    if (!fs.existsSync(uploadsDir)) {
      return res.json({
        total_fichiers: 0,
        taille_totale: 0,
        par_type: { pdf: 0, excel: 0 }
      });
    }

    const files = fs.readdirSync(uploadsDir);
    let tailleTotale = 0;
    const parType = { pdf: 0, excel: 0 };

    files.forEach(file => {
      if (file.match(/\.(pdf|xlsx)$/)) {
        const filepath = path.join(uploadsDir, file);
        const stats = fs.statSync(filepath);
        tailleTotale += stats.size;
        
        if (file.endsWith('.pdf')) {
          parType.pdf++;
        } else {
          parType.excel++;
        }
      }
    });

    res.json({
      total_fichiers: parType.pdf + parType.excel,
      taille_totale: tailleTotale,
      taille_totale_mo: Math.round(tailleTotale / (1024 * 1024) * 100) / 100,
      par_type: parType
    });

  } catch (error) {
    console.error('Erreur statistiques exports:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;