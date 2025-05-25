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

# Update index.html with script module
echo "📄 Updating index.html..."
cat > frontend/index.html << 'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ChatBGP - RFC 9003</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/index.js"></script>
</body>
</html>
HTML

# Create vite config if not exists
if [ ! -f "frontend/vite.config.js" ]; then
    echo "⚙️  Creating Vite config..."
    cat > frontend/vite.config.js << 'VITE'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: ['..']
    }
  }
})
VITE
fi

# Create frontend package.json if not exists
if [ ! -f "frontend/package.json" ]; then
    echo "📦 Creating frontend package.json..."
    cat > frontend/package.json << 'PACKAGE'
{
  "name": "chatbgp-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.0.0"
  }
}
PACKAGE
    
    echo "📦 Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
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

