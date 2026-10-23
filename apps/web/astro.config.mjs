import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import react from '@astrojs/react'
import node from '@astrojs/node'

export default defineConfig({
  site: 'https://eventia.app',
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/v1': 'http://127.0.0.1:3001',
        '/docs': 'http://127.0.0.1:3001',
      },
    },
  },
  build: { inlineStylesheets: 'always' },
  image: { responsiveStyles: true },
})
