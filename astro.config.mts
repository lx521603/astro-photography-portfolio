export default defineConfig({
  site: 'https://sorayt.cn',
  base: '/',
  
  // ❌ 完全禁用图片优化
  // image: false,
  
  vite: {
    plugins: [tailwindcss()],
    // ✅ 配置静态资源处理
    build: {
      assetsInlineLimit: 0, // 不内联任何图片
    },
  },
});
