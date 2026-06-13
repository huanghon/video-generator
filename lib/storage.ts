import path from 'path';
import crypto from 'crypto';
import { put } from '@vercel/blob';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
type StorageProvider = 'auto' | 'cloudinary' | 'vercel-blob';

function sanitizeBaseName(filename: string) {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER || 'auto';
  if (provider === 'cloudinary' || provider === 'vercel-blob') {
    return provider;
  }
  return 'auto';
}

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

async function uploadToCloudinary(file: File) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('缺少 Cloudinary 环境变量，无法保存上传素材');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'video-generator';
  const signaturePayload = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex');
  const formData = new FormData();

  formData.append('file', file);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('folder', folder);
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: formData
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || 'Cloudinary 上传失败');
  }

  return result.secure_url as string;
}

async function uploadToVercelBlob(file: File) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('缺少 BLOB_READ_WRITE_TOKEN，无法保存上传素材');
  }

  const extension = path.extname(file.name || '').toLowerCase() || '.png';
  const basename = sanitizeBaseName(file.name || 'image') || 'image';
  const blob = await put(`uploads/${Date.now()}-${basename}${extension}`, file, {
    access: 'public',
    addRandomSuffix: true,
    contentType: file.type || 'application/octet-stream'
  });

  return blob.url;
}

export async function uploadReferenceAssetForVideo(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('素材大小不能超过 10MB');
  }

  const provider = getStorageProvider();

  if (provider === 'cloudinary') {
    return uploadToCloudinary(file);
  }

  if (provider === 'vercel-blob') {
    return uploadToVercelBlob(file);
  }

  if (hasCloudinaryConfig()) {
    return uploadToCloudinary(file);
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return uploadToVercelBlob(file);
  }

  if (process.env.VIDEO_PROVIDER_MOCK !== 'false') {
    return null;
  }

  throw new Error('缺少素材存储配置，请配置 Cloudinary 或 Vercel Blob');
}

export async function uploadImageForVideo(file: File) {
  return uploadReferenceAssetForVideo(file);
}
