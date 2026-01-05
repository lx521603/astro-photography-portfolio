import path from 'path';
import type { GalleryImage } from './galleryData.ts';
import exifr from 'exifr';
import sizeOf from 'image-size'; // ✅ 添加这个依赖来获取图片尺寸
import fs from 'fs'; // ✅ 添加文件系统模块

// ✅ 支持的图片格式（添加 webp）
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG', '.WEBP'];

export const createGalleryImage = async (
	galleryDir: string,
	file: string,
): Promise<GalleryImage> => {
	const relativePath = path.relative(galleryDir, file);
	const fileExt = path.extname(file).toLowerCase();
	
	// ✅ 检查文件格式是否支持
	if (!SUPPORTED_FORMATS.includes(fileExt)) {
		console.warn(`⚠️ Skipping unsupported format: ${fileExt} - ${relativePath}`);
		// 返回一个基本的图片对象，不包含 EXIF
		return createBasicImage(galleryDir, file, relativePath);
	}
	
	try {
		// ✅ 尝试读取 EXIF 数据（对于 WebP，exifr 可能不支持）
		let exifData = null;
		if (fileExt === '.webp') {
			// WebP 格式的特殊处理
			console.log(`Processing WebP file: ${relativePath}`);
			exifData = await getWebPInfo(file);
		} else {
			// 对于 JPG/PNG，正常使用 exifr
			exifData = await exifr.parse(file);
		}
		
		// ✅ 获取图片尺寸
		let dimensions = { width: 0, height: 0 };
		try {
			const size = sizeOf(file);
			if (size.width && size.height) {
				dimensions = { width: size.width, height: size.height };
			}
		} catch (sizeError) {
			console.log(`Could not get dimensions for ${relativePath}: ${sizeError.message}`);
		}
		
		const image = {
			path: `/${relativePath.replace(/\\/g, '/')}`, // ✅ 确保路径格式正确
			meta: {
				title: toReadableCaption(path.basename(relativePath, path.extname(relativePath))),
				description: '',
				collections: collectionIdForImage(relativePath),
			},
			exif: {
				// ✅ 基础 EXIF 信息
				dimensions: dimensions,
				fileType: fileExt.replace('.', '').toUpperCase(),
			},
		};
		
		if (exifData) {
			// ✅ 合并 EXIF 数据
			image.exif = {
				...image.exif,
				captureDate: exifData.DateTimeOriginal
					? new Date(`${exifData.DateTimeOriginal} UTC`)
					: undefined,
				fNumber: exifData.FNumber,
				focalLength: exifData.FocalLength,
				iso: exifData.ISO,
				model: exifData.Model,
				shutterSpeed: exifData.ExposureTime ? 1 / exifData.ExposureTime : undefined,
				lensModel: exifData.LensModel,
			};
		}
		
		return image;
		
	} catch (error) {
		console.error(`❌ Error processing ${relativePath}:`, error.message);
		// 出错时返回基本图片信息
		return createBasicImage(galleryDir, file, relativePath);
	}
};

// ✅ 辅助函数：创建基本图片对象（无 EXIF）
function createBasicImage(galleryDir: string, file: string, relativePath: string): GalleryImage {
	return {
		path: `/${relativePath.replace(/\\/g, '/')}`,
		meta: {
			title: toReadableCaption(path.basename(relativePath, path.extname(relativePath))),
			description: '',
			collections: collectionIdForImage(relativePath),
		},
		exif: {
			fileType: path.extname(file).replace('.', '').toUpperCase(),
		},
	};
}

// ✅ 辅助函数：获取 WebP 信息
async function getWebPInfo(filePath: string): Promise<any> {
	try {
		// 尝试用 exifr 读取（新版可能支持 WebP）
		const exif = await exifr.parse(filePath);
		if (exif) return exif;
		
		// 如果 exifr 不支持，返回空对象
		return null;
	} catch (error) {
		console.log(`No EXIF data for WebP file: ${filePath}`);
		return null;
	}
}

function toReadableCaption(input: string): string {
	return input
		.replace(/[^a-zA-Z0-9]+/g, ' ') // Replace non-alphanumerics with space
		.split(' ') // Split by space
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize
		.join(' ');
}

function collectionIdForImage(relativePath: string) {
	return path.dirname(relativePath) === '.' ? [] : [path.dirname(relativePath)];
}

export const createGalleryCollection = (dir: string) => {
	return {
		id: dir,
		name: toReadableCaption(dir),
	};
};
