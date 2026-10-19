import { defineConfig } from 'vite';

export default defineConfig({
  // configure-pages supplies this in CI; local development stays at /.
  base: `${(process.env.PAGES_BASE_PATH || '').replace(/\/$/, '')}/`,
});
