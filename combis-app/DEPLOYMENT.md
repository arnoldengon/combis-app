# Guide de déploiement - LES COMBIS

## 🚀 Déploiement Local

### Prérequis
- Node.js v16+
- PostgreSQL v13+
- npm ou yarn

### Installation complète
```bash
cd C:\Users\arnol\.local\bin\combis-app
npm run install:all
```

### Configuration base de données
```bash
# Créer la base de données
createdb combis_db

# Configurer les variables d'environnement
cp server/.env.example server/.env
# Éditer server/.env avec vos paramètres

# Exécuter les migrations
cd server
npm run migrate
```

### Démarrage en développement
```bash
npm run dev
```

L'application sera accessible sur :
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## 🌐 Déploiement Production

### Option 1: Heroku + Netlify (Recommandé)

#### Backend sur Heroku
```bash
# Installer Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Se connecter à Heroku
heroku login

# Créer l'application
heroku create combis-api-production

# Ajouter PostgreSQL
heroku addons:create heroku-postgresql:mini

# Configurer les variables d'environnement
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=votre_jwt_secret_production
heroku config:set FRONTEND_URL=https://votre-app.netlify.app

# Déployer
git init
git add .
git commit -m "Initial commit"
heroku git:remote -a combis-api-production
git push heroku main

# Exécuter les migrations
heroku run npm run migrate
```

#### Frontend sur Netlify
1. Connecter votre dépôt GitHub à Netlify
2. Configurer les variables d'environnement :
   - `REACT_APP_API_URL=https://combis-api-production.herokuapp.com`
3. Déployer automatiquement

### Option 2: VPS avec Docker

#### Dockerfile Backend
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --production
COPY server/ ./
EXPOSE 5000
CMD ["npm", "start"]
```

#### docker-compose.yml
```yaml
version: '3.8'
services:
  db:
    image: postgres:13
    environment:
      POSTGRES_DB: combis_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  api:
    build: .
    ports:
      - "5000:5000"
    environment:
      NODE_ENV: production
      DB_HOST: db
      DB_NAME: combis_db
      DB_USER: postgres
      DB_PASSWORD: password
    depends_on:
      - db

volumes:
  postgres_data:
```

## 🔧 Variables d'environnement

### Backend (.env)
```env
NODE_ENV=production
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=combis_db
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe

# JWT
JWT_SECRET=votre_jwt_secret_très_sécurisé
JWT_EXPIRE=7d

# CORS
FRONTEND_URL=https://votre-frontend.com
```

### Frontend (.env)
```env
REACT_APP_API_URL=https://votre-api.herokuapp.com
```

## 📊 Monitoring et Maintenance

### Logs Heroku
```bash
heroku logs --tail -a combis-api-production
```

### Sauvegarde base de données
```bash
heroku pg:backups:capture -a combis-api-production
heroku pg:backups:download -a combis-api-production
```

### Mise à jour
```bash
git add .
git commit -m "Update: description"
git push heroku main
```

## 🔒 Sécurité Production

1. **HTTPS obligatoire** - Configuré automatiquement sur Heroku/Netlify
2. **JWT Secrets forts** - Générer des clés sécurisées
3. **Variables d'environnement** - Jamais dans le code
4. **CORS configuré** - Limiter aux domaines autorisés
5. **Rate limiting** - Déjà implémenté dans l'API

## 🎯 Connexion initiale

Après déploiement, utilisez ces identifiants pour la première connexion :

**Compte Administrateur:**
- Téléphone: `674448847` (Anthony)
- Mot de passe: `02061992` (format DDMMYYYY de sa date de naissance)

**Autres membres:**
- Utiliser leur numéro de téléphone + date de naissance au format DDMMYYYY

## ✅ Checklist de déploiement

- [ ] Base de données créée et migrée
- [ ] Variables d'environnement configurées
- [ ] Backend déployé et accessible
- [ ] Frontend déployé avec la bonne API_URL
- [ ] Test de connexion réussi
- [ ] Données de test chargées
- [ ] Backup configuré
- [ ] Monitoring mis en place

## 🆘 Dépannage

### Erreur de connexion BDD
```bash
heroku config -a combis-api-production
heroku pg:info -a combis-api-production
```

### Erreur CORS
Vérifier que `FRONTEND_URL` est correctement configuré dans les variables d'environnement backend.

### Page 404 sur Netlify
Le fichier `_redirects` doit être présent dans `client/public/`.

---

Pour toute question, contactez l'équipe de développement.