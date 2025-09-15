#!/bin/bash

echo "🧪 Test de l'API Rabbi Nachman Voice"
echo "====================================="
echo ""

# Test health check
echo "1. Test Health Check..."
curl -s http://localhost:3000/api/health | jq '.'
echo ""

# Test extraction status
echo "2. Vérification des livres extraits..."
curl -s http://localhost:3000/api/sefaria/status | jq '.'
echo ""

# Test query
echo "3. Test d'une requête..."
echo "Question: Que dit Rabbi Nachman sur la joie ?"
echo ""

curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Que dit Rabbi Nachman sur la joie ?",
    "language": "french"
  }' | jq '.'

echo ""
echo "✅ Tests terminés!"