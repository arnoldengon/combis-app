const { Server } = require('socket.io');
const pool = require('../config/database');

class NotificationService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userId
  }

  // Initialiser Socket.io
  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket) => {
      console.log('Nouvelle connexion WebSocket:', socket.id);

      // Authentification du socket
      socket.on('authenticate', async (token) => {
        try {
          // Vérifier le token JWT (réutiliser la logique d'auth)
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          
          // Vérifier que l'utilisateur existe
          const result = await pool.query(
            'SELECT id, nom_complet FROM membres WHERE id = $1 AND statut = $2',
            [decoded.userId, 'actif']
          );

          if (result.rows.length > 0) {
            const user = result.rows[0];
            
            // Enregistrer la connexion
            this.connectedUsers.set(user.id, socket.id);
            this.userSockets.set(socket.id, user.id);
            
            socket.userId = user.id;
            socket.userNom = user.nom_complet;
            
            // Rejoindre la room utilisateur
            socket.join(`user_${user.id}`);
            
            console.log(`Utilisateur authentifié: ${user.nom_complet} (${socket.id})`);
            
            // Envoyer les notifications en attente
            await this.envoyerNotificationsEnAttente(user.id, socket);
            
            socket.emit('authenticated', { 
              success: true, 
              user: { id: user.id, nom: user.nom_complet }
            });
          } else {
            socket.emit('authentication_error', { message: 'Utilisateur non trouvé' });
          }
        } catch (error) {
          console.error('Erreur authentification socket:', error);
          socket.emit('authentication_error', { message: 'Token invalide' });
        }
      });

      // Déconnexion
      socket.on('disconnect', () => {
        const userId = this.userSockets.get(socket.id);
        if (userId) {
          this.connectedUsers.delete(userId);
          this.userSockets.delete(socket.id);
          console.log(`Utilisateur déconnecté: ${socket.userNom} (${socket.id})`);
        }
      });

      // Marquer une notification comme lue
      socket.on('mark_notification_read', async (notificationId) => {
        if (socket.userId) {
          await this.marquerNotificationLue(notificationId, socket.userId);
        }
      });

      // Obtenir le nombre de notifications non lues
      socket.on('get_unread_count', async () => {
        if (socket.userId) {
          const count = await this.getNotificationsNonLuesCount(socket.userId);
          socket.emit('unread_count', { count });
        }
      });
    });

    console.log('Service de notifications WebSocket initialisé');
  }

  // Envoyer une notification à un utilisateur spécifique
  async envoyerNotification(userId, notification) {
    try {
      // Enregistrer en base de données
      const result = await pool.query(`
        INSERT INTO notifications_realtime (
          destinataire_id, titre, message, type_notification, 
          donnees_extra, lien_action
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        userId,
        notification.titre,
        notification.message,
        notification.type || 'info',
        JSON.stringify(notification.donnees_extra || {}),
        notification.lien_action || null
      ]);

      const notificationEnregistree = result.rows[0];

      // Envoyer via WebSocket si l'utilisateur est connecté
      const socketId = this.connectedUsers.get(userId);
      if (socketId && this.io) {
        this.io.to(socketId).emit('nouvelle_notification', {
          id: notificationEnregistree.id,
          titre: notificationEnregistree.titre,
          message: notificationEnregistree.message,
          type: notificationEnregistree.type_notification,
          donnees_extra: notificationEnregistree.donnees_extra,
          lien_action: notificationEnregistree.lien_action,
          created_at: notificationEnregistree.created_at
        });
      }

      return notificationEnregistree;

    } catch (error) {
      console.error('Erreur envoi notification:', error);
      throw error;
    }
  }

  // Envoyer une notification à plusieurs utilisateurs
  async envoyerNotificationMasse(userIds, notification) {
    const notifications = [];

    for (const userId of userIds) {
      try {
        const notif = await this.envoyerNotification(userId, notification);
        notifications.push(notif);
      } catch (error) {
        console.error(`Erreur envoi notification à l'utilisateur ${userId}:`, error);
      }
    }

    return notifications;
  }

  // Diffuser une notification à tous les utilisateurs connectés
  diffuserNotification(notification) {
    if (this.io) {
      this.io.emit('diffusion_notification', {
        titre: notification.titre,
        message: notification.message,
        type: notification.type || 'info',
        donnees_extra: notification.donnees_extra || {}
      });
    }
  }

  // Envoyer les notifications en attente à un utilisateur qui se connecte
  async envoyerNotificationsEnAttente(userId, socket) {
    try {
      const result = await pool.query(`
        SELECT * FROM notifications_realtime 
        WHERE destinataire_id = $1 AND lu = false 
        ORDER BY created_at DESC 
        LIMIT 10
      `, [userId]);

      const notifications = result.rows.map(notif => ({
        id: notif.id,
        titre: notif.titre,
        message: notif.message,
        type: notif.type_notification,
        donnees_extra: notif.donnees_extra,
        lien_action: notif.lien_action,
        created_at: notif.created_at
      }));

      if (notifications.length > 0) {
        socket.emit('notifications_en_attente', notifications);
      }

    } catch (error) {
      console.error('Erreur récupération notifications en attente:', error);
    }
  }

  // Marquer une notification comme lue
  async marquerNotificationLue(notificationId, userId) {
    try {
      await pool.query(`
        UPDATE notifications_realtime 
        SET lu = true, date_lecture = CURRENT_TIMESTAMP 
        WHERE id = $1 AND destinataire_id = $2
      `, [notificationId, userId]);

      return true;

    } catch (error) {
      console.error('Erreur marquage notification lue:', error);
      return false;
    }
  }

  // Obtenir le nombre de notifications non lues
  async getNotificationsNonLuesCount(userId) {
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count 
        FROM notifications_realtime 
        WHERE destinataire_id = $1 AND lu = false
      `, [userId]);

      return parseInt(result.rows[0].count);

    } catch (error) {
      console.error('Erreur comptage notifications non lues:', error);
      return 0;
    }
  }

  // Obtenir les notifications d'un utilisateur
  async getNotificationsUtilisateur(userId, options = {}) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        type = 'all', 
        lu = 'all' 
      } = options;

      let whereClause = 'WHERE destinataire_id = $1';
      const params = [userId];
      let paramCount = 1;

      if (type !== 'all') {
        paramCount++;
        whereClause += ` AND type_notification = $${paramCount}`;
        params.push(type);
      }

      if (lu !== 'all') {
        paramCount++;
        whereClause += ` AND lu = $${paramCount}`;
        params.push(lu === 'true');
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          id, titre, message, type_notification, donnees_extra, 
          lien_action, lu, created_at, date_lecture,
          TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as created_at_formatted
        FROM notifications_realtime 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      params.push(limit, offset);
      const result = await pool.query(query, params);

      // Compter le total
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM notifications_realtime 
        ${whereClause}
      `;
      const countResult = await pool.query(countQuery, params.slice(0, paramCount));

      return {
        notifications: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          pages: Math.ceil(countResult.rows[0].total / limit)
        }
      };

    } catch (error) {
      console.error('Erreur récupération notifications utilisateur:', error);
      throw error;
    }
  }

  // Notifications automatiques pour les événements système

  // Notification nouveau sinistre déclaré
  async notifierNouveauSinistre(sinistre) {
    try {
      // Notifier les admins et trésoriers
      const adminsTresoriers = await pool.query(`
        SELECT DISTINCT m.id 
        FROM membres m
        JOIN membre_roles mr ON m.id = mr.membre_id
        JOIN roles r ON mr.role_id = r.id
        WHERE r.nom IN ('admin', 'tresorier') AND m.statut = 'actif'
      `);

      const userIds = adminsTresoriers.rows.map(u => u.id);

      await this.envoyerNotificationMasse(userIds, {
        titre: 'Nouveau sinistre déclaré',
        message: `${sinistre.membre_nom} a déclaré un sinistre: ${sinistre.type_sinistre}`,
        type: 'sinistre',
        donnees_extra: { sinistre_id: sinistre.id },
        lien_action: `/sinistres/${sinistre.id}`
      });

    } catch (error) {
      console.error('Erreur notification nouveau sinistre:', error);
    }
  }

  // Notification sinistre approuvé
  async notifierSinistreApprouve(sinistre) {
    try {
      await this.envoyerNotification(sinistre.membre_id, {
        titre: 'Sinistre approuvé',
        message: `Votre sinistre "${sinistre.type_sinistre}" a été approuvé pour ${sinistre.montant_approuve} FCFA`,
        type: 'success',
        donnees_extra: { sinistre_id: sinistre.id },
        lien_action: `/sinistres/${sinistre.id}`
      });

    } catch (error) {
      console.error('Erreur notification sinistre approuvé:', error);
    }
  }

  // Notification sinistre rejeté
  async notifierSinistreRejete(sinistre) {
    try {
      await this.envoyerNotification(sinistre.membre_id, {
        titre: 'Sinistre rejeté',
        message: `Votre sinistre "${sinistre.type_sinistre}" a été rejeté. ${sinistre.motif_rejet}`,
        type: 'error',
        donnees_extra: { sinistre_id: sinistre.id },
        lien_action: `/sinistres/${sinistre.id}`
      });

    } catch (error) {
      console.error('Erreur notification sinistre rejeté:', error);
    }
  }

  // Notification nouveau vote
  async notifierNouveauVote(vote, membresEligibles) {
    try {
      await this.envoyerNotificationMasse(membresEligibles, {
        titre: 'Nouveau vote',
        message: `Nouveau vote disponible: "${vote.titre}". Échéance: ${vote.date_fin.toLocaleDateString('fr-FR')}`,
        type: 'vote',
        donnees_extra: { vote_id: vote.id },
        lien_action: `/votes/${vote.id}`
      });

    } catch (error) {
      console.error('Erreur notification nouveau vote:', error);
    }
  }

  // Notification rappel cotisation
  async notifierRappelCotisation(membre, cotisation) {
    try {
      await this.envoyerNotification(membre.id, {
        titre: 'Rappel de cotisation',
        message: `Votre cotisation de ${cotisation.montant} FCFA pour ${cotisation.mois}/${cotisation.annee} est en retard`,
        type: 'warning',
        donnees_extra: { cotisation_id: cotisation.id },
        lien_action: `/cotisations`
      });

    } catch (error) {
      console.error('Erreur notification rappel cotisation:', error);
    }
  }

  // Obtenir les utilisateurs connectés
  getUtilisateursConnectes() {
    return Array.from(this.connectedUsers.entries()).map(([userId, socketId]) => ({
      userId,
      socketId,
      nom: this.userSockets.get(socketId)
    }));
  }

  // Nettoyer les anciennes notifications
  async nettoyerAnciennesNotifications(ageMaxJours = 30) {
    try {
      const result = await pool.query(`
        DELETE FROM notifications_realtime 
        WHERE created_at < CURRENT_DATE - INTERVAL '${ageMaxJours} days'
        RETURNING count(*) as deleted_count
      `);

      return { deleted_count: result.rowCount };

    } catch (error) {
      console.error('Erreur nettoyage anciennes notifications:', error);
      return { deleted_count: 0 };
    }
  }
}

module.exports = new NotificationService();