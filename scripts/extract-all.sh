#!/bin/bash

echo "🔍 Extraction des livres de Rabbi Nachman..."
echo "==========================================

cd "$(dirname "$0")/.."

# Ensure data directories exist
mkdir -p data/extracted data/indexes data/chunks

# Start backend if not running
if ! curl -s http://localhost:3000/api/health > /dev/null; then
  echo "📦 Starting backend server..."
  cd backend
  npm install
  npm run dev &
  BACKEND_PID=$!
  
  # Wait for backend to be ready
  echo "⏳ Waiting for backend to start..."
  sleep 5
  
  # Check if backend is ready
  for i in {1..30}; do
    if curl -s http://localhost:3000/api/health > /dev/null; then
      echo "✅ Backend is ready!"
      break
    fi
    sleep 1
  done
fi

# Extract all books
echo ""
echo "📚 Starting extraction from Sefaria..."
echo "--------------------------------------"

curl -X POST http://localhost:3000/api/sefaria/extract-all \
  -H "Content-Type: application/json" \
  | jq '.'

echo ""
echo "✅ Extraction completed!"
echo ""

# Build indexes
echo "🔨 Building 3-level indexes..."
echo "-------------------------------"

curl -X POST http://localhost:3000/api/rag/build-indexes \
  -H "Content-Type: application/json" \
  | jq '.'

echo ""
echo "✅ Indexes built successfully!"
echo ""

# Load indexes into memory
echo "💾 Loading indexes into router..."
echo "----------------------------------"

curl -X POST http://localhost:3000/api/rag/load-indexes \
  -H "Content-Type: application/json" \
  | jq '.'

echo ""
echo "✅ System ready!"
echo ""
echo "📊 Summary:"
echo "-----------"
curl -s http://localhost:3000/api/sefaria/status | jq '.'

# Kill backend if we started it
if [ ! -z "$BACKEND_PID" ]; then
  echo ""
  echo "Stopping backend server..."
  kill $BACKEND_PID
fi

echo ""
echo "🎉 Setup complete! You can now start the application with:"
echo "   npm run dev"