// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // IMPORTANT: Set base to your repo name for GitHub Pages
  // If your repo is https://github.com/username/chatbgp
  // then set base: '/chatbgp/'
  // If deploying to username.github.io, use base: '/'
  base: process.env.GITHUB_PAGES ? '/chatbgp/' : '/', // https://rotkonetworks.github.io/chatbgp
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
