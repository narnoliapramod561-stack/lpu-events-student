import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import os from 'node:os';

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
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.clarity.ms https://scripts.clarity.ms https://us.i.posthog.com https://eu.i.posthog.com https://app.posthog.com https://pagead2.googlesyndication.com https://adservice.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://images.unsplash.com https://upload.wikimedia.org https://*.supabase.co https://api.lpuevents.live https://lpuevents.live https://*.clarity.ms https://c.bing.com https://pagead2.googlesyndication.com https://*.doubleclick.net https://*.google.com; connect-src 'self' http://localhost:* ws://localhost:* https://*.supabase.co wss://*.supabase.co https://api.lpuevents.live wss://api.lpuevents.live https://us.i.posthog.com https://eu.i.posthog.com https://app.posthog.com https://*.ingest.sentry.io https://*.sentry.io https://*.clarity.ms https://c.bing.com https://pagead2.googlesyndication.com https://adservice.google.com https://googleads.g.doubleclick.net; frame-src 'self' https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com https://tpc.googlesyndication.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';"
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    lanInfoPlugin(),
    securityHeadersPlugin()
  ],
  resolve: {
    alias: {
      '@lpu-events/shared': path.resolve(__dirname, './src/shared')
    }
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.{crt,pem}', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.*', '_headers', '_redirects']
    }
  },
  preview: {
    port: 3000,
    strictPort: true,
    headers: STUDENT_SECURITY_HEADERS
  }
});
