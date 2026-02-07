#!/bin/bash

# Unizwap Frontend Startup Script

echo "🚀 Starting Unizwap Frontend..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "⚠️  Please update .env with your contract addresses before starting the app!"
    echo ""
    read -p "Press Enter to continue or Ctrl+C to exit..."
fi

echo "🎨 Starting development server..."
echo "📱 App will be available at http://localhost:3000"
echo ""

npm start
