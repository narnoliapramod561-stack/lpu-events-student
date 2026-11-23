import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

function getLocalLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function lanInfoPlugin(): Plugin {
  return {
    name: 'lan-info-logger',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const lanIp = getLocalLanIp();
        setTimeout(() => {
          console.log('\n==================================================');
          console.log('  Student Website is running.');
          console.log('');
          console.log('  Computer:');
          console.log('  http://localhost:3000');
          console.log('');
          console.log('  Mobile:');
          console.log(`  http://${lanIp}:3000`);
          console.log('==================================================\n');
        }, 150);
      });
    }
  };
}

const STUDENT_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://*.posthog.com https://us-assets.i.posthog.com https://us.i.posthog.com https://eu.i.posthog.com https://app.posthog.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://images.unsplash.com https://upload.wikimedia.org https://*.supabase.co https://*.lpuevents.live https://lpuevents.live https://images.lpuevents.live https://*.google-analytics.com https://*.googletagmanager.com; connect-src 'self' http: ws: https://*.supabase.co wss://*.supabase.co https://*.lpuevents.live wss://*.lpuevents.live https://images.lpuevents.live https://*.posthog.com https://us-assets.i.posthog.com https://us.i.posthog.com https://eu.i.posthog.com https://app.posthog.com https://*.cloudflareinsights.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';"
};

function securityHeadersPlugin(): Plugin {
  return {
    name: 'security-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        for (const [key, value] of Object.entries(STUDENT_SECURITY_HEADERS)) {
          res.setHeader(key, value);
        }
        const url = req.url?.split('?')[0] || '';
        if (
          url === '/_headers' ||
          url === '/_redirects' ||
          url.startsWith('/.') ||
          url === '/package.json' ||
          url === '/package-lock.json' ||
          url === '/tsconfig.json'
        ) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        next();
      });
    }
  };
}

const SUPABASE_REST_URL = 'https://tbehdigakmuoqchaaawr.supabase.co/rest/v1/rpc/get_ads_manifest_bundle';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiZWhkaWdha211b3FjaGFhYXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4MTkwMjQsImV4cCI6MjExMDM5NTAyNH0.fTy5FnzImr_EfODr43EVMiYJVQ6jYw9zqmNFBGIsvbw';

function liveAdsDevPlugin(): Plugin {
  return {
    name: 'live-ads-dev-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        const pathname = rawUrl.split('?')[0];

        if (req.method === 'OPTIONS' && (pathname === '/api/cache/invalidate' || pathname === '/api/public/ads-manifest')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.statusCode = 204;
          res.end();
          return;
        }

        if (pathname === '/api/cache/invalidate') {
          try {
            server.hot.send({
              type: 'custom',
              event: 'lpu:cache-invalidate',
              data: { timestamp: Date.now() },
            });
          } catch {}
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, invalidated: true, timestamp: Date.now() }));
          return;
        }

        if (pathname === '/api/public/ads-manifest' || pathname.endsWith('/ads-manifest.json')) {
          try {
            const rpcRes = await fetch(SUPABASE_REST_URL, {
              method: 'POST',
              headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
              },
            });
            if (rpcRes.ok) {
              const data = await rpcRes.json();
              if (data?.hero_carousel?.selected_ad_ids && data.hero_carousel.selected_ad_ids.length > 0) {
                data.hero_carousel.is_enabled = true;
              }
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.statusCode = 200;
              res.end(JSON.stringify(data));
              return;
            }
          } catch (err) {
            console.warn('[Vite Dev] Failed to proxy ads manifest to Supabase:', err);
          }
        }

        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    lanInfoPlugin(),
    securityHeadersPlugin(),
    liveAdsDevPlugin()
  ],
  define: {
    'import.meta.env.VITE_DEV_LAN_IP': JSON.stringify(getLocalLanIp()),
  },
  resolve: {
    alias: {
      '@lpu-events/shared': path.resolve(__dirname, fs.existsSync(path.resolve(__dirname, './src/shared')) ? './src/shared' : '../../packages/shared/src')
    }
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'https://lpuevents.live',
        changeOrigin: true,
        secure: false,
      },
      '/public-content': {
        target: 'https://images.lpuevents.live',
        changeOrigin: true,
        secure: false,
      }
    },
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.{crt,pem}', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.*', '_headers', '_redirects']
    }
  },
  preview: {
    port: 3000,
    strictPort: true,
    headers: STUDENT_SECURITY_HEADERS
  },
  build: {
    target: 'es2022',
    sourcemap: process.env.CI ? 'hidden' : false,
    cssCodeSplit: true, // Critical: split CSS by chunk so unused styles don't load
    cssMinify: 'lightningcss', // 20-30% smaller than default esbuild CSS minifier
    chunkSizeWarningLimit: 500,
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => !dep.includes('posthog') && !dep.includes('supabase'));
      }
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) {
              return 'vendor-motion';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('qrcode')) {
              return 'vendor-qrcode';
            }
            if (id.includes('posthog-js')) {
              return 'vendor-posthog';
            }
            return 'vendor-misc';
          }
          // Split heavy view components into their own async chunks
          if (id.includes('HappeningTodaySlider')) return 'chunk-today-slider';
          if (id.includes('HeroCarousel')) return 'chunk-hero-carousel';
          if (id.includes('CategoryFilter')) return 'chunk-category-filter';
        }
      }
    }
  }
});
