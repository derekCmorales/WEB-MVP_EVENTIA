import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ site: 'https://eventia.app', vite: { plugins: [tailwindcss()] }, build: { inlineStylesheets: 'always' }, image: { responsiveStyles: true } });
