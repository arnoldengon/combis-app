const { Client } = require('pg');
require('dotenv').config();

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('📊 Connexion à la base de données réussie');

    // Vérifier si les tables existent déjà
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'membres'
    `);

    if (result.rows.length === 0) {
      console.log('🏗️  Création du schéma initial...');
      
      // Exécuter le schéma de base
      const fs = require('fs');
      const path = require('path');
      
      const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schema);
        console.log('✅ Schéma de base créé');
      }

      // Exécuter le schéma des fonctionnalités avancées
      const advancedPath = path.join(__dirname, '..', '..', 'database', 'advanced_features.sql');
      if (fs.existsSync(advancedPath)) {
        const advanced = fs.readFileSync(advancedPath, 'utf8');
        await client.query(advanced);
        console.log('✅ Fonctionnalités avancées installées');
      }

      console.log('🎉 Migration terminée avec succès!');
    } else {
      console.log('✅ Base de données déjà initialisée');
    }

  } catch (error) {
    console.error('❌ Erreur de migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;