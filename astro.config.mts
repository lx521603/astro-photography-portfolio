import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://sorayt.cn',
  base: '/',
  // ✅ 添加这个简单的图片配置
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
    formats: ['webp', 'jpg', 'png'],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
