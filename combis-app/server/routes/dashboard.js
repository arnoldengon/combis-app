const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Dashboard principal avec statistiques générales
router.get('/', authenticateToken, async (req, res) => {
  try {
    const anneeActuelle = new Date().getFullYear();

    // Statistiques des membres
    const membresStats = await pool.query(`
      SELECT 
        COUNT(*) as total_membres,
        COUNT(CASE WHEN statut = 'actif' THEN 1 END) as membres_actifs,
        COUNT(CASE WHEN statut = 'inactif' THEN 1 END) as membres_inactifs,
        COUNT(CASE WHEN statut = 'suspendu' THEN 1 END) as membres_suspendus
      FROM membres
    `);

    // Statistiques des cotisations pour l'année en cours
    const cotisationsStats = await pool.query(`
      SELECT 
        COUNT(*) as total_cotisations,
        COUNT(CASE WHEN statut = 'payee' THEN 1 END) as cotisations_payees,
        COUNT(CASE WHEN statut = 'impayee' THEN 1 END) as cotisations_impayees,
        COUNT(CASE WHEN statut = 'impayee' AND date_echeance < CURRENT_DATE THEN 1 END) as cotisations_en_retard,
        COALESCE(SUM(CASE WHEN statut = 'payee' THEN montant_mensuel ELSE 0 END), 0) as montant_encaisse,
        COALESCE(SUM(CASE WHEN statut = 'impayee' THEN montant_mensuel ELSE 0 END), 0) as montant_attendu
      FROM cotisations 
      WHERE annee = $1
    `, [anneeActuelle]);

    // Statistiques des sinistres pour l'année en cours
    const sinistresStats = await pool.query(`
      SELECT 
        COUNT(*) as total_sinistres,
        COUNT(CASE WHEN statut = 'en_attente' THEN 1 END) as sinistres_en_attente,
        COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as sinistres_approuves,
        COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as sinistres_rejetes,
        COUNT(CASE WHEN statut = 'paye' THEN 1 END) as sinistres_payes,
        COALESCE(SUM(CASE WHEN statut = 'paye' THEN montant_approuve ELSE 0 END), 0) as montant_paye_sinistres,
        COALESCE(SUM(CASE WHEN statut = 'approuve' THEN montant_approuve ELSE 0 END), 0) as montant_a_payer
      FROM sinistres 
      WHERE EXTRACT(YEAR FROM date_sinistre) = $1
    `, [anneeActuelle]);

    // Évolution mensuelle des cotisations
    const evolutionCotisations = await pool.query(`
      SELECT 
        mois,
        TO_CHAR(TO_DATE(mois::text, 'MM'), 'Mon') as nom_mois,
        COUNT(*) as total,
        COUNT(CASE WHEN statut = 'payee' THEN 1 END) as payes,
        COALESCE(SUM(CASE WHEN statut = 'payee' THEN montant_mensuel ELSE 0 END), 0) as montant_encaisse
      FROM cotisations 
      WHERE annee = $1
      GROUP BY mois
      ORDER BY mois
    `, [anneeActuelle]);

    // Membres avec le plus de retards
    const membresEnRetard = await pool.query(`
      SELECT 
        m.nom_complet,
        m.telephone_1,
        COUNT(c.id) as nombre_retards,
        COALESCE(SUM(c.montant_mensuel), 0) as montant_du
      FROM membres m
      JOIN cotisations c ON m.id = c.membre_id
      WHERE c.statut = 'impayee' 
        AND c.date_echeance < CURRENT_DATE
        AND c.annee = $1
      GROUP BY m.id, m.nom_complet, m.telephone_1
      ORDER BY nombre_retards DESC, montant_du DESC
      LIMIT 10
    `, [anneeActuelle]);

    // Sinistres récents
    const sinistresRecents = await pool.query(`
      SELECT 
        s.id,
        s.statut,
        s.montant_demande,
        s.date_declaration,
        TO_CHAR(s.date_declaration, 'DD/MM/YYYY') as date_declaration_formatted,
        m.nom_complet,
        ts.nom as type_sinistre
      FROM sinistres s
      JOIN membres m ON s.membre_id = m.id
      JOIN types_sinistres ts ON s.type_sinistre_id = ts.id
      ORDER BY s.date_declaration DESC
      LIMIT 5
    `);

    // Calculs financiers
    const soldeActuel = cotisationsStats.rows[0].montant_encaisse - sinistresStats.rows[0].montant_paye_sinistres;
    const tauxRecouvrement = cotisationsStats.rows[0].total_cotisations > 0 
      ? (cotisationsStats.rows[0].cotisations_payees / cotisationsStats.rows[0].total_cotisations * 100).toFixed(1)
      : 0;

    res.json({
      annee: anneeActuelle,
      statistiques: {
        membres: membresStats.rows[0],
        cotisations: {
          ...cotisationsStats.rows[0],
          taux_recouvrement: parseFloat(tauxRecouvrement)
        },
        sinistres: sinistresStats.rows[0],
        financier: {
          solde_actuel: soldeActuel,
          montant_encaisse: cotisationsStats.rows[0].montant_encaisse,
          montant_paye_sinistres: sinistresStats.rows[0].montant_paye_sinistres,
          montant_attendu_cotisations: cotisationsStats.rows[0].montant_attendu,
          montant_a_payer_sinistres: sinistresStats.rows[0].montant_a_payer
        }
      },
      evolution_cotisations: evolutionCotisations.rows,
      membres_en_retard: membresEnRetard.rows,
      sinistres_recents: sinistresRecents.rows
    });

  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Statistiques détaillées pour une période donnée
router.get('/stats/:annee', authenticateToken, async (req, res) => {
  try {
    const { annee } = req.params;

    // Évolution mensuelle complète
    const evolutionMensuelle = await pool.query(`
      SELECT 
        generate_series(1, 12) as mois,
        TO_CHAR(TO_DATE(generate_series(1, 12)::text, 'MM'), 'Month') as nom_mois
    `);

    const cotisationsParMois = await pool.query(`
      SELECT 
        mois,
        COUNT(*) as total_cotisations,
        COUNT(CASE WHEN statut = 'payee' THEN 1 END) as cotisations_payees,
        COALESCE(SUM(CASE WHEN statut = 'payee' THEN montant_mensuel ELSE 0 END), 0) as montant_encaisse
      FROM cotisations 
      WHERE annee = $1
      GROUP BY mois
    `, [annee]);

    const sinistresParMois = await pool.query(`
      SELECT 
        EXTRACT(MONTH FROM date_sinistre) as mois,
        COUNT(*) as total_sinistres,
        COALESCE(SUM(CASE WHEN statut = 'paye' THEN montant_approuve ELSE 0 END), 0) as montant_paye
      FROM sinistres 
      WHERE EXTRACT(YEAR FROM date_sinistre) = $1
      GROUP BY EXTRACT(MONTH FROM date_sinistre)
    `, [annee]);

    // Combiner les données par mois
    const donneesParMois = evolutionMensuelle.rows.map(mois => {
      const cotisation = cotisationsParMois.rows.find(c => c.mois === mois.mois) || {
        total_cotisations: 0,
        cotisations_payees: 0,
        montant_encaisse: 0
      };
      
      const sinistre = sinistresParMois.rows.find(s => s.mois === mois.mois) || {
        total_sinistres: 0,
        montant_paye: 0
      };

      return {
        mois: mois.mois,
        nom_mois: mois.nom_mois.trim(),
        cotisations: {
          total: parseInt(cotisation.total_cotisations),
          payees: parseInt(cotisation.cotisations_payees),
          montant_encaisse: parseInt(cotisation.montant_encaisse)
        },
        sinistres: {
          total: parseInt(sinistre.total_sinistres),
          montant_paye: parseInt(sinistre.montant_paye)
        },
        solde_mensuel: parseInt(cotisation.montant_encaisse) - parseInt(sinistre.montant_paye)
      };
    });

    // Top membres par cotisations
    const topCotisants = await pool.query(`
      SELECT 
        m.nom_complet,
        m.cotisation_annuelle,
        COUNT(c.id) as cotisations_payees,
        COALESCE(SUM(CASE WHEN c.statut = 'payee' THEN c.montant_mensuel ELSE 0 END), 0) as montant_paye
      FROM membres m
      LEFT JOIN cotisations c ON m.id = c.membre_id AND c.annee = $1 AND c.statut = 'payee'
      GROUP BY m.id, m.nom_complet, m.cotisation_annuelle
      ORDER BY montant_paye DESC
      LIMIT 10
    `, [annee]);

    // Analyse par type de sinistre
    const analyseSinistres = await pool.query(`
      SELECT 
        ts.nom,
        ts.montant_couverture,
        COUNT(s.id) as nombre_declarations,
        COUNT(CASE WHEN s.statut = 'paye' THEN 1 END) as nombre_payes,
        COALESCE(AVG(CASE WHEN s.statut = 'paye' THEN s.montant_approuve END), 0) as montant_moyen,
        COALESCE(SUM(CASE WHEN s.statut = 'paye' THEN s.montant_approuve ELSE 0 END), 0) as total_paye
      FROM types_sinistres ts
      LEFT JOIN sinistres s ON ts.id = s.type_sinistre_id AND EXTRACT(YEAR FROM s.date_sinistre) = $1
      GROUP BY ts.id, ts.nom, ts.montant_couverture
      ORDER BY total_paye DESC
    `, [annee]);

    res.json({
      annee: parseInt(annee),
      evolution_mensuelle: donneesParMois,
      top_cotisants: topCotisants.rows,
      analyse_sinistres: analyseSinistres.rows
    });

  } catch (error) {
    console.error('Erreur statistiques détaillées:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Données pour les graphiques
router.get('/charts/data', authenticateToken, async (req, res) => {
  try {
    const { type, annee = new Date().getFullYear() } = req.query;

    let data = {};

    switch (type) {
      case 'cotisations-mensuelles':
        const cotisationsMensuelles = await pool.query(`
          SELECT 
            mois,
            TO_CHAR(TO_DATE(mois::text, 'MM'), 'Mon') as label,
            COALESCE(SUM(CASE WHEN statut = 'payee' THEN montant_mensuel ELSE 0 END), 0) as montant
          FROM cotisations 
          WHERE annee = $1
          GROUP BY mois
          ORDER BY mois
        `, [annee]);

        data = {
          labels: cotisationsMensuelles.rows.map(row => row.label),
          values: cotisationsMensuelles.rows.map(row => parseInt(row.montant))
        };
        break;

      case 'repartition-sinistres':
        const repartitionSinistres = await pool.query(`
          SELECT 
            ts.nom as label,
            COUNT(s.id) as value
          FROM types_sinistres ts
          LEFT JOIN sinistres s ON ts.id = s.type_sinistre_id 
            AND EXTRACT(YEAR FROM s.date_sinistre) = $1
          GROUP BY ts.id, ts.nom
          HAVING COUNT(s.id) > 0
          ORDER BY value DESC
        `, [annee]);

        data = {
          labels: repartitionSinistres.rows.map(row => row.label),
          values: repartitionSinistres.rows.map(row => parseInt(row.value))
        };
        break;

      case 'evolution-financiere':
        const evolutionFinanciere = await pool.query(`
          WITH mois_serie AS (
            SELECT generate_series(1, 12) as mois
          ),
          cotisations_mois AS (
            SELECT 
              mois,
              COALESCE(SUM(CASE WHEN statut = 'payee' THEN montant_mensuel ELSE 0 END), 0) as encaisse
            FROM cotisations 
            WHERE annee = $1
            GROUP BY mois
          ),
          sinistres_mois AS (
            SELECT 
              EXTRACT(MONTH FROM date_sinistre) as mois,
              COALESCE(SUM(CASE WHEN statut = 'paye' THEN montant_approuve ELSE 0 END), 0) as paye
            FROM sinistres 
            WHERE EXTRACT(YEAR FROM date_sinistre) = $1
            GROUP BY EXTRACT(MONTH FROM date_sinistre)
          )
          SELECT 
            ms.mois,
            TO_CHAR(TO_DATE(ms.mois::text, 'MM'), 'Mon') as label,
            COALESCE(cm.encaisse, 0) as encaisse,
            COALESCE(sm.paye, 0) as depenses
          FROM mois_serie ms
          LEFT JOIN cotisations_mois cm ON ms.mois = cm.mois
          LEFT JOIN sinistres_mois sm ON ms.mois = sm.mois
          ORDER BY ms.mois
        `, [annee]);

        data = {
          labels: evolutionFinanciere.rows.map(row => row.label),
          encaisse: evolutionFinanciere.rows.map(row => parseInt(row.encaisse)),
          depenses: evolutionFinanciere.rows.map(row => parseInt(row.depenses))
        };
        break;

      default:
        return res.status(400).json({ message: 'Type de graphique non supporté' });
    }

    res.json(data);

  } catch (error) {
    console.error('Erreur données graphiques:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;