# 🚀 Guide de Déploiement - LES COMBIS sur Netlify + Heroku

## 📋 Architecture de Déploiement

- **Frontend** (React) → **Netlify** (gratuit)
- **Backend** (Node.js + PostgreSQL) → **Heroku** (gratuit tier disponible)
- **Base de données** → **Heroku Postgres** (addon gratuit)

## 🎯 Étape 1 : Déployer le Backend sur Heroku

### A. Créer un compte Heroku
1. Allez sur [heroku.com](https://heroku.com)
2. Créez un compte gratuit
3. Installez Heroku CLI : `npm install -g heroku`

### B. Préparer et déployer le backend

```bash
# 1. Se connecter à Heroku
heroku login

# 2. Naviguer vers le dossier server
cd server

# 3. Créer l'application Heroku
heroku create combis-backend-app

# 4. Ajouter PostgreSQL
heroku addons:create heroku-postgresql:mini

# 5. Configurer les variables d'environnement
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=votre_jwt_secret_super_securise_123456789
heroku config:set SMS_PROVIDER=orange_sms_api
heroku config:set SMS_API_KEY=votre_cle_sms
heroku config:set SMS_SENDER_ID=COMBIS
heroku config:set FRONTEND_URL=https://votre-app.netlify.app

# 6. Initialiser Git et déployer
git init
git add .
git commit -m "Deploy backend to Heroku"
git push heroku main
```

### C. Configurer la base de données

```bash
# 1. Obtenir l'URL de la DB
heroku config:get DATABASE_URL

# 2. Exécuter les migrations
heroku run npm run migrate

# 3. Si vous avez un script SQL d'initialisation
heroku pg:psql < ../database/schema.sql
heroku pg:psql < ../database/advanced_features.sql
```

## 🎯 Étape 2 : Déployer le Frontend sur Netlify

### A. Méthode 1 : Via Git (Recommandée)

1. **Poussez votre code sur GitHub** :
```bash
# Depuis la racine du projet
git add .
git commit -m "Ready for deployment"
git push origin main
```

2. **Connectez-vous à Netlify** :
   - Allez sur [netlify.com](https://netlify.com)
   - Connectez-vous avec GitHub
   - Cliquez sur "New site from Git"
   - Sélectionnez votre repo `combis-app`

3. **Configuration de build** :
   - **Base directory** : `client`
   - **Build command** : `npm run build`
   - **Publish directory** : `client/build`

4. **Variables d'environnement** :
   Dans l'onglet "Site settings" > "Environment variables" :
   ```
   REACT_APP_API_BASE_URL = https://combis-backend-app.herokuapp.com/api
   REACT_APP_SOCKET_URL = https://combis-backend-app.herokuapp.com
   REACT_APP_APP_NAME = LES COMBIS
   REACT_APP_VERSION = 2.0.0
   GENERATE_SOURCEMAP = false
   ```

### B. Méthode 2 : Drag & Drop

```bash
# 1. Builder le frontend localement
cd client
npm install
npm run build:prod

# 2. Uploader le dossier 'build' sur Netlify
# Allez sur netlify.com > "Deploy manually" > Glissez le dossier 'build'
```

## 🎯 Étape 3 : Configuration DNS (Optionnel)

Si vous avez un nom de domaine :

1. **Sur Netlify** :
   - Site settings > Domain management
   - Add custom domain : `votre-domaine.com`

2. **Chez votre registrar** :
   - Créez un enregistrement CNAME : `www` → `votre-app.netlify.app`
   - Ou un enregistrement A vers l'IP de Netlify

## 🔧 Configuration Post-Déploiement

### Mettre à jour les URLs dans le code

1. **Backend** - Mettre à jour les CORS :
```javascript
// server/index.js
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://votre-app.netlify.app'
  ],
  credentials: true
}));
```

2. **Frontend** - Vérifier les URLs API :
```javascript
// client/src/services/api.js
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';
```

## 🔍 Vérifications de Déploiement

### ✅ Checklist Backend (Heroku)
```bash
# Vérifier que l'app démarre
heroku logs --tail

# Tester l'API
curl https://combis-backend-app.herokuapp.com/

# Vérifier la DB
heroku pg:info
```

### ✅ Checklist Frontend (Netlify)
- [ ] Site accessible via l'URL Netlify
- [ ] Routing fonctionne (pas d'erreur 404)
- [ ] Connexion au backend réussie
- [ ] Variables d'environnement correctes

## 🚨 Résolution de Problèmes

### Erreurs communes Backend
```bash
# Erreur de port
# ✅ Utilisez process.env.PORT dans index.js

# Erreur de DB
# ✅ Vérifiez DATABASE_URL dans les config vars

# Erreur CORS
# ✅ Ajoutez l'URL Netlify dans les origins CORS
```

### Erreurs communes Frontend
```bash
# Erreur de build
# ✅ Ajoutez CI=false dans le build command

# Erreur 404 sur les routes
# ✅ Vérifiez que _redirects existe dans public/

# API non accessible
# ✅ Vérifiez REACT_APP_API_BASE_URL
```

## 💰 Coûts

### Plan Gratuit Heroku (par app)
- **Dynos** : 550h/mois gratuit
- **PostgreSQL** : 10k lignes max
- **Limitation** : L'app s'endort après 30min d'inactivité

### Plan Gratuit Netlify
- **Bandwidth** : 100GB/mois
- **Build minutes** : 300/mois
- **Sites** : Illimités

## 🔄 Déploiement Continu

### Auto-déploiement activé :
- **Push sur `main`** → **Deploy automatique**
- **Netlify** redéploie le frontend
- **Heroku** redéploie le backend

## 🎉 URLs Finales

Après déploiement vous aurez :
- **Frontend** : `https://votre-app.netlify.app`
- **Backend API** : `https://combis-backend-app.herokuapp.com/api`
- **Admin Panel** : `https://votre-app.netlify.app/admin`

---

## 🆘 Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs : `heroku logs --tail`
2. Testez les APIs : `curl https://votre-backend.herokuapp.com/api/`
3. Vérifiez les variables d'environnement sur les deux plateformes

**🎊 Votre application LES COMBIS sera maintenant accessible 24h/24 avec toutes les fonctionnalités avancées !**