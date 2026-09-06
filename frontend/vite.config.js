import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = (env.VITE_SITE_URL || '').replace(/\/$/, '')
  return {
    plugins: [react(), {
      name: 'pray-social-origin',
      transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%VITE_SITE_URL%', siteUrl) },
    }],
    server: { proxy: { '/api': 'http://localhost:5000', '/uploads': 'http://localhost:5000' } },
  }
})
