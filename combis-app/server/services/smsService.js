const pool = require('../config/database');
const axios = require('axios');

class SMSService {
  constructor() {
    this.providers = {
      orange_sms_api: this.sendOrangeSMS.bind(this),
      mtn_api: this.sendMTNSMS.bind(this),
      nexmo: this.sendNexmoSMS.bind(this)
    };
  }

  // Récupérer la configuration SMS
  async getConfig() {
    const result = await pool.query(`
      SELECT cle, valeur FROM configurations 
      WHERE cle IN ('sms_provider', 'sms_api_key', 'sms_sender_id', 'sms_enabled')
    `);
    
    const config = {};
    result.rows.forEach(row => {
      config[row.cle] = row.valeur;
    });
    
    return config;
  }

  // Fonction principale d'envoi de SMS
  async envoyerSMS(destinataireId, telephone, message, typeNotification, expediteurId = null) {
    try {
      const config = await this.getConfig();
      
      if (config.sms_enabled !== 'true') {
        console.log('SMS désactivé dans la configuration');
        return { success: false, error: 'SMS désactivé' };
      }

      // Nettoyer le numéro de téléphone
      const telephoneClean = this.nettoyerTelephone(telephone);
      
      // Enregistrer la notification en base
      const notificationResult = await pool.query(`
        INSERT INTO notifications_sms (
          destinataire_id, telephone, message, type_notification, expediteur_id
        ) VALUES ($1, $2, $3, $4, $5) RETURNING id
      `, [destinataireId, telephoneClean, message, typeNotification, expediteurId]);
      
      const notificationId = notificationResult.rows[0].id;

      // Envoyer via le provider configuré
      const provider = config.sms_provider || 'orange_sms_api';
      const sendFunction = this.providers[provider];
      
      if (!sendFunction) {
        throw new Error(`Provider SMS non supporté: ${provider}`);
      }

      const result = await sendFunction(telephoneClean, message, config);

      // Mettre à jour le statut
      await pool.query(`
        UPDATE notifications_sms 
        SET statut = $1, reference_externe = $2, cout_fcfa = $3, date_envoi = CURRENT_TIMESTAMP,
            erreur = $4, tentatives = tentatives + 1
        WHERE id = $5
      `, [
        result.success ? 'envoye' : 'echec',
        result.reference || null,
        result.cout || 0,
        result.error || null,
        notificationId
      ]);

      return { success: result.success, notificationId, reference: result.reference };

    } catch (error) {
      console.error('Erreur envoi SMS:', error);
      return { success: false, error: error.message };
    }
  }

  // Provider Orange SMS API (Cameroun)
  async sendOrangeSMS(telephone, message, config) {
    try {
      const response = await axios.post('https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B237/requests', {
        outboundSMSMessageRequest: {
          address: `tel:+237${telephone}`,
          senderAddress: `tel:+237${config.sms_sender_id || 'COMBIS'}`,
          outboundSMSTextMessage: {
            message: message
          }
        }
      }, {
        headers: {
          'Authorization': `Bearer ${config.sms_api_key}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        reference: response.data.outboundSMSMessageRequest?.resourceURL || null,
        cout: 25 // Coût estimé en FCFA
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Provider MTN API (Cameroun)
  async sendMTNSMS(telephone, message, config) {
    try {
      // API MTN Cameroun - à adapter selon leur documentation
      const response = await axios.post('https://api.mtn.cm/v1/sms/send', {
        to: telephone,
        from: config.sms_sender_id || 'COMBIS',
        text: message
      }, {
        headers: {
          'Authorization': `Bearer ${config.sms_api_key}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        reference: response.data.messageId,
        cout: 25
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Provider Nexmo/Vonage (international)
  async sendNexmoSMS(telephone, message, config) {
    try {
      const response = await axios.post('https://rest.nexmo.com/sms/json', {
        from: config.sms_sender_id || 'COMBIS',
        to: `237${telephone}`, // Code pays Cameroun
        text: message,
        api_key: config.sms_api_key,
        api_secret: config.sms_api_secret
      });

      return {
        success: response.data.messages[0].status === '0',
        reference: response.data.messages[0]['message-id'],
        cout: 50
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Nettoyer et formater le numéro de téléphone
  nettoyerTelephone(telephone) {
    // Retirer tous les caractères non numériques
    let clean = telephone.replace(/\D/g, '');
    
    // Si commence par 237, retirer le code pays
    if (clean.startsWith('237')) {
      clean = clean.substring(3);
    }
    
    // Si commence par +237, traiter
    if (telephone.startsWith('+237')) {
      clean = telephone.substring(4).replace(/\D/g, '');
    }
    
    // Vérifier que c'est un numéro camerounais valide (9 chiffres)
    if (clean.length !== 9) {
      throw new Error(`Numéro de téléphone invalide: ${telephone}`);
    }
    
    return clean;
  }

  // Envoyer des SMS en masse avec template
  async envoyerSMSMasse(destinataires, templateNom, variables = {}) {
    try {
      // Récupérer le template
      const templateResult = await pool.query(`
        SELECT template FROM modeles_sms 
        WHERE nom = $1 AND actif = true
      `, [templateNom]);

      if (templateResult.rows.length === 0) {
        throw new Error(`Template SMS non trouvé: ${templateNom}`);
      }

      const template = templateResult.rows[0].template;
      const resultats = [];

      for (const destinataire of destinataires) {
        // Remplacer les variables dans le template
        let message = template;
        const varsFinales = { ...variables, ...destinataire };
        
        Object.keys(varsFinales).forEach(key => {
          const regex = new RegExp(`{{${key}}}`, 'g');
          message = message.replace(regex, varsFinales[key]);
        });

        // Envoyer le SMS
        const result = await this.envoyerSMS(
          destinataire.id,
          destinataire.telephone,
          message,
          templateNom.toLowerCase().replace(' ', '_'),
          variables.expediteur_id
        );

        resultats.push({
          membre: destinataire.nom_complet,
          telephone: destinataire.telephone,
          success: result.success,
          error: result.error
        });

        // Petite pause pour éviter de surcharger l'API
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return resultats;
    } catch (error) {
      console.error('Erreur SMS masse:', error);
      throw error;
    }
  }

  // Rappels automatiques de cotisations
  async envoyerRappelsCotisations() {
    try {
      const config = await this.getConfig();
      const joursRappel = config.rappel_cotisation_jours?.split(',').map(j => parseInt(j.trim())) || [7, 15, 30];

      const resultats = [];

      for (const jours of joursRappel) {
        // Trouver les cotisations en retard de X jours
        const cotisationsEnRetard = await pool.query(`
          SELECT DISTINCT
            c.id as cotisation_id,
            c.mois,
            c.annee, 
            c.montant_mensuel,
            c.date_echeance,
            CURRENT_DATE - c.date_echeance as jours_retard,
            m.id as membre_id,
            m.nom_complet,
            m.telephone_1
          FROM cotisations c
          JOIN membres m ON c.membre_id = m.id
          WHERE c.statut = 'impayee' 
            AND c.date_echeance = CURRENT_DATE - INTERVAL '${jours} days'
            AND m.statut = 'actif'
            AND NOT EXISTS (
              SELECT 1 FROM notifications_sms ns 
              WHERE ns.destinataire_id = m.id 
                AND ns.type_notification = 'rappel_cotisation'
                AND DATE(ns.created_at) = CURRENT_DATE
            )
        `);

        if (cotisationsEnRetard.rows.length > 0) {
          const destinataires = cotisationsEnRetard.rows.map(row => ({
            id: row.membre_id,
            nom_complet: row.nom_complet,
            telephone: row.telephone_1,
            montant: row.montant_mensuel,
            mois: row.mois,
            annee: row.annee,
            jours_retard: row.jours_retard
          }));

          const result = await this.envoyerSMSMasse(destinataires, 'Rappel cotisation');
          resultats.push(...result);
        }
      }

      return resultats;
    } catch (error) {
      console.error('Erreur rappels cotisations:', error);
      throw error;
    }
  }

  // Obtenir les statistiques SMS
  async getStatistiques(dateDebut = null, dateFin = null) {
    let whereClause = '';
    const params = [];

    if (dateDebut && dateFin) {
      whereClause = 'WHERE created_at BETWEEN $1 AND $2';
      params.push(dateDebut, dateFin);
    }

    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN statut = 'envoye' THEN 1 END) as envoyes,
        COUNT(CASE WHEN statut = 'livre' THEN 1 END) as livres,
        COUNT(CASE WHEN statut = 'echec' THEN 1 END) as echecs,
        SUM(cout_fcfa) as cout_total,
        type_notification,
        COUNT(*) as count_by_type
      FROM notifications_sms 
      ${whereClause}
      GROUP BY type_notification
      ORDER BY count_by_type DESC
    `, params);

    const globalStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN statut = 'envoye' THEN 1 END) as envoyes,
        COUNT(CASE WHEN statut = 'livre' THEN 1 END) as livres,
        COUNT(CASE WHEN statut = 'echec' THEN 1 END) as echecs,
        SUM(cout_fcfa) as cout_total
      FROM notifications_sms 
      ${whereClause}
    `, params);

    return {
      global: globalStats.rows[0],
      par_type: result.rows
    };
  }
}

module.exports = new SMSService();