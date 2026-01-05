import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://sorayt.cn',
  base: '/',
  
  // ✅ Astro 5.x 内置图片配置
  image: {
    // ✅ 内置服务，无需额外依赖
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
    // ✅ 支持的格式
    formats: ['webp', 'avif', 'png', 'jpg'],
    // ✅ 质量
    quality: 80,
  },
  
  vite: {
    plugins: [tailwindcss()],
  },
});
