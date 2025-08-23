const pool = require('../config/database');

class AuditService {
  // Enregistrer une action d'audit
  async enregistrerAction(options) {
    try {
      const {
        membre_id,
        action,
        table_affectee = null,
        enregistrement_id = null,
        anciennes_valeurs = null,
        nouvelles_valeurs = null,
        ip_address = null,
        user_agent = null
      } = options;

      await pool.query(`
        INSERT INTO audit_logs (
          membre_id, action, table_affectee, enregistrement_id,
          anciennes_valeurs, nouvelles_valeurs, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        membre_id,
        action,
        table_affectee,
        enregistrement_id,
        anciennes_valeurs ? JSON.stringify(anciennes_valeurs) : null,
        nouvelles_valeurs ? JSON.stringify(nouvelles_valeurs) : null,
        ip_address,
        user_agent
      ]);

    } catch (error) {
      console.error('Erreur enregistrement audit:', error);
    }
  }

  // Obtenir l'historique d'audit
  async getHistorique(options = {}) {
    try {
      const {
        membre_id = null,
        action = null,
        table_affectee = null,
        date_debut = null,
        date_fin = null,
        page = 1,
        limit = 50
      } = options;

      let whereClause = '';
      const params = [];
      let paramCount = 0;
      const conditions = [];

      if (membre_id) {
        paramCount++;
        conditions.push(`al.membre_id = $${paramCount}`);
        params.push(membre_id);
      }

      if (action) {
        paramCount++;
        conditions.push(`al.action = $${paramCount}`);
        params.push(action);
      }

      if (table_affectee) {
        paramCount++;
        conditions.push(`al.table_affectee = $${paramCount}`);
        params.push(table_affectee);
      }

      if (date_debut && date_fin) {
        paramCount += 2;
        conditions.push(`al.created_at BETWEEN $${paramCount - 1} AND $${paramCount}`);
        params.push(date_debut, date_fin);
      }

      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          al.*,
          m.nom_complet,
          TO_CHAR(al.created_at, 'DD/MM/YYYY HH24:MI:SS') as created_at_formatted
        FROM audit_logs al
        LEFT JOIN membres m ON al.membre_id = m.id
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      params.push(limit, offset);
      const result = await pool.query(query, params);

      return {
        logs: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.rows.length
        }
      };

    } catch (error) {
      console.error('Erreur récupération historique audit:', error);
      throw error;
    }
  }
}

module.exports = new AuditService();