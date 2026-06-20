import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type PluginOption } from 'vite';

const tailwindPlugins = tailwindcss() as unknown as PluginOption[];
const reactPlugin = react() as unknown as PluginOption;

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [...tailwindPlugins, reactPlugin],
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  build: {
    outDir: path.resolve(__dirname, '../dist-landing'),
  },
});
