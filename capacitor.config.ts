import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.transcribeeasy.app',
  appName: 'Barrier-Free Meetings',
  webDir: 'dist',
  server: {
    cleartext: true,
  },
};

export default config;
