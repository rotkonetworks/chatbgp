#!/bin/bash
# scripts/build-deploy.sh

set -e

# Configuration
DEPLOY_USER="alice"
DEPLOY_HOST="your-server.com"
DEPLOY_PATH_9003="/var/www/9003.rotko.net"
DEPLOY_PATH_CHATBGP="/var/www/chatbgp.rotko.net"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Building ChatBGP for production...${NC}"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf frontend/dist
rm -rf wasm/pkg

# Build WASM
echo -e "${YELLOW}🔨 Building WASM module...${NC}"
cd wasm
wasm-pack build --target web --out-dir pkg
cd ..

# Build frontend
echo -e "${YELLOW}📦 Building frontend...${NC}"
cd frontend

# Update vite config for production (base path)
cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // Change to '/chatbgp/' if deploying to subdirectory
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom']
        }
      }
    }
  },
  server: {
    fs: {
      allow: ['..']
    }
  }
})
EOF

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Build
npm run build

# Return to root
cd ..

echo -e "${GREEN}✅ Build complete!${NC}"
echo ""

# Optional: Deploy to server
echo "Choose deployment option:"
echo "1) Deploy to 9003.rotko.net"
echo "2) Deploy to chatbgp.rotko.net"
echo "3) Deploy to both"
echo "4) Create tarball only (manual deployment)"
echo "5) Exit"
read -p "Enter choice (1-5): " choice

case $choice in
    1|2|3)
        # Create deployment package
        echo -e "${YELLOW}📦 Creating deployment package...${NC}"
        tar -czf chatbgp-dist.tar.gz -C frontend/dist .

        # Deploy function
        deploy() {
            local path=$1
            local domain=$2
            
            echo -e "${YELLOW}🚀 Deploying to $domain...${NC}"
            
            # Upload
            scp chatbgp-dist.tar.gz $DEPLOY_USER@$DEPLOY_HOST:/tmp/
            
            # Extract and set permissions
            ssh $DEPLOY_USER@$DEPLOY_HOST << EOF
                sudo mkdir -p $path
                sudo tar -xzf /tmp/chatbgp-dist.tar.gz -C $path
                sudo chown -R www-data:www-data $path
                sudo chmod -R 755 $path
                rm /tmp/chatbgp-dist.tar.gz
                echo "✅ Deployed to $domain"
EOF
        }

        # Execute deployment
        if [ "$choice" = "1" ] || [ "$choice" = "3" ]; then
            deploy "$DEPLOY_PATH_9003" "9003.rotko.net"
        fi
        
        if [ "$choice" = "2" ] || [ "$choice" = "3" ]; then
            deploy "$DEPLOY_PATH_CHATBGP" "chatbgp.rotko.net"
        fi
        
        # Cleanup
        rm chatbgp-dist.tar.gz
        
        echo -e "${GREEN}✅ Deployment complete!${NC}"
        echo ""
        echo "Don't forget to configure nginx/apache for these domains!"
        ;;
        
    4)
        echo -e "${YELLOW}📦 Creating deployment tarball...${NC}"
        tar -czf chatbgp-dist.tar.gz -C frontend/dist .
        echo -e "${GREEN}✅ Created chatbgp-dist.tar.gz${NC}"
        echo "Upload and extract to your web server root"
        ;;
        
    5)
        echo "👋 Exiting without deployment"
        ;;
        
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

# Show nginx config example
echo ""
echo -e "${YELLOW}📋 Example nginx configuration:${NC}"
cat << 'NGINX'

server {
    listen 80;
    listen [::]:80;
    server_name 9003.rotko.net chatbgp.rotko.net;
    
    root /var/www/$server_name;
    index index.html;
    
    # WASM mime type
    location ~ \.wasm$ {
        add_header Content-Type application/wasm;
    }
    
    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|wasm)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

echo ""
echo -e "${GREEN}🎉 All done!${NC}"
