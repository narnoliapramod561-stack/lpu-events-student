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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    lanInfoPlugin()
  ],
  resolve: {
    alias: {
      '@lpu-events/shared': path.resolve(__dirname, './src/shared')
    }
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true
  }
});
