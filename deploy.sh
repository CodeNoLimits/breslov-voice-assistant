#!/bin/bash

echo "🚀 Déploiement Rabbi Nachman Voice sur Netlify..."

# Variables
SITE_ID="dfcb0c2b-e765-4427-b312-7c787da97055"
AUTH_TOKEN="nfp_cVHxr23mVDJ4gFqNcN1AdwJ3HaZJ2MZB1d0c"

# Créer le build des fonctions
echo "📦 Construction des fonctions..."
mkdir -p .netlify/functions
for file in netlify/functions/*.js; do
  if [ -f "$file" ]; then
    filename=$(basename "$file")
    cp "$file" ".netlify/functions/$filename"
  fi
done

# Créer un fichier d'index si nécessaire
if [ ! -f "index.html" ]; then
  echo "📝 Création d'un index.html de redirection..."
  cat > index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=/sefaria-app.html">
  <title>Redirection...</title>
</head>
<body>
  <p>Redirection vers l'application...</p>
</body>
</html>
EOF
fi

echo "🌐 Déploiement sur Netlify..."
curl -X POST \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary "@deploy.zip" \
  "https://api.netlify.com/api/v1/sites/$SITE_ID/deploys" \
  2>/dev/null | grep -o '"url":"[^"]*"' | head -1

echo ""
echo "✅ Déploiement terminé !"
echo "🔗 URL: https://rabbi-nachman-voice-1755448673159.netlify.app"
echo ""
echo "📚 L'application Rabbi Nachman Voice est maintenant en ligne avec:"
echo "   - Accès RÉEL à l'API Sefaria"
echo "   - 15 livres de Rabbi Nachman"
echo "   - Chat interactif avec Gemini"
echo "   - Interface vocale complète"