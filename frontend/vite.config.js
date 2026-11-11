import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolveSiteEnv } from './scripts/siteEnv.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The site origin and indexability are fixed at build time, the same way
  // scripts/prerender.mjs reads them (see scripts/siteEnv.mjs).
  const site = resolveSiteEnv({ ...process.env, ...loadEnv(mode, process.cwd(), '') })
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __SITE_ORIGIN__: JSON.stringify(site.origin),
      __SITE_INDEXABLE__: JSON.stringify(site.indexable),
    },
  }
})
