# 🎯 Rabbi Nachman Voice - Application Conversationnelle

Interface vocale pour explorer les enseignements de Rabbi Nachman de Breslov avec une architecture RAG à 3 niveaux optimisée pour Gemini 1.5 Pro.

## ✨ Fonctionnalités

- 🎤 **Interface vocale complète** : Speech-to-Text et Text-to-Speech en temps réel
- 📚 **Corpus complet** : Tous les livres principaux de Rabbi Nachman
- 🧠 **RAG hiérarchique** : Navigation intelligente dans des millions de tokens
- 🌐 **Multilingue** : Support hébreu, français et anglais
- 💾 **Cache intelligent** : Réponses instantanées pour requêtes fréquentes
- 📊 **Citations exactes** : Références précises avec sources

## 🏗️ Architecture

### Système à 3 Niveaux

```
Niveau 1: Master Index (< 100K tokens)
    ↓ Route vers les livres pertinents
Niveau 2: Book Indexes (< 200K tokens/livre)
    ↓ Identifie les sections spécifiques
Niveau 3: Content Chunks (50-100K tokens)
    ↓ Récupère le contenu exact
Gemini 1.5 Pro → Génère la réponse
```

### Stack Technique

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, Vite, TailwindCSS
- **Base de données**: PostgreSQL avec pgvector
- **Cache**: Redis
- **LLM**: Gemini 1.5 Pro (1M tokens context)
- **Voice**: Web Speech API / OpenAI Whisper & TTS

## 🚀 Installation Rapide

### Prérequis

- Node.js 18+
- Docker & Docker Compose
- Clé API Gemini (AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM)
- (Optionnel) Clé API OpenAI pour voix avancée

### 1. Cloner le projet

```bash
git clone <repo-url>
cd rabbi-nachman-voice
```

### 2. Configuration

Créer `.env` dans le dossier backend :

```env
# APIs
GEMINI_API_KEY=AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM
OPENAI_API_KEY=your_openai_key_if_available

# Database
DATABASE_URL=postgresql://rabbi_nachman:secure_password@localhost:5432/rabbi_nachman_voice
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your_secret_key_change_me
CORS_ORIGIN=http://localhost:5173
```

### 3. Lancer avec Docker

```bash
# Démarrer les services
docker-compose up -d

# Installer les dépendances
npm install

# Extraire les livres et construire les index
./scripts/extract-all.sh

# Lancer l'application
npm run dev
```

### 4. Sans Docker (développement)

```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev

# Terminal 3 - Extraction (une fois)
./scripts/extract-all.sh
```

## 📖 Utilisation

### Interface Vocale

1. **Cliquer sur le microphone** pour commencer l'écoute
2. **Poser votre question** en français
3. **L'application recherche** dans les textes de Rabbi Nachman
4. **La réponse est lue** automatiquement

### Exemples de Questions

- "Que dit Rabbi Nachman sur la joie ?"
- "Comment pratiquer l'hitbodedout ?"
- "Qu'est-ce que le Tikoun HaKlali ?"
- "Les enseignements sur la foi simple"
- "L'importance de la prière selon Rabbi Nachman"

### Raccourcis Clavier

- `Espace` : Activer/désactiver le microphone
- `Échap` : Arrêter la synthèse vocale
- `H` : Afficher l'historique
- `S` : Afficher les sources

## 🔧 API Endpoints

### Extraction & Indexation

```bash
# Extraire tous les livres
POST /api/sefaria/extract-all

# Construire les index
POST /api/rag/build-indexes

# Charger les index
POST /api/rag/load-indexes
```

### Requêtes

```bash
# Question normale
POST /api/rag/query
{
  "query": "Votre question",
  "language": "french"
}

# Streaming
POST /api/rag/query
{
  "query": "Votre question",
  "streamResponse": true
}
```

### Voice

```bash
# Transcription
POST /api/voice/transcribe
FormData: { audio: Blob }

# Synthèse
POST /api/voice/synthesize
{
  "text": "Texte à lire",
  "language": "fr"
}
```

## 📊 Performance

- **Latence première réponse**: < 2 secondes
- **Précision citations**: > 95%
- **Contexte maximum**: 900K tokens
- **Utilisateurs simultanés**: 100+

## 🗂️ Structure des Données

```
data/
├── extracted/       # Livres extraits de Sefaria
├── indexes/         # Index à 3 niveaux
│   ├── master/     # Index principal
│   ├── books/      # Index par livre
│   └── chunks/     # Index des chunks
└── chunks/         # Contenu chunké
```

## 🐛 Troubleshooting

### Problème: "Sefaria API not responding"

L'extracteur utilise 5 stratégies de fallback :
1. API directe v3
2. API batch
3. API v2
4. Web scraping
5. Backup local

### Problème: "Token limit exceeded"

Le système compresse automatiquement les chunks si nécessaire et limite le contexte à 900K tokens.

### Problème: "Voice not working"

- Chrome/Edge recommandé pour Web Speech API
- Vérifier les permissions microphone
- Si OpenAI non configuré, utilise Web Speech API

## 🤝 Contribution

Les contributions sont bienvenues ! Voir [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 Licence

MIT - Voir [LICENSE](LICENSE)

## 🙏 Remerciements

- **Sefaria** pour l'accès aux textes
- **Rabbi Nachman de Breslov** pour ses enseignements éternels
- **Gemini 1.5 Pro** pour le traitement du langage naturel

---

Développé avec ❤️ pour la communauté Breslov