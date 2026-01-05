import { program } from 'commander';
import * as fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'path';
import fg from 'fast-glob';
import { type GalleryData, loadGallery, NullGalleryData } from './galleryData.ts';
import { createGalleryCollection, createGalleryImage } from './galleryEntityFactory.ts';

const defaultGalleryFileName = 'gallery.yaml';

async function generateGalleryFile(galleryDir: string): Promise<void> {
    try {
        console.log('🚀 Starting gallery generation...');
        console.log(`📁 Scanning directory: ${galleryDir}`);
        
        // ✅ 1. 加载现有的 gallery 数据
        let existingGallery = await loadExistingGallery(galleryDir);
        
        // ✅ 2. 创建新的 gallery 数据
        const newGallery = await createGalleryObjFrom(galleryDir);
        
        // ✅ 3. 合并数据（使用修复后的合并逻辑）
        const mergedGallery = mergeGalleries(existingGallery, newGallery);
        
        // ✅ 4. 写入文件
        await writeGalleryYaml(galleryDir, mergedGallery);
        
        // ✅ 5. 统计信息
        console.log(`✅ Gallery updated: ${mergedGallery.collections.length} collections, ${mergedGallery.images.length} images`);
        
    } catch (error) {
        console.error('Failed to create gallery file:', error);
        process.exit(1);
    }
}

async function loadExistingGallery(galleryDir: string): Promise<GalleryData> {
    const existingGalleryFile = path.join(galleryDir, defaultGalleryFileName);
    if (fs.existsSync(existingGalleryFile)) {
        console.log('📂 Loading existing gallery data...');
        return await loadGallery(existingGalleryFile);
    }
    return NullGalleryData;
}

// ✅ 修复的合并函数
function mergeGalleries(existing: GalleryData, newData: GalleryData): GalleryData {
    // 1. 合并 collections（按 id 去重）
    const collectionsMap = new Map<string, any>();
    
    // 先添加现有的 collections
    existing.collections.forEach(col => {
        collectionsMap.set(col.id.toLowerCase(), col); // 统一小写
    });
    
    // 再添加新的 collections（不会覆盖已有名称）
    newData.collections.forEach(col => {
        const key = col.id.toLowerCase();
        if (!collectionsMap.has(key)) {
            collectionsMap.set(key, col);
        }
    });
    
    const mergedCollections = Array.from(collectionsMap.values());
    
    // 2. 合并 images（按规范化路径去重）
    const imagesMap = new Map<string, any>();
    
    // 规范化路径函数
    const normalizePath = (imgPath: string): string => {
        return imgPath
            .toLowerCase()  // 统一小写
            .replace(/\\/g, '/')  // 统一正斜杠
            .replace(/\/+/g, '/')  // 去除多余斜杠
            .replace(/^\/?gallery\//, '') // 去除开头的 gallery/
            .replace(/^\//, '');  // 去除开头的斜杠
    };
    
    // 先添加现有的 images
    existing.images.forEach(img => {
        const normalizedPath = normalizePath(img.path);
        imagesMap.set(normalizedPath, {
            ...img,
            // 确保路径格式统一
            path: '/' + normalizedPath.replace(/^\/+/, '')
        });
    });
    
    // 再添加新的 images（覆盖已有的 EXIF 数据）
    newData.images.forEach(img => {
        const normalizedPath = normalizePath(img.path);
        const existingImg = imagesMap.get(normalizedPath);
        
        if (existingImg) {
            // 合并：保留原有的 meta，更新 EXIF
            imagesMap.set(normalizedPath, {
                ...existingImg,
                exif: img.exif || existingImg.exif,
                path: '/' + normalizedPath.replace(/^\/+/, '')
            });
            console.log(`🔄 Updated EXIF for: ${normalizedPath}`);
        } else {
            // 新增
            imagesMap.set(normalizedPath, {
                ...img,
                path: '/' + normalizedPath.replace(/^\/+/, '')
            });
            console.log(`➕ Added new: ${normalizedPath}`);
        }
    });
    
    const mergedImages = Array.from(imagesMap.values());
    
    // 3. 重新分配 collections
    // 确保所有图片的 collections 引用都有效
    const validCollectionIds = new Set(mergedCollections.map(c => c.id));
    mergedImages.forEach(img => {
        img.meta.collections = img.meta.collections.filter((colId: string) => 
            validCollectionIds.has(colId)
        );
    });
    
    return {
        collections: mergedCollections,
        images: mergedImages.sort((a, b) => a.path.localeCompare(b.path)) // 按路径排序
    };
}

async function createGalleryObjFrom(galleryDir: string): Promise<GalleryData> {
    // ✅ 修复 glob 模式：包含大小写敏感的文件
    const imageFiles = await fg(`${galleryDir}/**/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}`, {
        dot: false,
        caseSensitiveMatch: false, // 不区分大小写
        absolute: true,
        unique: true  // 确保唯一性
    });
    
    console.log(`📸 Found ${imageFiles.length} image files`);
    
    // ✅ 文件去重（基于规范化路径）
    const uniqueFiles = Array.from(new Set(imageFiles.map(file => 
        file.toLowerCase().replace(/\\/g, '/')
    ))).map(file => galleryDir + file.substring(galleryDir.length));
    
    if (uniqueFiles.length < imageFiles.length) {
        console.log(`🔄 Removed ${imageFiles.length - uniqueFiles.length} duplicate files`);
    }
    
    // ✅ 统计文件类型
    const stats: Record<string, number> = {};
    uniqueFiles.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        stats[ext] = (stats[ext] || 0) + 1;
    });
    
    console.log('📊 File type stats:');
    Object.entries(stats).forEach(([ext, count]) => {
        console.log(`  ${ext.toUpperCase()}: ${count}`);
    });
    
    // ✅ 创建 images（过滤掉 null）
    console.log('🔄 Creating image entries...');
    const imagesPromises = uniqueFiles.map(file => createGalleryImage(galleryDir, file));
    const imagesResults = await Promise.all(imagesPromises);
    const images = imagesResults.filter((img): img is NonNullable<typeof img> => img !== null);
    
    console.log(`✅ Successfully processed ${images.length} images`);
    
    // ✅ 创建 collections（从实际处理的图片中提取）
    const uniqueDirs = new Set<string>();
    images.forEach(img => {
        // 从图片路径中提取目录
        const dir = path.dirname(img.path.replace(/^\//, ''));
        if (dir && dir !== '.') {
            uniqueDirs.add(dir);
        }
    });
    
    const collections = Array.from(uniqueDirs)
        .sort()
        .map(dir => createGalleryCollection(dir));
    
    return {
        collections,
        images
    };
}

async function writeGalleryYaml(galleryDir: string, galleryObj: GalleryData) {
    const filePath = path.join(galleryDir, defaultGalleryFileName);
    
    // ✅ 备份现有文件
    if (fs.existsSync(filePath)) {
        const backupPath = filePath + '.backup';
        await fs.promises.copyFile(filePath, backupPath);
        console.log(`📋 Backed up existing gallery to: ${backupPath}`);
    }
    
    // ✅ 写入新文件
    await fs.promises.writeFile(filePath, yaml.dump(galleryObj, {
        lineWidth: -1, // 不限制行宽
        noRefs: true   // 不创建锚点引用
    }), 'utf8');
    
    console.log('✅ Gallery file created/updated successfully at:', filePath);
    
    // ✅ 验证写入
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    const lines = fileContent.split('\n').length;
    console.log(`📄 File size: ${lines} lines`);
    
    // ✅ 显示重复检查
    const paths = galleryObj.images.map(img => img.path.toLowerCase());
    const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);
    if (duplicates.length > 0) {
        console.warn(`⚠️ Found ${duplicates.length} duplicate paths:`);
        duplicates.slice(0, 5).forEach(dup => console.log(`  - ${dup}`));
    } else {
        console.log('✅ No duplicate image paths found');
    }
}

// 程序入口
program.argument('<path to images directory>');
program.parse();

const directoryPath = program.args[0];
if (!directoryPath || !fs.existsSync(directoryPath)) {
    console.error('Invalid directory path provided.');
    process.exit(1);
}

(async () => {
    await generateGalleryFile(directoryPath);
    console.log('\n🎉 Gallery generation completed!');
})().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});
