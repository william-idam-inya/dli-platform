import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  // Vite 8 / Rolldown vendor groups keep the entry file smaller than
  // a single combined React + Supabase SDK bundle. Verify with npm.cmd run build.
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'supabase-sdk',
              test: /node_modules[\\/]@supabase[\\/]/,
              priority: 20,
            },
            {
              name: 'react-runtime',
              test: /node_modules[\\/](?:react|react-dom|react-router|react-router-dom)(?:[\\/]|$)/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
