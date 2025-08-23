const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'combis_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Début de la migration...');

    // Lire et exécuter le schéma
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📋 Application du schéma de base de données...');
    await client.query(schema);
    console.log('✅ Schéma appliqué avec succès');

    // Lire et exécuter les données de test
    const seedPath = path.join(__dirname, 'seed.sql');
    if (fs.existsSync(seedPath)) {
      const seed = fs.readFileSync(seedPath, 'utf8');
      
      console.log('🌱 Insertion des données de test...');
      await client.query(seed);
      console.log('✅ Données de test insérées avec succès');
    }

    console.log('🎉 Migration terminée avec succès!');

    // Afficher quelques statistiques
    const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM membres) as membres,
        (SELECT COUNT(*) FROM cotisations) as cotisations,
        (SELECT COUNT(*) FROM sinistres) as sinistres,
        (SELECT COUNT(*) FROM types_sinistres) as types_sinistres
    `);

    console.log('\n📊 Statistiques de la base de données:');
    console.log(`   - ${stats.rows[0].membres} membres`);
    console.log(`   - ${stats.rows[0].cotisations} cotisations`);
    console.log(`   - ${stats.rows[0].sinistres} sinistres`);
    console.log(`   - ${stats.rows[0].types_sinistres} types de sinistres`);

  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Exécuter la migration si le script est appelé directement
if (require.main === module) {
  migrate();
}

module.exports = { migrate };