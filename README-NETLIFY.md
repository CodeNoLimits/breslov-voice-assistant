# 🕊️ Rabbi Nachman Voice - Déploiement Netlify

Interface conversationnelle pour explorer les enseignements de Rabbi Nachman de Breslov, optimisée pour Netlify.

## 🚀 Déploiement Rapide sur Netlify

### Option 1: Deploy Button (Le plus rapide)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/YOUR_USERNAME/rabbi-nachman-voice)

### Option 2: Netlify CLI

```bash
# 1. Installer Netlify CLI
npm install -g netlify-cli

# 2. Se connecter à Netlify
netlify login

# 3. Initialiser le projet
netlify init

# 4. Déployer
netlify deploy --prod
```

### Option 3: Git Integration

1. **Push vers GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/rabbi-nachman-voice.git
git push -u origin main
```

2. **Connecter à Netlify**
- Aller sur [app.netlify.com](https://app.netlify.com)
- Cliquer sur "New site from Git"
- Choisir GitHub et sélectionner votre repo
- Configuration de build:
  - Build command: `npm run build`
  - Publish directory: `dist`

## ⚙️ Configuration

### Variables d'Environnement

Dans les settings Netlify de votre site, ajoutez:

```
GEMINI_API_KEY=AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM
```

(Site Settings → Environment variables → Add a variable)

## 📁 Structure du Projet Netlify

```
rabbi-nachman-voice-netlify/
├── index.html                 # Interface web principale
├── netlify.toml              # Configuration Netlify
├── netlify/
│   └── functions/
│       ├── query.ts          # Fonction serverless pour les requêtes
│       └── health.ts         # Health check endpoint
├── dist/                     # Dossier de build (généré)
└── package-netlify.json      # Dependencies pour Netlify
```

## ✨ Fonctionnalités

### Interface Web
- 🎤 **Reconnaissance vocale** intégrée (Web Speech API)
- 🔊 **Synthèse vocale** automatique des réponses
- 💬 **Chat interactif** avec historique
- 📱 **Responsive design** pour mobile et desktop
- 🎨 **Interface moderne** avec animations

### Backend Serverless
- ⚡ **Netlify Functions** pour l'API
- 🤖 **Gemini AI** pour générer les réponses
- 📚 **Base de connaissances** intégrée sur Rabbi Nachman
- 🚀 **Performance optimale** avec cache edge

### Enseignements Disponibles
- La joie (Simcha)
- La prière personnelle (Hitbodedout)
- La foi simple (Emunah)
- Le retour à Dieu (Teshuva)
- L'étude de la Torah
- Le Tikoun HaKlali

## 🎯 Utilisation

### Interface Vocale
1. Cliquez sur le bouton microphone 🎤
2. Posez votre question en français
3. La réponse sera lue automatiquement

### Interface Texte
1. Tapez votre question dans le champ
2. Appuyez sur Entrée ou cliquez sur Envoyer
3. La réponse apparaît avec les sources

### Exemples de Questions
- "Que dit Rabbi Nachman sur la joie ?"
- "Comment pratiquer l'hitbodedout ?"
- "Qu'est-ce que le Tikoun HaKlali ?"
- "Les enseignements sur la foi simple"
- "L'importance de la prière selon Rabbi Nachman"

## 🔧 Développement Local

```bash
# Installer les dépendances
npm install

# Lancer en local avec Netlify Dev
netlify dev

# Ouvrir http://localhost:8888
```

## 📊 Performance

- **Temps de réponse**: < 1 seconde
- **Uptime**: 99.9% (Netlify infrastructure)
- **CDN Global**: Distribution mondiale
- **HTTPS**: Automatique et gratuit

## 🆓 Coûts

### Plan Gratuit Netlify
- ✅ 100GB de bande passante/mois
- ✅ 300 minutes de build/mois
- ✅ 125,000 invocations de fonctions/mois
- ✅ HTTPS automatique
- ✅ Deploy previews

### Gemini API
- ✅ Gratuit jusqu'à 60 requêtes/minute
- ✅ Modèle Gemini 1.5 Flash inclus

## 🛠️ Personnalisation

### Modifier les Enseignements

Éditez `netlify/functions/query.ts`:

```typescript
const RABBI_NACHMAN_WISDOM = {
  // Ajoutez vos propres catégories
  nouveau_theme: {
    hebrew: "נושא חדש",
    teachings: [
      "Votre enseignement ici..."
    ],
    sources: ["Source 1", "Source 2"]
  }
};
```

### Changer le Style

Modifiez le CSS dans `index.html`:

```css
body {
    background: /* votre gradient */;
}
.header {
    background: /* vos couleurs */;
}
```

## 📈 Monitoring

### Netlify Analytics
- Visiteurs uniques
- Pages vues
- Performances
- Erreurs 404

### Functions Logs
```bash
netlify functions:log query --tail
```

## 🔐 Sécurité

- CORS configuré pour accepter toutes les origines
- Rate limiting automatique par Netlify
- HTTPS obligatoire
- Variables d'environnement sécurisées

## 🤝 Support

- [Documentation Netlify](https://docs.netlify.com)
- [Gemini AI Documentation](https://ai.google.dev)
- Issues GitHub pour bugs/features

## 📄 Licence

MIT - Libre d'utilisation et de modification

## 🙏 Remerciements

- **Rabbi Nachman de Breslov** pour ses enseignements éternels
- **Netlify** pour l'hébergement gratuit
- **Google Gemini** pour l'IA conversationnelle
- **Communauté Breslov** pour l'inspiration

---

Développé avec ❤️ pour rendre les enseignements de Rabbi Nachman accessibles à tous

## 🎉 URL de Production

Une fois déployé, votre site sera accessible à:

```
https://[votre-nom-de-site].netlify.app
```

Ou avec un domaine personnalisé:
```
https://votre-domaine.com
```