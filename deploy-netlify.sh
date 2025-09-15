#!/bin/bash

echo "🚀 Déploiement Rabbi Nachman Voice sur Netlify"
echo "=============================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if netlify CLI is installed
if ! command -v netlify &> /dev/null; then
    echo -e "${YELLOW}📦 Installation de Netlify CLI...${NC}"
    npm install -g netlify-cli
fi

# Create dist directory
echo -e "${GREEN}📁 Création du dossier dist...${NC}"
mkdir -p dist

# Copy files to dist
echo -e "${GREEN}📋 Copie des fichiers...${NC}"
cp index.html dist/
cp -r netlify dist/ 2>/dev/null || true

# Install dependencies for functions
echo -e "${GREEN}📦 Installation des dépendances...${NC}"
if [ -f "package-netlify.json" ]; then
    cp package-netlify.json package.json
fi
npm install

# Check if logged in to Netlify
echo -e "${YELLOW}🔐 Vérification de la connexion Netlify...${NC}"
if ! netlify status &> /dev/null; then
    echo -e "${YELLOW}Connexion à Netlify requise${NC}"
    netlify login
fi

# Initialize or link site
echo -e "${GREEN}🔗 Configuration du site Netlify...${NC}"
if [ ! -f ".netlify/state.json" ]; then
    echo -e "${YELLOW}Nouveau site détecté${NC}"
    netlify init
else
    echo -e "${GREEN}Site existant trouvé${NC}"
fi

# Deploy
echo -e "${GREEN}🚀 Déploiement en cours...${NC}"
netlify deploy --prod --dir=dist

# Get site URL
SITE_URL=$(netlify status --json | grep -o '"url":"[^"]*' | grep -o 'https://[^"]*')

echo ""
echo -e "${GREEN}✅ Déploiement terminé avec succès!${NC}"
echo -e "${GREEN}🌐 Votre site est accessible à: ${YELLOW}$SITE_URL${NC}"
echo ""
echo "📝 N'oubliez pas d'ajouter votre clé Gemini API dans les variables d'environnement:"
echo "   Site Settings → Environment variables → GEMINI_API_KEY"
echo ""
echo "🎤 Fonctionnalités disponibles:"
echo "   - Interface vocale (microphone)"
echo "   - Chat interactif"
echo "   - Synthèse vocale des réponses"
echo "   - Enseignements de Rabbi Nachman"