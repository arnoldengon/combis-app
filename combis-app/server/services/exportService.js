const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

class ExportService {
  constructor() {
    this.uploadsDir = path.join(__dirname, '../uploads/exports');
    this.ensureUploadsDir();
  }

  ensureUploadsDir() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  // Exporter la liste des membres
  async exporterMembres(format = 'excel', options = {}) {
    try {
      const { statut = 'all', includeStats = false } = options;
      
      let whereClause = '';
      const params = [];
      
      if (statut !== 'all') {
        whereClause = 'WHERE m.statut = $1';
        params.push(statut);
      }

      const query = `
        SELECT 
          m.*,
          COALESCE(array_agg(r.nom) FILTER (WHERE r.nom IS NOT NULL), ARRAY[]::VARCHAR[]) as roles,
          ${includeStats ? `
          COALESCE(SUM(CASE WHEN c.statut = 'payee' THEN c.montant_mensuel ELSE 0 END), 0) as total_paye_2024,
          COALESCE(SUM(CASE WHEN c.statut = 'impayee' THEN c.montant_mensuel ELSE 0 END), 0) as total_impaye_2024,
          COUNT(s.id) as nombre_sinistres
          ` : '0 as total_paye_2024, 0 as total_impaye_2024, 0 as nombre_sinistres'}
        FROM membres m
        LEFT JOIN membre_roles mr ON m.id = mr.membre_id
        LEFT JOIN roles r ON mr.role_id = r.id
        ${includeStats ? `
        LEFT JOIN cotisations c ON m.id = c.membre_id AND c.annee = 2024
        LEFT JOIN sinistres s ON m.id = s.membre_id
        ` : ''}
        ${whereClause}
        GROUP BY m.id
        ORDER BY m.nom_complet
      `;

      const result = await pool.query(query, params);
      const membres = result.rows;

      if (format === 'pdf') {
        return await this.genererPDFMembres(membres, options);
      } else {
        return await this.genererExcelMembres(membres, options);
      }

    } catch (error) {
      console.error('Erreur export membres:', error);
      throw error;
    }
  }

  // Exporter les cotisations
  async exporterCotisations(format = 'excel', options = {}) {
    try {
      const { 
        annee = new Date().getFullYear(), 
        mois = null, 
        statut = 'all',
        membre_id = null 
      } = options;
      
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

      const query = `
        SELECT 
          c.*,
          m.nom_complet,
          m.telephone_1,
          m.profession,
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
      `;

      const result = await pool.query(query, params);
      const cotisations = result.rows;

      if (format === 'pdf') {
        return await this.genererPDFCotisations(cotisations, options);
      } else {
        return await this.genererExcelCotisations(cotisations, options);
      }

    } catch (error) {
      console.error('Erreur export cotisations:', error);
      throw error;
    }
  }

  // Exporter les sinistres
  async exporterSinistres(format = 'excel', options = {}) {
    try {
      const { 
        annee = new Date().getFullYear(), 
        statut = 'all',
        type_sinistre_id = null,
        membre_id = null 
      } = options;
      
      let whereClause = 'WHERE EXTRACT(YEAR FROM s.date_sinistre) = $1';
      const params = [annee];
      let paramCount = 1;

      if (statut !== 'all') {
        paramCount++;
        whereClause += ` AND s.statut = $${paramCount}`;
        params.push(statut);
      }

      if (type_sinistre_id) {
        paramCount++;
        whereClause += ` AND s.type_sinistre_id = $${paramCount}`;
        params.push(type_sinistre_id);
      }

      if (membre_id) {
        paramCount++;
        whereClause += ` AND s.membre_id = $${paramCount}`;
        params.push(membre_id);
      }

      const query = `
        SELECT 
          s.*,
          m.nom_complet,
          m.telephone_1,
          ts.nom as type_sinistre_nom,
          ts.montant_couverture,
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
        ORDER BY s.date_declaration DESC
      `;

      const result = await pool.query(query, params);
      const sinistres = result.rows;

      if (format === 'pdf') {
        return await this.genererPDFSinistres(sinistres, options);
      } else {
        return await this.genererExcelSinistres(sinistres, options);
      }

    } catch (error) {
      console.error('Erreur export sinistres:', error);
      throw error;
    }
  }

  // Générer rapport financier complet
  async genererRapportFinancier(format = 'pdf', options = {}) {
    try {
      const { annee = new Date().getFullYear() } = options;

      // Statistiques générales
      const statsGenerales = await pool.query(`
        SELECT 
          COUNT(DISTINCT m.id) as total_membres,
          COUNT(DISTINCT CASE WHEN m.statut = 'actif' THEN m.id END) as membres_actifs,
          SUM(m.cotisation_annuelle) as cotisations_attendues,
          COUNT(c.id) as total_cotisations,
          COUNT(CASE WHEN c.statut = 'payee' THEN 1 END) as cotisations_payees,
          COALESCE(SUM(CASE WHEN c.statut = 'payee' THEN c.montant_mensuel ELSE 0 END), 0) as montant_encaisse,
          COALESCE(SUM(CASE WHEN c.statut = 'impayee' THEN c.montant_mensuel ELSE 0 END), 0) as montant_attendu,
          COUNT(s.id) as total_sinistres,
          COUNT(CASE WHEN s.statut = 'paye' THEN 1 END) as sinistres_payes,
          COALESCE(SUM(CASE WHEN s.statut = 'paye' THEN s.montant_approuve ELSE 0 END), 0) as montant_sinistres_payes
        FROM membres m
        LEFT JOIN cotisations c ON m.id = c.membre_id AND c.annee = $1
        LEFT JOIN sinistres s ON m.id = s.membre_id AND EXTRACT(YEAR FROM s.date_sinistre) = $1
      `, [annee]);

      // Évolution mensuelle
      const evolutionMensuelle = await pool.query(`
        WITH mois_serie AS (
          SELECT generate_series(1, 12) as mois
        ),
        cotisations_mois AS (
          SELECT 
            mois,
            COUNT(*) as nb_cotisations,
            COUNT(CASE WHEN statut = 'payee' THEN 1 END) as nb_payees,
            COALESCE(SUM(CASE WHEN statut = 'payee' THEN montant_mensuel ELSE 0 END), 0) as encaisse
          FROM cotisations 
          WHERE annee = $1
          GROUP BY mois
        ),
        sinistres_mois AS (
          SELECT 
            EXTRACT(MONTH FROM date_sinistre) as mois,
            COUNT(*) as nb_sinistres,
            COALESCE(SUM(CASE WHEN statut = 'paye' THEN montant_approuve ELSE 0 END), 0) as paye
          FROM sinistres 
          WHERE EXTRACT(YEAR FROM date_sinistre) = $1
          GROUP BY EXTRACT(MONTH FROM date_sinistre)
        )
        SELECT 
          ms.mois,
          TO_CHAR(TO_DATE(ms.mois::text, 'MM'), 'Month') as nom_mois,
          COALESCE(cm.nb_cotisations, 0) as nb_cotisations,
          COALESCE(cm.nb_payees, 0) as nb_payees,
          COALESCE(cm.encaisse, 0) as encaisse,
          COALESCE(sm.nb_sinistres, 0) as nb_sinistres,
          COALESCE(sm.paye, 0) as depenses,
          COALESCE(cm.encaisse, 0) - COALESCE(sm.paye, 0) as solde_mensuel
        FROM mois_serie ms
        LEFT JOIN cotisations_mois cm ON ms.mois = cm.mois
        LEFT JOIN sinistres_mois sm ON ms.mois = sm.mois
        ORDER BY ms.mois
      `, [annee]);

      // Répartition des sinistres par type
      const repartitionSinistres = await pool.query(`
        SELECT 
          ts.nom,
          COUNT(s.id) as nombre,
          COALESCE(SUM(CASE WHEN s.statut = 'paye' THEN s.montant_approuve ELSE 0 END), 0) as total_paye
        FROM types_sinistres ts
        LEFT JOIN sinistres s ON ts.id = s.type_sinistre_id AND EXTRACT(YEAR FROM s.date_sinistre) = $1
        GROUP BY ts.id, ts.nom
        ORDER BY total_paye DESC
      `, [annee]);

      const donnees = {
        annee,
        statistiques: statsGenerales.rows[0],
        evolution_mensuelle: evolutionMensuelle.rows,
        repartition_sinistres: repartitionSinistres.rows
      };

      if (format === 'pdf') {
        return await this.genererPDFRapportFinancier(donnees);
      } else {
        return await this.genererExcelRapportFinancier(donnees);
      }

    } catch (error) {
      console.error('Erreur rapport financier:', error);
      throw error;
    }
  }

  // Générer PDF des membres
  async genererPDFMembres(membres, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const filename = `membres-${Date.now()}.pdf`;
        const filepath = path.join(this.uploadsDir, filename);
        
        doc.pipe(fs.createWriteStream(filepath));

        // En-tête
        doc.fontSize(20).text('LES COMBIS - Liste des Membres', { align: 'center' });
        doc.fontSize(12).text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
        doc.moveDown();

        // Statistiques
        const stats = {
          total: membres.length,
          actifs: membres.filter(m => m.statut === 'actif').length,
          inactifs: membres.filter(m => m.statut === 'inactif').length,
          suspendus: membres.filter(m => m.statut === 'suspendu').length
        };

        doc.fontSize(14).text('Résumé:', { underline: true });
        doc.fontSize(10)
           .text(`Total membres: ${stats.total}`)
           .text(`Actifs: ${stats.actifs}`)
           .text(`Inactifs: ${stats.inactifs}`)
           .text(`Suspendus: ${stats.suspendus}`)
           .moveDown();

        // Liste des membres
        doc.fontSize(14).text('Liste détaillée:', { underline: true });
        doc.moveDown();

        membres.forEach((membre, index) => {
          if (doc.y > 700) {
            doc.addPage();
          }

          doc.fontSize(11)
             .text(`${index + 1}. ${membre.nom_complet}`, { continued: true })
             .text(` (${membre.statut})`, { align: 'right' })
             .fontSize(9)
             .text(`   Téléphone: ${membre.telephone_1}${membre.telephone_2 ? ` / ${membre.telephone_2}` : ''}`)
             .text(`   Profession: ${membre.profession || 'Non renseigné'}`)
             .text(`   Cotisation: ${new Intl.NumberFormat('fr-FR').format(membre.cotisation_annuelle)} FCFA/an`)
             .text(`   Inscrit le: ${new Date(membre.date_inscription).toLocaleDateString('fr-FR')}`)
             .moveDown(0.5);

          if (membre.roles && membre.roles.length > 0) {
            doc.text(`   Rôles: ${membre.roles.join(', ')}`)
               .moveDown(0.5);
          }
        });

        doc.end();

        doc.on('end', () => {
          resolve({
            success: true,
            filename,
            filepath,
            url: `/api/exports/download/${filename}`
          });
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  // Générer Excel des membres
  async genererExcelMembres(membres, options = {}) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Membres');

      // En-tête
      worksheet.columns = [
        { header: 'Nom Complet', key: 'nom_complet', width: 30 },
        { header: 'Téléphone 1', key: 'telephone_1', width: 15 },
        { header: 'Téléphone 2', key: 'telephone_2', width: 15 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Profession', key: 'profession', width: 25 },
        { header: 'Date Naissance', key: 'date_naissance', width: 15 },
        { header: 'Cotisation Annuelle', key: 'cotisation_annuelle', width: 18 },
        { header: 'Date Inscription', key: 'date_inscription', width: 15 },
        { header: 'Statut', key: 'statut', width: 12 },
        { header: 'Rôles', key: 'roles', width: 20 }
      ];

      // Données
      membres.forEach(membre => {
        worksheet.addRow({
          nom_complet: membre.nom_complet,
          telephone_1: membre.telephone_1,
          telephone_2: membre.telephone_2 || '',
          email: membre.email || '',
          profession: membre.profession || '',
          date_naissance: membre.date_naissance ? new Date(membre.date_naissance).toLocaleDateString('fr-FR') : '',
          cotisation_annuelle: membre.cotisation_annuelle,
          date_inscription: membre.date_inscription ? new Date(membre.date_inscription).toLocaleDateString('fr-FR') : '',
          statut: membre.statut,
          roles: membre.roles ? membre.roles.join(', ') : ''
        });
      });

      // Style
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      // Sauvegarde
      const filename = `membres-${Date.now()}.xlsx`;
      const filepath = path.join(this.uploadsDir, filename);
      await workbook.xlsx.writeFile(filepath);

      return {
        success: true,
        filename,
        filepath,
        url: `/api/exports/download/${filename}`
      };

    } catch (error) {
      throw error;
    }
  }

  // Générer Excel des cotisations
  async genererExcelCotisations(cotisations, options = {}) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Cotisations');

      worksheet.columns = [
        { header: 'Membre', key: 'nom_complet', width: 25 },
        { header: 'Téléphone', key: 'telephone_1', width: 15 },
        { header: 'Année', key: 'annee', width: 8 },
        { header: 'Mois', key: 'mois', width: 8 },
        { header: 'Montant', key: 'montant_mensuel', width: 12 },
        { header: 'Date Échéance', key: 'date_echeance_formatted', width: 12 },
        { header: 'Statut', key: 'statut_reel', width: 12 },
        { header: 'Date Paiement', key: 'date_paiement_formatted', width: 12 },
        { header: 'Mode Paiement', key: 'mode_paiement', width: 15 },
        { header: 'Référence', key: 'reference_paiement', width: 20 },
        { header: 'Jours Retard', key: 'jours_retard', width: 12 }
      ];

      cotisations.forEach(cotisation => {
        worksheet.addRow({
          nom_complet: cotisation.nom_complet,
          telephone_1: cotisation.telephone_1,
          annee: cotisation.annee,
          mois: cotisation.mois,
          montant_mensuel: cotisation.montant_mensuel,
          date_echeance_formatted: cotisation.date_echeance_formatted,
          statut_reel: cotisation.statut_reel,
          date_paiement_formatted: cotisation.date_paiement_formatted || '',
          mode_paiement: cotisation.mode_paiement || '',
          reference_paiement: cotisation.reference_paiement || '',
          jours_retard: cotisation.jours_retard || 0
        });
      });

      // Style et couleurs conditionnelles
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      // Colorer les retards en rouge
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const statutCell = row.getCell('statut_reel');
          if (statutCell.value === 'en_retard') {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCC' } };
          } else if (statutCell.value === 'payee') {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFFCC' } };
          }
        }
      });

      const filename = `cotisations-${options.annee || new Date().getFullYear()}-${Date.now()}.xlsx`;
      const filepath = path.join(this.uploadsDir, filename);
      await workbook.xlsx.writeFile(filepath);

      return {
        success: true,
        filename,
        filepath,
        url: `/api/exports/download/${filename}`
      };

    } catch (error) {
      throw error;
    }
  }

  // Générer Excel des sinistres
  async genererExcelSinistres(sinistres, options = {}) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sinistres');

      worksheet.columns = [
        { header: 'Membre', key: 'nom_complet', width: 25 },
        { header: 'Type Sinistre', key: 'type_sinistre_nom', width: 20 },
        { header: 'Date Sinistre', key: 'date_sinistre_formatted', width: 12 },
        { header: 'Date Déclaration', key: 'date_declaration_formatted', width: 15 },
        { header: 'Description', key: 'description', width: 30 },
        { header: 'Montant Demandé', key: 'montant_demande', width: 15 },
        { header: 'Montant Approuvé', key: 'montant_approuve', width: 15 },
        { header: 'Statut', key: 'statut', width: 12 },
        { header: 'Date Approbation', key: 'date_approbation_formatted', width: 15 },
        { header: 'Approuvé par', key: 'approuve_par_nom', width: 20 },
        { header: 'Date Paiement', key: 'date_paiement_formatted', width: 12 },
        { header: 'Motif Rejet', key: 'motif_rejet', width: 25 }
      ];

      sinistres.forEach(sinistre => {
        worksheet.addRow({
          nom_complet: sinistre.nom_complet,
          type_sinistre_nom: sinistre.type_sinistre_nom,
          date_sinistre_formatted: sinistre.date_sinistre_formatted,
          date_declaration_formatted: sinistre.date_declaration_formatted,
          description: sinistre.description,
          montant_demande: sinistre.montant_demande,
          montant_approuve: sinistre.montant_approuve || '',
          statut: sinistre.statut,
          date_approbation_formatted: sinistre.date_approbation_formatted || '',
          approuve_par_nom: sinistre.approuve_par_nom || '',
          date_paiement_formatted: sinistre.date_paiement_formatted || '',
          motif_rejet: sinistre.motif_rejet || ''
        });
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      const filename = `sinistres-${options.annee || new Date().getFullYear()}-${Date.now()}.xlsx`;
      const filepath = path.join(this.uploadsDir, filename);
      await workbook.xlsx.writeFile(filepath);

      return {
        success: true,
        filename,
        filepath,
        url: `/api/exports/download/${filename}`
      };

    } catch (error) {
      throw error;
    }
  }

  // Nettoyer les anciens fichiers d'export
  async nettoyerAnciensExports(ageMaxJours = 7) {
    try {
      const files = fs.readdirSync(this.uploadsDir);
      const maintenant = new Date();
      let filesSupprimes = 0;

      files.forEach(file => {
        const filepath = path.join(this.uploadsDir, file);
        const stats = fs.statSync(filepath);
        const ageJours = (maintenant - stats.mtime) / (1000 * 60 * 60 * 24);

        if (ageJours > ageMaxJours) {
          fs.unlinkSync(filepath);
          filesSupprimes++;
        }
      });

      return { filesSupprimes };
    } catch (error) {
      console.error('Erreur nettoyage exports:', error);
      return { filesSupprimes: 0 };
    }
  }
}

module.exports = new ExportService();