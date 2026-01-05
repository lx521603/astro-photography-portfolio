// test-webp.js
const fs = require('fs');
const path = require('path');

const galleryDir = 'src/gallery';
const webpFiles = [];

// 查找所有 WebP 文件
function findWebPFiles(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            findWebPFiles(fullPath);
        } else if (path.extname(file).toLowerCase() === '.webp') {
            webpFiles.push(fullPath);
        }
    });
}

findWebPFiles(galleryDir);

console.log(`找到 ${webpFiles.length} 个 WebP 文件:`);
webpFiles.forEach(file => {
    console.log(`- ${path.relative(galleryDir, file)}`);
    
    // 检查文件大小
    const stats = fs.statSync(file);
    console.log(`  大小: ${Math.round(stats.size / 1024)} KB`);
    
    // 检查文件头
    const buffer = fs.readFileSync(file);
    const header = buffer.slice(0, 12);
    console.log(`  文件头: ${header.toString('hex')}`);
});
