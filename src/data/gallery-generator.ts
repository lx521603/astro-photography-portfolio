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
        let galleryObj = await loadExistingGallery(galleryDir);
        galleryObj = mergeGalleriesObj(galleryObj, await createGalleryObjFrom(galleryDir));
        await writeGalleryYaml(galleryDir, galleryObj);
        
        // ✅ 添加统计信息
        const totalImages = galleryObj.images.length;
        const totalCollections = galleryObj.collections.length;
        console.log(`✅ Gallery updated: ${totalCollections} collections, ${totalImages} images`);
        
    } catch (error) {
        console.error('Failed to create gallery file:', error);
        process.exit(1);
    }
}

async function loadExistingGallery(galleryDir: string) {
    const existingGalleryFile = path.join(galleryDir, defaultGalleryFileName);
    if (fs.existsSync(existingGalleryFile)) {
        return await loadGallery(existingGalleryFile);
    }
    return NullGalleryData;
}

function mergeGalleriesObj(
    targetGalleryObj: GalleryData,
    sourceGalleryObj: GalleryData,
): GalleryData {
    return {
        collections: getUpdatedCollectionList(targetGalleryObj, sourceGalleryObj),
        images: getUpdatedImageList(targetGalleryObj, sourceGalleryObj),
    };
}

function getUpdatedImageList(targetGalleryObj: GalleryData, sourceGalleryObj: GalleryData) {
    const imagesMap = new Map();
    
    // ✅ 修复：使用规范化路径作为键
    const normalizePath = (imgPath: string): string => {
        return imgPath
            .toLowerCase()  // 统一小写
            .replace(/\\/g, '/')  // 统一斜杠
            .replace(/^\/+/, ''); // 去除开头斜杠
    };
    
    // 先添加目标图片
    targetGalleryObj.images.forEach((image) => {
        const key = normalizePath(image.path);
        imagesMap.set(key, image);
    });
    
    // 再添加或更新源图片
    sourceGalleryObj.images.forEach((image) => {
        const key = normalizePath(image.path);
        const existingImage = imagesMap.get(key);
        
        if (existingImage === undefined) {
            // 新图片，直接添加
            imagesMap.set(key, image);
        } else {
            // 已存在，只更新 EXIF 数据
            existingImage.exif = image.exif;
            imagesMap.set(key, existingImage);
        }
    });
    
    return Array.from(imagesMap.values());
}

function getUpdatedCollectionList(targetGalleryObj: GalleryData, sourceGalleryObj: GalleryData) {
    const collectionsMap = new Map(
        targetGalleryObj.collections.map((collection) => [collection.id.toLowerCase(), collection]), // 小写作为键
    );
    sourceGalleryObj.collections.forEach((collection) => {
        const key = collection.id.toLowerCase();
        if (!collectionsMap.get(key)) {
            collectionsMap.set(key, collection);
        }
    });
    return Array.from(collectionsMap.values());
}

async function createGalleryObjFrom(galleryDir: string): Promise<GalleryData> {
    // ✅ 修复 glob 模式，避免重复匹配
    const imageFiles = await fg([
        `${galleryDir}/**/*.{jpg,jpeg,png,webp}`,
        `${galleryDir}/**/*.{JPG,JPEG,PNG,WEBP}`
    ], {
        dot: false,
        caseSensitiveMatch: false, // 不区分大小写
        unique: true,  // 确保唯一性
        absolute: true
    });
    
    console.log(`📸 Found ${imageFiles.length} image files`);
    
    // ✅ 按文件类型统计
    const stats = {
        jpg: 0,
        jpeg: 0,
        png: 0,
        webp: 0,
        other: 0
    };
    
    imageFiles.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (ext === '.jpg') stats.jpg++;
        else if (ext === '.jpeg') stats.jpeg++;
        else if (ext === '.png') stats.png++;
        else if (ext === '.webp') stats.webp++;
        else stats.other++;
    });
    
    console.log(`📊 File type stats: JPG(${stats.jpg}), JPEG(${stats.jpeg}), PNG(${stats.png}), WebP(${stats.webp})`);
    
    return {
        collections: createCollectionsFrom(imageFiles, galleryDir),
        images: await createImagesFrom(imageFiles, galleryDir),
    };
}

function createCollectionsFrom(imageFiles: string[], galleryDir: string) {
    const uniqueDirNames = new Set(
        imageFiles.map((file) => {
            const dir = path.dirname(path.relative(galleryDir, file));
            return dir === '.' ? '精选' : dir; // 如果图片在根目录，归类到"精选"
        }),
    );

    return [...uniqueDirNames]
        .map((dir) => {
            return createGalleryCollection(dir);
        })
        .filter((col) => col.id !== '.');
}

async function createImagesFrom(imageFiles: string[], galleryDir: string) {
    console.log('🔄 Creating image entries...');
    const images = [];
    
    // 使用 Set 记录已处理的文件，避免重复
    const processedFiles = new Set();
    
    for (const file of imageFiles) {
        // 规范化文件路径
        const normalizedPath = file.toLowerCase().replace(/\\/g, '/');
        
        // 检查是否已处理过（避免大小写重复）
        if (processedFiles.has(normalizedPath)) {
            console.log(`⚠️ 跳过重复文件: ${path.relative(galleryDir, file)}`);
            continue;
        }
        
        processedFiles.add(normalizedPath);
        
        const image = await createGalleryImage(galleryDir, file);
        if (image) {
            images.push(image);
        }
    }
    
    return images;
}

async function writeGalleryYaml(galleryDir: string, galleryObj: GalleryData) {
    const filePath = path.join(galleryDir, defaultGalleryFileName);
    await fs.promises.writeFile(filePath, yaml.dump(galleryObj), 'utf8');
    console.log('✅ Gallery file created/updated successfully at:', filePath);
    
    // ✅ 验证写入的内容
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    const lines = fileContent.split('\n').length;
    console.log(`📄 File size: ${lines} lines`);
    
    // ✅ 检查重复
    const paths = galleryObj.images.map(img => img.path.toLowerCase());
    const uniquePaths = new Set(paths);
    if (uniquePaths.size < paths.length) {
        console.warn(`⚠️ 发现 ${paths.length - uniquePaths.size} 个重复路径:`);
        // 找出重复的路径
        const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);
        duplicates.forEach(dup => console.log(`  - ${dup}`));
    }
    
    // ✅ 显示一些示例
    const sampleImages = galleryObj.images.slice(0, 5);
    console.log('📷 Sample images included:');
    sampleImages.forEach(img => {
        console.log(`  - ${img.path}`);
    });
}

program.argument('<path to images directory>');
program.parse();

const directoryPath = program.args[0];
if (!directoryPath || !fs.existsSync(directoryPath)) {
    console.error('Invalid directory path provided.');
    process.exit(1);
}

(async () => {
    console.log('🚀 Starting gallery generation...');
    console.log(`📁 Scanning directory: ${directoryPath}`);
    
    await generateGalleryFile(directoryPath);
    
    // ✅ 最终验证
    console.log('\n🎉 Gallery generation completed!');
    
})().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});
