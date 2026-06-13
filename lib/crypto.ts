import nodeCrypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export class SecretDecryptionError extends Error {
  constructor() {
    super('API Key 解密失败，请检查 KEY_ENCRYPTION_SECRET 是否与保存 Key 时一致，或在后台重新保存该 Key');
    this.name = 'SecretDecryptionError';
  }
}

function getSecretKey() {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('缺少 KEY_ENCRYPTION_SECRET，无法安全保存或使用 API Key');
  }

  return nodeCrypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plainText: string) {
  const value = plainText.trim();
  if (!value) {
    throw new Error('API Key 不能为空');
  }

  const iv = nodeCrypto.randomBytes(IV_BYTES);
  const cipher = nodeCrypto.createCipheriv(ALGORITHM, getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url')
  ].join('.');
}

export function decryptSecret(payload: string) {
  const [ivText, authTagText, encryptedText] = payload.split('.');
  if (!ivText || !authTagText || !encryptedText) {
    throw new Error('API Key 密文格式不正确');
  }

  const secretKey = getSecretKey();

  try {
    const decipher = nodeCrypto.createDecipheriv(
      ALGORITHM,
      secretKey,
      Buffer.from(ivText, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(authTagText, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof SecretDecryptionError) {
      throw error;
    }
    throw new SecretDecryptionError();
  }
}
