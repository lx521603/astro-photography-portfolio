import path from 'path';
import type { GalleryImage } from './galleryData.ts';
import exifr from 'exifr';
import sizeOf from 'image-size';
import fs from 'fs';

// ✅ 支持的图片格式
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG', '.WEBP'];

export const createGalleryImage = async (
    galleryDir: string,
    file: string,
): Promise<GalleryImage | null> => { // ✅ 返回 null 表示跳过
    const relativePath = path.relative(galleryDir, file);
    const fileExt = path.extname(file).toLowerCase();
    
    // ✅ 1. 检查文件是否存在
    if (!fs.existsSync(file)) {
        console.warn(`⚠️ 文件不存在，跳过: ${relativePath}`);
        return null;
    }
    
    // ✅ 2. 检查文件是否可读
    try {
        await fs.promises.access(file, fs.constants.R_OK);
    } catch (error) {
        console.warn(`⚠️ 文件不可读，跳过: ${relativePath}`);
        return null;
    }
    
    // ✅ 3. 检查文件格式是否支持
    if (!SUPPORTED_FORMATS.includes(fileExt)) {
        console.warn(`⚠️ 不支持的格式，跳过: ${relativePath} (${fileExt})`);
        return null;
    }
    
    try {
        // ✅ 4. 获取图片尺寸
        let dimensions = { width: 0, height: 0 };
        try {
            const size = sizeOf(file);
            if (size.width && size.height) {
                dimensions = { width: size.width, height: size.height };
            }
        } catch (sizeError) {
            console.log(`📏 无法获取图片尺寸 ${relativePath}: ${sizeError.message}`);
        }
        
        // ✅ 5. 读取 EXIF 数据
        let exifData = null;
        try {
            if (fileExt === '.webp') {
                // WebP 格式的特殊处理
                exifData = await getWebPInfo(file);
            } else {
                // JPG/PNG 格式
                exifData = await exifr.parse(file);
            }
        } catch (exifError) {
            // EXIF 读取失败不是致命错误，继续处理
            console.log(`📸 无 EXIF 数据: ${relativePath}`);
        }
        
        // ✅ 6. 构建图片对象
        const image: GalleryImage = {
            path: `/${relativePath.replace(/\\/g, '/')}`,
            meta: {
                title: toReadableCaption(path.basename(relativePath, path.extname(relativePath))),
                description: '',
                collections: collectionIdForImage(relativePath),
            },
            exif: {
                // 基础信息
                dimensions: dimensions,
                fileType: fileExt.replace('.', '').toUpperCase(),
                fileSize: getFileSize(file),
                // 如果有 EXIF 数据，合并进来
                ...(exifData ? {
                    captureDate: exifData.DateTimeOriginal
                        ? new Date(`${exifData.DateTimeOriginal} UTC`)
                        : undefined,
                    fNumber: exifData.FNumber,
                    focalLength: exifData.FocalLength,
                    iso: exifData.ISO,
                    model: exifData.Model,
                    shutterSpeed: exifData.ExposureTime ? 1 / exifData.ExposureTime : undefined,
                    lensModel: exifData.LensModel,
                } : {})
            },
        };
        
        console.log(`✅ 成功处理: ${relativePath} (${dimensions.width}x${dimensions.height})`);
        return image;
        
    } catch (error) {
        console.error(`❌ 处理图片时出错 ${relativePath}:`, error.message);
        return null;
    }
};

// ✅ 辅助函数：获取 WebP 信息
async function getWebPInfo(filePath: string): Promise<any> {
    try {
        const exif = await exifr.parse(filePath);
        return exif;
    } catch (error) {
        return null;
    }
}

// ✅ 辅助函数：获取文件大小
function getFileSize(filePath: string): string {
    try {
        const stats = fs.statSync(filePath);
        const sizeInKB = Math.round(stats.size / 1024);
        return `${sizeInKB} KB`;
    } catch {
        return '未知';
    }
}

// ✅ 辅助函数：转换为可读标题
function toReadableCaption(input: string): string {
    return input
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, ' ') // 支持中文
        .split(' ')
        .filter(word => word.length > 0)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// ✅ 辅助函数：获取图片所属的 collection
function collectionIdForImage(relativePath: string) {
    const dir = path.dirname(relativePath);
    return dir === '.' ? [] : [dir];
}

// ✅ 创建 collection
export const createGalleryCollection = (dir: string) => {
    return {
        id: dir,
        name: toReadableCaption(dir),
    };
};
