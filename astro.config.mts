import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import image from '@astrojs/image';

// https://astro.build/config
export default defineConfig({
  site: 'https://sorayt.cn',
  base: '/',
  
  // ✅ 添加图片优化集成
  integrations: [
    image({
      serviceEntryPoint: '@astrojs/image/sharp',
      // ✅ 配置图片格式
      format: ['webp', 'avif', 'png', 'jpg'],
      // ✅ 图片质量
      quality: 80,
      // ✅ 响应式图片配置
      widths: [640, 768, 1024, 1280, 1920],
      // ✅ 允许处理本地图片
      remoteImages: false,
    })
  ],
  
  vite: {
    plugins: [tailwindcss()],
  },
  
  // ✅ 添加构建配置
  build: {
    assets: '_astro', // 静态资源目录
  },
});
