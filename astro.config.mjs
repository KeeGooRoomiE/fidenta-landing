// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// base — префикс пути, под которым сайт живёт на GitHub Pages.
// В CI подставляется из ASTRO_BASE_PATH в зависимости от ветки (см. .github/workflows/deploy.yml):
//   main → /fidenta-landing/ ; stage → /fidenta-landing/stage/ ; dev → /fidenta-landing/dev/
// Локально берётся значение по умолчанию — сайт открывается на http://localhost:4321/fidenta-landing/
const base = process.env.ASTRO_BASE_PATH ?? '/fidenta-landing/';

// https://astro.build/config
export default defineConfig({
  // site + base формируют абсолютные URL (для sitemap, канонических ссылок и т.д.)
  site: 'https://keegooroomie.github.io',
  base,

  // 'static' — Static Site Generation: на выходе чистый HTML/CSS/JS в папке dist/.
  // Идеально для лендинга и хостинга на GitHub Pages.
  output: 'static',

  vite: {
    // Tailwind CSS v4 подключается как Vite-плагин (не через отдельную интеграцию).
    // Конфигурация Tailwind — CSS-first, в src/styles/global.css через @theme.
    plugins: [tailwindcss()],
  },
});
