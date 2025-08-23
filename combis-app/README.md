# LES COMBIS - Système d'Assistance Solidaire

Application web de gestion d'assistance solidaire pour le groupe "LES COMBIS".

## 🎯 Fonctionnalités

### Gestion des membres
- Inscription et profils des membres
- Suivi des cotisations annuelles (paiement mensuel)
- Vérification du statut "à jour" des cotisations

### Types de sinistres couverts
- **Décès parent/enfant** : 100,000 FCFA
- **Décès du membre** : 200,000 FCFA  
- **Opération chirurgicale** : 75,000 FCFA
- **Maladie grave** (sans opération) : 50,000 FCFA (sur main levée)
- **Mariage** : 50,000 FCFA
- **Naissance** : 30,000 FCFA

### Fonctionnalités avancées
- Dashboard administratif
- Notifications automatiques
- Historique complet des transactions
- Génération de rapports
- Système de validation des sinistres
- Statistiques et analyses

## 🛠️ Technologies utilisées

### Backend
- Node.js + Express.js
- PostgreSQL
- JWT pour l'authentification
- Multer pour l'upload de fichiers

### Frontend
- React.js 18
- TypeScript
- Tailwind CSS
- React Query pour la gestion d'état
- React Hook Form pour les formulaires

## 📦 Installation

### Prérequis
- Node.js (v16+)
- PostgreSQL (v13+)
- npm ou yarn

### Installation complète
```bash
# Cloner le projet
git clone <url-du-repo>
cd combis-app

# Installer toutes les dépendances
npm run install:all

# Configurer la base de données
cp server/.env.example server/.env
# Éditer server/.env avec vos paramètres de BDD

# Créer la base de données et exécuter les migrations
createdb combis_db
psql -d combis_db -f database/schema.sql

# Démarrer l'application en mode développement
npm run dev
```

### Installation manuelle

#### Backend
```bash
cd server
npm install
cp .env.example .env
# Configurer les variables d'environnement
npm run dev
```

#### Frontend
```bash
cd client
npm install
npm start
```

## 🗄️ Base de données

### Structure principale
- `membres` : Informations des membres
- `cotisations` : Suivi des paiements mensuels
- `sinistres` : Déclarations et traitements des sinistres
- `types_sinistres` : Définition des types de couverture
- `roles` : Système de permissions

### Migration
```bash
cd server
npm run migrate
```

## 🚀 Utilisation

### Démarrage rapide
1. L'application démarre sur `http://localhost:3000`
2. L'API backend est disponible sur `http://localhost:5000`
3. Utilisez les identifiants par défaut pour vous connecter

### Scripts disponibles
```bash
npm run dev          # Démarrer en mode développement
npm run build        # Construire pour la production
npm run start        # Démarrer en production
npm run install:all  # Installer toutes les dépendances
```

## 👥 Rôles et permissions

- **Admin** : Accès complet au système
- **Trésorier** : Gestion des finances et validation des paiements
- **Membre** : Accès aux fonctionnalités de base

## 📱 Fonctionnalités mobiles

L'application est responsive et optimisée pour les appareils mobiles.

## 🔒 Sécurité

- Authentification JWT
- Chiffrement des mots de passe
- Rate limiting
- Validation des données
- Upload sécurisé de fichiers

## 📊 Rapports et statistiques

- État des cotisations
- Historique des sinistres
- Analyses financières
- Exports en différents formats

## 🆘 Support

Pour toute question ou problème, contactez l'équipe de développement.

## 📄 Licence

Propriété du groupe "LES COMBIS" - Usage interne uniquement.