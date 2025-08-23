const express = require('express');
const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { authenticateToken, requireRole } = require('../middleware/auth');
const uploadService = require('../services/uploadService');

const router = express.Router();

// Upload d'un document
router.post('/upload', [
  authenticateToken,
  uploadService.getUploadSingle('document')
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    // Valider le fichier
    const validationErrors = uploadService.validateFile(req.file);
    if (validationErrors.length > 0) {
      // Supprimer le fichier uploadé en cas d'erreur
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ errors: validationErrors });
    }

    const {
      type_document = 'autre',
      description = '',
      membre_id = req.user.id,
      sinistre_id = null
    } = req.body;

    // Vérifier les permissions
    if (membre_id !== req.user.id && !req.user.roles?.includes('admin') && !req.user.roles?.includes('tresorier')) {
      return res.status(403).json({ message: 'Permission refusée' });
    }

    // Enregistrer en base
    const document = await uploadService.enregistrerDocument(req.file, {
      membre_id: parseInt(membre_id),
      sinistre_id: sinistre_id ? parseInt(sinistre_id) : null,
      type_document,
      description,
      uploaded_by: req.user.id
    });

    res.json({
      message: 'Document uploadé avec succès',
      document: {
        id: document.id,
        nom_original: document.nom_original,
        type_document: document.type_document,
        taille_bytes: document.taille_bytes,
        created_at: document.created_at
      }
    });

  } catch (error) {
    console.error('Erreur upload document:', error);
    
    // Nettoyer le fichier en cas d'erreur
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ message: 'Erreur lors de l\'upload' });
  }
});

// Upload multiple de documents
router.post('/upload-multiple', [
  authenticateToken,
  uploadService.getUploadMultiple('documents', 5)
], async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    const {
      type_document = 'autre',
      description = '',
      membre_id = req.user.id,
      sinistre_id = null
    } = req.body;

    // Vérifier les permissions
    if (membre_id !== req.user.id && !req.user.roles?.includes('admin') && !req.user.roles?.includes('tresorier')) {
      // Nettoyer les fichiers
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      return res.status(403).json({ message: 'Permission refusée' });
    }

    // Valider tous les fichiers
    const validationErrors = [];
    req.files.forEach((file, index) => {
      const errors = uploadService.validateFile(file);
      if (errors.length > 0) {
        validationErrors.push(`Fichier ${index + 1}: ${errors.join(', ')}`);
      }
    });

    if (validationErrors.length > 0) {
      // Nettoyer les fichiers
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      return res.status(400).json({ errors: validationErrors });
    }

    // Enregistrer tous les documents
    const documents = await uploadService.enregistrerDocuments(req.files, {
      membre_id: parseInt(membre_id),
      sinistre_id: sinistre_id ? parseInt(sinistre_id) : null,
      type_document,
      description,
      uploaded_by: req.user.id
    });

    res.json({
      message: `${documents.length} document(s) uploadé(s) avec succès`,
      documents: documents.map(doc => ({
        id: doc.id,
        nom_original: doc.nom_original,
        type_document: doc.type_document,
        taille_bytes: doc.taille_bytes,
        created_at: doc.created_at
      }))
    });

  } catch (error) {
    console.error('Erreur upload documents multiples:', error);
    
    // Nettoyer les fichiers en cas d'erreur
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({ message: 'Erreur lors de l\'upload' });
  }
});

// Obtenir les documents d'un membre
router.get('/membre/:id', [authenticateToken], async (req, res) => {
  try {
    const { id } = req.params;
    const { type_document = 'all', page = 1, limit = 20 } = req.query;

    // Vérifier les permissions
    if (parseInt(id) !== req.user.id && !req.user.roles?.includes('admin') && !req.user.roles?.includes('tresorier')) {
      return res.status(403).json({ message: 'Permission refusée' });
    }

    const offset = (page - 1) * limit;
    const documents = await uploadService.getDocumentsMembre(parseInt(id), {
      type_document,
      limit: parseInt(limit),
      offset
    });

    res.json({ documents });

  } catch (error) {
    console.error('Erreur récupération documents membre:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les documents d'un sinistre
router.get('/sinistre/:id', [authenticateToken], async (req, res) => {
  try {
    const { id } = req.params;

    const documents = await uploadService.getDocumentsSinistre(parseInt(id));

    res.json({ documents });

  } catch (error) {
    console.error('Erreur récupération documents sinistre:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Télécharger un document
router.get('/download/:id', [authenticateToken], async (req, res) => {
  try {
    const { id } = req.params;

    const document = await uploadService.getDocumentById(parseInt(id), req.user.id);

    if (!document) {
      return res.status(404).json({ message: 'Document non trouvé' });
    }

    const filepath = document.chemin_fichier;
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Fichier physique non trouvé' });
    }

    // Définir les headers
    res.setHeader('Content-Type', document.type_mime);
    res.setHeader('Content-Disposition', `attachment; filename="${document.nom_original}"`);
    
    // Envoyer le fichier
    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Erreur téléchargement document:', error);
    if (error.message === 'Accès non autorisé à ce document') {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Erreur lors du téléchargement' });
    }
  }
});

// Prévisualiser un document (pour les images)
router.get('/preview/:id', [authenticateToken], async (req, res) => {
  try {
    const { id } = req.params;

    const document = await uploadService.getDocumentById(parseInt(id), req.user.id);

    if (!document) {
      return res.status(404).json({ message: 'Document non trouvé' });
    }

    // Vérifier que c'est une image
    if (!document.type_mime.startsWith('image/')) {
      return res.status(400).json({ message: 'Prévisualisation disponible uniquement pour les images' });
    }

    const filepath = document.chemin_fichier;
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Fichier physique non trouvé' });
    }

    res.setHeader('Content-Type', document.type_mime);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache 1h
    
    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Erreur prévisualisation document:', error);
    if (error.message === 'Accès non autorisé à ce document') {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Erreur lors de la prévisualisation' });
    }
  }
});

// Supprimer un document
router.delete('/:id', [authenticateToken], async (req, res) => {
  try {
    const { id } = req.params;

    await uploadService.supprimerDocument(parseInt(id), req.user.id);

    res.json({ message: 'Document supprimé avec succès' });

  } catch (error) {
    console.error('Erreur suppression document:', error);
    if (error.message === 'Document non trouvé' || error.message === 'Accès non autorisé à ce document') {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Erreur lors de la suppression' });
    }
  }
});

// Obtenir les informations d'un document
router.get('/:id', [authenticateToken], async (req, res) => {
  try {
    const { id } = req.params;

    const document = await uploadService.getDocumentById(parseInt(id), req.user.id);

    if (!document) {
      return res.status(404).json({ message: 'Document non trouvé' });
    }

    // Formater les informations à retourner
    const documentInfo = {
      id: document.id,
      nom_original: document.nom_original,
      type_document: document.type_document,
      description: document.description,
      taille_bytes: document.taille_bytes,
      taille_formatted: this.formatTaille(document.taille_bytes),
      type_mime: document.type_mime,
      proprietaire_nom: document.proprietaire_nom,
      uploaded_by_nom: document.uploaded_by_nom,
      created_at: document.created_at,
      sinistre_id: document.sinistre_id,
      can_preview: document.type_mime.startsWith('image/'),
      download_url: `/api/documents/download/${document.id}`,
      preview_url: document.type_mime.startsWith('image/') ? `/api/documents/preview/${document.id}` : null
    };

    res.json({ document: documentInfo });

  } catch (error) {
    console.error('Erreur récupération document:', error);
    if (error.message === 'Accès non autorisé à ce document') {
      res.status(403).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
});

// Obtenir tous les documents (admin/trésorier)
router.get('/', [authenticateToken, requireRole(['admin', 'tresorier'])], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type_document = 'all',
      membre_id,
      date_debut,
      date_fin
    } = req.query;

    let whereClause = 'WHERE d.statut = $1';
    const params = ['actif'];
    let paramCount = 1;

    if (type_document !== 'all') {
      paramCount++;
      whereClause += ` AND d.type_document = $${paramCount}`;
      params.push(type_document);
    }

    if (membre_id) {
      paramCount++;
      whereClause += ` AND d.membre_id = $${paramCount}`;
      params.push(parseInt(membre_id));
    }

    if (date_debut && date_fin) {
      paramCount += 2;
      whereClause += ` AND d.created_at BETWEEN $${paramCount - 1} AND $${paramCount}`;
      params.push(date_debut, date_fin);
    }

    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        d.*,
        m.nom_complet as proprietaire_nom,
        uploader.nom_complet as uploaded_by_nom,
        TO_CHAR(d.created_at, 'DD/MM/YYYY HH24:MI') as date_upload_formatted
      FROM documents d
      JOIN membres m ON d.membre_id = m.id
      JOIN membres uploader ON d.uploaded_by = uploader.id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    // Compter le total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM documents d
      JOIN membres m ON d.membre_id = m.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, paramCount));

    res.json({
      documents: result.rows.map(doc => ({
        ...doc,
        taille_formatted: this.formatTaille(doc.taille_bytes),
        can_preview: doc.type_mime.startsWith('image/')
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur récupération documents:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les types de documents autorisés
router.get('/config/types', [authenticateToken], (req, res) => {
  const types = uploadService.getTypesDocumentsAutorises();
  res.json({ types });
});

// Obtenir les statistiques des documents (admin/trésorier)
router.get('/stats/general', [authenticateToken, requireRole(['admin', 'tresorier'])], async (req, res) => {
  try {
    const { membre_id, date_debut, date_fin } = req.query;

    const stats = await uploadService.getStatistiques({
      membre_id: membre_id ? parseInt(membre_id) : null,
      date_debut,
      date_fin
    });

    // Formater la taille totale
    stats.generales.taille_totale_formatted = this.formatTaille(stats.generales.taille_totale);
    stats.generales.taille_moyenne_formatted = this.formatTaille(stats.generales.taille_moyenne);
    stats.generales.taille_max_formatted = this.formatTaille(stats.generales.taille_max);

    res.json(stats);

  } catch (error) {
    console.error('Erreur statistiques documents:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Nettoyer les fichiers temporaires (admin)
router.post('/maintenance/clean-temp', [authenticateToken, requireRole(['admin'])], async (req, res) => {
  try {
    const { ageMaxHeures = 24 } = req.body;

    const result = await uploadService.nettoyerFichiersTemp(ageMaxHeures);

    res.json({
      message: `${result.filesSupprimes} fichier(s) temporaire(s) supprimé(s)`,
      files_supprimes: result.filesSupprimes
    });

  } catch (error) {
    console.error('Erreur nettoyage fichiers temp:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Fonction utilitaire pour formater la taille des fichiers
function formatTaille(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Ajouter la fonction au router pour qu'elle soit accessible
router.formatTaille = formatTaille;

module.exports = router;