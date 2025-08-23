const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../config/database');

class UploadService {
  constructor() {
    this.uploadsDir = path.join(__dirname, '../uploads');
    this.documentsDir = path.join(this.uploadsDir, 'documents');
    this.tempDir = path.join(this.uploadsDir, 'temp');
    
    this.ensureDirectories();
    this.setupMulter();
  }

  ensureDirectories() {
    [this.uploadsDir, this.documentsDir, this.tempDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  setupMulter() {
    // Configuration du stockage
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.documentsDir);
      },
      filename: (req, file, cb) => {
        // Générer un nom unique
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
        const extension = path.extname(file.originalname);
        const filename = `doc-${uniqueSuffix}${extension}`;
        cb(null, filename);
      }
    });

    // Filtre des fichiers
    const fileFilter = (req, file, cb) => {
      const allowedTypes = {
        // Images
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'image/gif': ['.gif'],
        'image/webp': ['.webp'],
        
        // Documents
        'application/pdf': ['.pdf'],
        'application/msword': ['.doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        'application/vnd.ms-excel': ['.xls'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'text/plain': ['.txt'],
        
        // Archives
        'application/zip': ['.zip'],
        'application/x-rar-compressed': ['.rar']
      };

      if (allowedTypes[file.mimetype]) {
        cb(null, true);
      } else {
        cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`), false);
      }
    };

    // Configuration Multer
    this.upload = multer({
      storage: storage,
      fileFilter: fileFilter,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
        files: 5 // 5 fichiers max par requête
      }
    });
  }

  // Middleware pour upload unique
  getUploadSingle(fieldName = 'document') {
    return this.upload.single(fieldName);
  }

  // Middleware pour uploads multiples
  getUploadMultiple(fieldName = 'documents', maxCount = 5) {
    return this.upload.array(fieldName, maxCount);
  }

  // Enregistrer les métadonnées du document en base
  async enregistrerDocument(fileData, options = {}) {
    try {
      const {
        membre_id,
        sinistre_id = null,
        type_document = 'autre',
        description = '',
        uploaded_by
      } = options;

      const result = await pool.query(`
        INSERT INTO documents (
          nom_fichier, nom_original, chemin_fichier, taille_bytes, 
          type_mime, type_document, description, membre_id, 
          sinistre_id, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        fileData.filename,
        fileData.originalname,
        fileData.path,
        fileData.size,
        fileData.mimetype,
        type_document,
        description,
        membre_id,
        sinistre_id,
        uploaded_by
      ]);

      return result.rows[0];

    } catch (error) {
      console.error('Erreur enregistrement document:', error);
      throw error;
    }
  }

  // Enregistrer plusieurs documents
  async enregistrerDocuments(filesData, options = {}) {
    try {
      const documents = [];

      for (const fileData of filesData) {
        const doc = await this.enregistrerDocument(fileData, options);
        documents.push(doc);
      }

      return documents;

    } catch (error) {
      console.error('Erreur enregistrement documents multiples:', error);
      throw error;
    }
  }

  // Obtenir les documents d'un membre
  async getDocumentsMembre(membreId, options = {}) {
    try {
      const { type_document = 'all', limit = 50, offset = 0 } = options;

      let whereClause = 'WHERE d.membre_id = $1 AND d.statut = $2';
      const params = [membreId, 'actif'];
      let paramCount = 2;

      if (type_document !== 'all') {
        paramCount++;
        whereClause += ` AND d.type_document = $${paramCount}`;
        params.push(type_document);
      }

      const query = `
        SELECT 
          d.*,
          uploader.nom_complet as uploaded_by_nom,
          TO_CHAR(d.created_at, 'DD/MM/YYYY HH24:MI') as date_upload_formatted
        FROM documents d
        JOIN membres uploader ON d.uploaded_by = uploader.id
        ${whereClause}
        ORDER BY d.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      params.push(limit, offset);
      const result = await pool.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('Erreur récupération documents membre:', error);
      throw error;
    }
  }

  // Obtenir les documents d'un sinistre
  async getDocumentsSinistre(sinistreId) {
    try {
      const result = await pool.query(`
        SELECT 
          d.*,
          uploader.nom_complet as uploaded_by_nom,
          TO_CHAR(d.created_at, 'DD/MM/YYYY HH24:MI') as date_upload_formatted
        FROM documents d
        JOIN membres uploader ON d.uploaded_by = uploader.id
        WHERE d.sinistre_id = $1 AND d.statut = $2
        ORDER BY d.created_at DESC
      `, [sinistreId, 'actif']);

      return result.rows;

    } catch (error) {
      console.error('Erreur récupération documents sinistre:', error);
      throw error;
    }
  }

  // Obtenir un document par ID
  async getDocumentById(documentId, userId = null) {
    try {
      const query = `
        SELECT 
          d.*,
          m.nom_complet as proprietaire_nom,
          uploader.nom_complet as uploaded_by_nom
        FROM documents d
        JOIN membres m ON d.membre_id = m.id
        JOIN membres uploader ON d.uploaded_by = uploader.id
        WHERE d.id = $1 AND d.statut = $2
      `;

      const result = await pool.query(query, [documentId, 'actif']);

      if (result.rows.length === 0) {
        return null;
      }

      const document = result.rows[0];

      // Vérifier les permissions
      if (userId && document.membre_id !== userId) {
        // Seuls le propriétaire ou un admin/trésorier peuvent accéder
        const userRoles = await pool.query(`
          SELECT r.nom FROM roles r
          JOIN membre_roles mr ON r.id = mr.role_id
          WHERE mr.membre_id = $1
        `, [userId]);

        const roles = userRoles.rows.map(r => r.nom);
        if (!roles.includes('admin') && !roles.includes('tresorier')) {
          throw new Error('Accès non autorisé à ce document');
        }
      }

      return document;

    } catch (error) {
      console.error('Erreur récupération document:', error);
      throw error;
    }
  }

  // Supprimer un document
  async supprimerDocument(documentId, userId) {
    try {
      // Récupérer le document
      const document = await this.getDocumentById(documentId, userId);
      
      if (!document) {
        throw new Error('Document non trouvé');
      }

      // Marquer comme supprimé en base
      await pool.query(`
        UPDATE documents 
        SET statut = 'supprime', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [documentId]);

      // Supprimer le fichier physique
      if (fs.existsSync(document.chemin_fichier)) {
        fs.unlinkSync(document.chemin_fichier);
      }

      return { success: true };

    } catch (error) {
      console.error('Erreur suppression document:', error);
      throw error;
    }
  }

  // Obtenir les statistiques des documents
  async getStatistiques(options = {}) {
    try {
      const { membre_id = null, date_debut = null, date_fin = null } = options;

      let whereClause = 'WHERE d.statut = $1';
      const params = ['actif'];
      let paramCount = 1;

      if (membre_id) {
        paramCount++;
        whereClause += ` AND d.membre_id = $${paramCount}`;
        params.push(membre_id);
      }

      if (date_debut && date_fin) {
        paramCount += 2;
        whereClause += ` AND d.created_at BETWEEN $${paramCount - 1} AND $${paramCount}`;
        params.push(date_debut, date_fin);
      }

      // Statistiques générales
      const statsGenerales = await pool.query(`
        SELECT 
          COUNT(*) as total_documents,
          COUNT(DISTINCT d.membre_id) as membres_avec_documents,
          SUM(d.taille_bytes) as taille_totale,
          AVG(d.taille_bytes) as taille_moyenne,
          MAX(d.taille_bytes) as taille_max
        FROM documents d
        ${whereClause}
      `, params);

      // Par type de document
      const parType = await pool.query(`
        SELECT 
          d.type_document,
          COUNT(*) as nombre,
          SUM(d.taille_bytes) as taille_totale
        FROM documents d
        ${whereClause}
        GROUP BY d.type_document
        ORDER BY nombre DESC
      `, params);

      // Par type MIME
      const parTypeMime = await pool.query(`
        SELECT 
          d.type_mime,
          COUNT(*) as nombre
        FROM documents d
        ${whereClause}
        GROUP BY d.type_mime
        ORDER BY nombre DESC
      `, params);

      // Évolution mensuelle (12 derniers mois)
      const evolutionMensuelle = await pool.query(`
        SELECT 
          DATE_TRUNC('month', d.created_at) as mois,
          COUNT(*) as nombre_documents,
          SUM(d.taille_bytes) as taille_totale
        FROM documents d
        ${whereClause} AND d.created_at >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', d.created_at)
        ORDER BY mois DESC
      `, params);

      return {
        generales: statsGenerales.rows[0],
        par_type: parType.rows,
        par_type_mime: parTypeMime.rows,
        evolution_mensuelle: evolutionMensuelle.rows.map(row => ({
          mois: row.mois.toISOString().slice(0, 7),
          nombre: parseInt(row.nombre_documents),
          taille: parseInt(row.taille_totale || 0)
        }))
      };

    } catch (error) {
      console.error('Erreur statistiques documents:', error);
      throw error;
    }
  }

  // Nettoyer les anciens fichiers temporaires
  async nettoyerFichiersTemp(ageMaxHeures = 24) {
    try {
      const files = fs.readdirSync(this.tempDir);
      const maintenant = new Date();
      let filesSupprimes = 0;

      files.forEach(file => {
        const filepath = path.join(this.tempDir, file);
        const stats = fs.statSync(filepath);
        const ageHeures = (maintenant - stats.mtime) / (1000 * 60 * 60);

        if (ageHeures > ageMaxHeures) {
          fs.unlinkSync(filepath);
          filesSupprimes++;
        }
      });

      return { filesSupprimes };

    } catch (error) {
      console.error('Erreur nettoyage fichiers temp:', error);
      return { filesSupprimes: 0 };
    }
  }

  // Valider un fichier uploadé
  validateFile(file) {
    const errors = [];

    // Vérifier la taille
    if (file.size > 10 * 1024 * 1024) {
      errors.push('Fichier trop volumineux (max 10MB)');
    }

    // Vérifier l'extension
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.zip', '.rar'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (!allowedExts.includes(ext)) {
      errors.push(`Extension non autorisée: ${ext}`);
    }

    // Vérifier le nom de fichier
    if (file.originalname.length > 255) {
      errors.push('Nom de fichier trop long');
    }

    return errors;
  }

  // Obtenir les types de documents autorisés
  getTypesDocumentsAutorises() {
    return [
      { value: 'justificatif_sinistre', label: 'Justificatif de sinistre' },
      { value: 'piece_identite', label: 'Pièce d\'identité' },
      { value: 'certificat_medical', label: 'Certificat médical' },
      { value: 'facture', label: 'Facture' },
      { value: 'recu_paiement', label: 'Reçu de paiement' },
      { value: 'acte_naissance', label: 'Acte de naissance' },
      { value: 'acte_mariage', label: 'Acte de mariage' },
      { value: 'acte_deces', label: 'Acte de décès' },
      { value: 'rapport_medical', label: 'Rapport médical' },
      { value: 'autre', label: 'Autre document' }
    ];
  }

  // Compresser une image (basique)
  async compresserImage(filepath) {
    // TODO: Implémenter la compression d'image avec sharp ou similar
    // Pour l'instant, retourne le fichier tel quel
    return filepath;
  }
}

module.exports = new UploadService();