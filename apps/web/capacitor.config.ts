import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'id.toolsapps.app',
  appName: 'ToolsApps',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    // WebView berjalan di origin https://localhost. Server pengembangan memakai
    // HTTP LAN, sehingga mixed content harus diizinkan. Matikan bila server HTTPS.
    allowMixedContent: true
  }
};

export default config;
