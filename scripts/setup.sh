#!/bin/bash
set -e

echo "🚀 Setting up ChatBGP..."

# Create symlink to WASM package in frontend
echo "📦 Creating WASM symlink..."
cd frontend/src
if [ ! -L "wasm" ]; then
    ln -s ../../wasm/pkg wasm
    echo "✅ Symlink created: frontend/src/wasm -> wasm/pkg"
else
    echo "✅ Symlink already exists"
fi
cd ../..

# Check if App.jsx exists
if [ ! -f "frontend/src/App.jsx" ]; then
    echo "📝 App.jsx not found. Creating it..."
    echo "Please save the React component code to frontend/src/App.jsx"
    echo "You can find it in the ChatBGP artifact above"
else
    echo "✅ App.jsx found"
fi

# Build WASM
echo "🔨 Building WASM module..."
npm run build:wasm

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy the App.jsx code from the artifact above to frontend/src/App.jsx"
echo "2. Run 'npm run dev' to start the development server"
echo "3. Or run 'npm run build' to build for production"
echo ""
echo "Project structure:"
tree -L 3 -I 'node_modules|target'
