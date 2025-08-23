const pool = require('../config/database');
const smsService = require('./smsService');

class VoteService {
  constructor() {
    this.typesVote = {
      'simple_majorite': 'Majorité simple (>50%)',
      'majorite_qualifiee': 'Majorité qualifiée (≥2/3)',
      'unanimite': 'Unanimité (100%)',
      'quorum': 'Quorum personnalisé'
    };
  }

  // Créer un nouveau vote
  async creerVote(options) {
    try {
      const {
        objet_type,
        objet_id,
        titre,
        description,
        type_vote = 'simple_majorite',
        quorum_requis = null,
        duree_heures = 72,
        cree_par,
        membres_eligibles = null // Si null, tous les membres actifs
      } = options;

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Calculer la date de fin
        const dateFin = new Date();
        dateFin.setHours(dateFin.getHours() + duree_heures);

        // Créer le vote
        const voteResult = await client.query(`
          INSERT INTO votes (
            objet_type, objet_id, titre, description, type_vote, 
            quorum_requis, date_fin, cree_par
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [objet_type, objet_id, titre, description, type_vote, quorum_requis, dateFin, cree_par]);

        const vote = voteResult.rows[0];

        // Déterminer les membres éligibles
        let membresQuery;
        let membresParams = [];

        if (membres_eligibles && membres_eligibles.length > 0) {
          membresQuery = `
            SELECT id, nom_complet, telephone_1 
            FROM membres 
            WHERE id = ANY($1::int[]) AND statut = 'actif'
          `;
          membresParams = [membres_eligibles];
        } else {
          membresQuery = `
            SELECT id, nom_complet, telephone_1 
            FROM membres 
            WHERE statut = 'actif'
          `;
        }

        const membresResult = await client.query(membresQuery, membresParams);
        const membres = membresResult.rows;

        // Calculer le quorum si nécessaire
        let quorumFinal = quorum_requis;
        if (type_vote !== 'quorum' || !quorum_requis) {
          switch (type_vote) {
            case 'simple_majorite':
              quorumFinal = Math.ceil(membres.length / 2);
              break;
            case 'majorite_qualifiee':
              quorumFinal = Math.ceil(membres.length * 2 / 3);
              break;
            case 'unanimite':
              quorumFinal = membres.length;
              break;
            default:
              quorumFinal = Math.ceil(membres.length * 0.6); // 60% par défaut
          }
        }

        // Mettre à jour le quorum dans le vote
        await client.query(`
          UPDATE votes SET quorum_requis = $1 WHERE id = $2
        `, [quorumFinal, vote.id]);

        await client.query('COMMIT');

        // Envoyer les notifications SMS
        if (membres.length > 0) {
          const destinataires = membres.map(m => ({
            id: m.id,
            nom_complet: m.nom_complet,
            telephone: m.telephone_1,
            titre: titre,
            date_fin: dateFin.toLocaleString('fr-FR'),
            lien_vote: `${process.env.FRONTEND_URL}/votes/${vote.id}`
          }));

          // Envoyer en arrière-plan (pas d'attente)
          smsService.envoyerSMSMasse(destinataires, 'Nouveau vote', {
            expediteur_id: cree_par
          }).catch(error => {
            console.error('Erreur envoi SMS vote:', error);
          });
        }

        return {
          ...vote,
          quorum_requis: quorumFinal,
          nombre_eligibles: membres.length
        };

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Erreur création vote:', error);
      throw error;
    }
  }

  // Voter sur un vote
  async voter(voteId, membreId, reponse, commentaire = null) {
    try {
      // Vérifier que le vote existe et est ouvert
      const voteResult = await pool.query(`
        SELECT * FROM votes 
        WHERE id = $1 AND statut = 'ouvert' AND date_fin > CURRENT_TIMESTAMP
      `, [voteId]);

      if (voteResult.rows.length === 0) {
        throw new Error('Vote non trouvé ou fermé');
      }

      const vote = voteResult.rows[0];

      // Vérifier que le membre n'a pas déjà voté
      const existingVote = await pool.query(`
        SELECT id FROM reponses_votes 
        WHERE vote_id = $1 AND membre_id = $2
      `, [voteId, membreId]);

      if (existingVote.rows.length > 0) {
        throw new Error('Vous avez déjà voté');
      }

      // Enregistrer le vote
      await pool.query(`
        INSERT INTO reponses_votes (vote_id, membre_id, reponse, commentaire)
        VALUES ($1, $2, $3, $4)
      `, [voteId, membreId, reponse, commentaire]);

      // Vérifier si le vote peut être automatiquement fermé
      await this.verifierEtFermerVote(voteId);

      return { success: true };

    } catch (error) {
      console.error('Erreur vote:', error);
      throw error;
    }
  }

  // Vérifier et fermer automatiquement un vote si les conditions sont remplies
  async verifierEtFermerVote(voteId) {
    try {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Récupérer les informations du vote
        const voteResult = await client.query(`
          SELECT v.*, 
                 COUNT(rv.id) as total_votes,
                 COUNT(CASE WHEN rv.reponse = 'pour' THEN 1 END) as votes_pour,
                 COUNT(CASE WHEN rv.reponse = 'contre' THEN 1 END) as votes_contre,
                 COUNT(CASE WHEN rv.reponse = 'abstention' THEN 1 END) as votes_abstention
          FROM votes v
          LEFT JOIN reponses_votes rv ON v.id = rv.vote_id
          WHERE v.id = $1 AND v.statut = 'ouvert'
          GROUP BY v.id
        `, [voteId]);

        if (voteResult.rows.length === 0) {
          return; // Vote déjà fermé ou n'existe pas
        }

        const vote = voteResult.rows[0];
        const { total_votes, votes_pour, votes_contre, type_vote, quorum_requis } = vote;

        let nouveauStatut = 'ouvert';
        let resultats = null;

        // Vérifier les conditions de fermeture selon le type de vote
        switch (type_vote) {
          case 'simple_majorite':
            if (total_votes >= quorum_requis) {
              nouveauStatut = votes_pour > votes_contre ? 'approuve' : 'rejete';
            }
            break;

          case 'majorite_qualifiee':
            if (total_votes >= quorum_requis) {
              nouveauStatut = votes_pour >= Math.ceil(total_votes * 2 / 3) ? 'approuve' : 'rejete';
            }
            break;

          case 'unanimite':
            if (total_votes >= quorum_requis) {
              nouveauStatut = (votes_contre === 0 && votes_pour === total_votes) ? 'approuve' : 'rejete';
            }
            break;

          case 'quorum':
          default:
            if (total_votes >= quorum_requis) {
              nouveauStatut = votes_pour > votes_contre ? 'approuve' : 'rejete';
            }
            break;
        }

        // Si le vote est terminé, mettre à jour le statut
        if (nouveauStatut !== 'ouvert') {
          await client.query(`
            UPDATE votes 
            SET statut = $1, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2
          `, [nouveauStatut, voteId]);

          // Traiter le résultat du vote selon l'objet
          await this.traiterResultatVote(client, vote, nouveauStatut);
        }

        await client.query('COMMIT');

        return nouveauStatut;

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Erreur vérification vote:', error);
      throw error;
    }
  }

  // Traiter le résultat d'un vote (appliquer les changements selon l'objet voté)
  async traiterResultatVote(client, vote, resultat) {
    try {
      if (resultat !== 'approuve') {
        return; // Rien à faire si le vote est rejeté
      }

      const { objet_type, objet_id } = vote;

      switch (objet_type) {
        case 'sinistre':
          // Approuver automatiquement le sinistre
          await client.query(`
            UPDATE sinistres 
            SET statut = 'approuve', 
                date_approbation = CURRENT_DATE,
                remarques = COALESCE(remarques, '') || ' [Approuvé par vote]'
            WHERE id = $1
          `, [objet_id]);
          break;

        case 'membre':
          // Actions sur un membre (activation, suspension, etc.)
          // À implémenter selon les besoins
          break;

        case 'decision':
          // Décisions générales - logging seulement
          console.log(`Décision ${objet_id} approuvée par vote ${vote.id}`);
          break;

        default:
          console.log(`Type d'objet non géré pour vote: ${objet_type}`);
      }

    } catch (error) {
      console.error('Erreur traitement résultat vote:', error);
      throw error;
    }
  }

  // Fermer les votes expirés
  async fermerVotesExpires() {
    try {
      const votesExpires = await pool.query(`
        SELECT v.id,
               COUNT(rv.id) as total_votes,
               COUNT(CASE WHEN rv.reponse = 'pour' THEN 1 END) as votes_pour,
               COUNT(CASE WHEN rv.reponse = 'contre' THEN 1 END) as votes_contre
        FROM votes v
        LEFT JOIN reponses_votes rv ON v.id = rv.vote_id
        WHERE v.statut = 'ouvert' AND v.date_fin <= CURRENT_TIMESTAMP
        GROUP BY v.id
      `);

      const resultats = [];

      for (const vote of votesExpires.rows) {
        const { id, total_votes, votes_pour, votes_contre } = vote;

        // Déterminer le résultat
        const resultat = votes_pour > votes_contre ? 'approuve' : 'rejete';

        // Fermer le vote
        await pool.query(`
          UPDATE votes 
          SET statut = $1, updated_at = CURRENT_TIMESTAMP 
          WHERE id = $2
        `, [resultat, id]);

        resultats.push({
          vote_id: id,
          statut: resultat,
          votes_pour,
          votes_contre,
          total_votes
        });
      }

      return resultats;

    } catch (error) {
      console.error('Erreur fermeture votes expirés:', error);
      throw error;
    }
  }

  // Obtenir les détails d'un vote
  async getVoteDetails(voteId, membreId = null) {
    try {
      // Informations du vote
      const voteResult = await pool.query(`
        SELECT v.*,
               createur.nom_complet as cree_par_nom,
               COUNT(DISTINCT rv.id) as total_votes,
               COUNT(CASE WHEN rv.reponse = 'pour' THEN 1 END) as votes_pour,
               COUNT(CASE WHEN rv.reponse = 'contre' THEN 1 END) as votes_contre,
               COUNT(CASE WHEN rv.reponse = 'abstention' THEN 1 END) as votes_abstention,
               TO_CHAR(v.date_debut, 'DD/MM/YYYY HH24:MI') as date_debut_formatted,
               TO_CHAR(v.date_fin, 'DD/MM/YYYY HH24:MI') as date_fin_formatted
        FROM votes v
        JOIN membres createur ON v.cree_par = createur.id
        LEFT JOIN reponses_votes rv ON v.id = rv.vote_id
        WHERE v.id = $1
        GROUP BY v.id, createur.nom_complet
      `, [voteId]);

      if (voteResult.rows.length === 0) {
        return null;
      }

      const vote = voteResult.rows[0];

      // Vérifier si le membre a voté
      let aVote = false;
      let monVote = null;

      if (membreId) {
        const monVoteResult = await pool.query(`
          SELECT reponse, commentaire, 
                 TO_CHAR(date_reponse, 'DD/MM/YYYY HH24:MI') as date_reponse_formatted
          FROM reponses_votes 
          WHERE vote_id = $1 AND membre_id = $2
        `, [voteId, membreId]);

        if (monVoteResult.rows.length > 0) {
          aVote = true;
          monVote = monVoteResult.rows[0];
        }
      }

      // Calculer les pourcentages
      const totalVotes = parseInt(vote.total_votes);
      const pourcentages = {
        pour: totalVotes > 0 ? Math.round((vote.votes_pour / totalVotes) * 100) : 0,
        contre: totalVotes > 0 ? Math.round((vote.votes_contre / totalVotes) * 100) : 0,
        abstention: totalVotes > 0 ? Math.round((vote.votes_abstention / totalVotes) * 100) : 0
      };

      // Statut du quorum
      const quorumAtteint = totalVotes >= vote.quorum_requis;
      const pourcentageQuorum = Math.round((totalVotes / vote.quorum_requis) * 100);

      return {
        ...vote,
        votes_pour: parseInt(vote.votes_pour),
        votes_contre: parseInt(vote.votes_contre),
        votes_abstention: parseInt(vote.votes_abstention),
        total_votes: totalVotes,
        pourcentages,
        quorum_atteint: quorumAtteint,
        pourcentage_quorum: pourcentageQuorum,
        a_vote: aVote,
        mon_vote: monVote,
        est_expire: new Date() > new Date(vote.date_fin),
        peut_voter: !aVote && vote.statut === 'ouvert' && new Date() <= new Date(vote.date_fin)
      };

    } catch (error) {
      console.error('Erreur récupération détails vote:', error);
      throw error;
    }
  }

  // Obtenir la liste des votes
  async getVotes(options = {}) {
    try {
      const {
        statut = 'all',
        objet_type = 'all',
        page = 1,
        limit = 20,
        membre_id = null
      } = options;

      let whereClause = '';
      const params = [];
      let paramCount = 0;

      const conditions = [];

      if (statut !== 'all') {
        paramCount++;
        conditions.push(`v.statut = $${paramCount}`);
        params.push(statut);
      }

      if (objet_type !== 'all') {
        paramCount++;
        conditions.push(`v.objet_type = $${paramCount}`);
        params.push(objet_type);
      }

      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT v.*,
               createur.nom_complet as cree_par_nom,
               COUNT(DISTINCT rv.id) as total_votes,
               COUNT(CASE WHEN rv.reponse = 'pour' THEN 1 END) as votes_pour,
               COUNT(CASE WHEN rv.reponse = 'contre' THEN 1 END) as votes_contre,
               TO_CHAR(v.date_debut, 'DD/MM/YYYY HH24:MI') as date_debut_formatted,
               TO_CHAR(v.date_fin, 'DD/MM/YYYY HH24:MI') as date_fin_formatted,
               ${membre_id ? `
               CASE WHEN EXISTS(
                 SELECT 1 FROM reponses_votes 
                 WHERE vote_id = v.id AND membre_id = ${membre_id}
               ) THEN true ELSE false END as a_vote
               ` : 'false as a_vote'}
        FROM votes v
        JOIN membres createur ON v.cree_par = createur.id
        LEFT JOIN reponses_votes rv ON v.id = rv.vote_id
        ${whereClause}
        GROUP BY v.id, createur.nom_complet
        ORDER BY v.date_debut DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      params.push(limit, offset);
      const result = await pool.query(query, params);

      // Compter le total
      const countQuery = `
        SELECT COUNT(DISTINCT v.id) as total
        FROM votes v
        ${whereClause}
      `;
      const countResult = await pool.query(countQuery, params.slice(0, paramCount));

      return {
        votes: result.rows.map(vote => ({
          ...vote,
          est_expire: new Date() > new Date(vote.date_fin),
          peut_voter: !vote.a_vote && vote.statut === 'ouvert' && new Date() <= new Date(vote.date_fin)
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          pages: Math.ceil(countResult.rows[0].total / limit)
        }
      };

    } catch (error) {
      console.error('Erreur récupération votes:', error);
      throw error;
    }
  }

  // Obtenir les statistiques des votes
  async getStatistiques(options = {}) {
    try {
      const { date_debut = null, date_fin = null } = options;

      let whereClause = '';
      const params = [];

      if (date_debut && date_fin) {
        whereClause = 'WHERE v.date_debut BETWEEN $1 AND $2';
        params.push(date_debut, date_fin);
      }

      // Statistiques générales
      const statsGenerales = await pool.query(`
        SELECT 
          COUNT(*) as total_votes,
          COUNT(CASE WHEN statut = 'ouvert' THEN 1 END) as votes_ouverts,
          COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as votes_approuves,
          COUNT(CASE WHEN statut = 'rejete' THEN 1 END) as votes_rejetes,
          AVG(CASE WHEN statut != 'ouvert' THEN 
            (SELECT COUNT(*) FROM reponses_votes WHERE vote_id = v.id)
          END) as participation_moyenne
        FROM votes v
        ${whereClause}
      `, params);

      // Par type d'objet
      const parType = await pool.query(`
        SELECT 
          objet_type,
          COUNT(*) as nombre,
          COUNT(CASE WHEN statut = 'approuve' THEN 1 END) as approuves
        FROM votes v
        ${whereClause}
        GROUP BY objet_type
        ORDER BY nombre DESC
      `, params);

      return {
        generales: statsGenerales.rows[0],
        par_type: parType.rows
      };

    } catch (error) {
      console.error('Erreur statistiques votes:', error);
      throw error;
    }
  }
}

module.exports = new VoteService();