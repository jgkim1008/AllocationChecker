/**
 * AES-256-GCM 암호화/복호화 유틸리티
 * 브로커 자격증명과 TOTP 시크릿 암호화에 사용
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // GCM 권장 IV 길이
const TAG_LENGTH = 16; // GCM 인증 태그 길이
const SESSION_TOKEN_LENGTH = 32;
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2시간

/**
 * 환경 변수에서 암호화 키 가져오기
 * @throws {Error} ENCRYPTION_KEY가 설정되지 않았거나 잘못된 형식
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY 환경 변수가 설정되지 않았습니다.');
  }

  // 64자리 hex string (32 bytes)
  if (!/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error('ENCRYPTION_KEY는 64자리 hex 문자열이어야 합니다.');
  }

  return Buffer.from(key, 'hex');
}

/**
 * 데이터 암호화 (AES-256-GCM)
 * @param plaintext 암호화할 평문
 * @returns 암호화된 데이터, IV, 인증 태그 (모두 Base64)
 */
export function encrypt(plaintext: string): {
  ciphertext: string;
  iv: string;
  tag: string;
} {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * 데이터 복호화 (AES-256-GCM)
 * @param ciphertext 암호화된 데이터 (Base64)
 * @param iv 초기화 벡터 (Base64)
 * @param tag 인증 태그 (Base64)
 * @returns 복호화된 평문
 * @throws {Error} 복호화 실패 시
 */
export function decrypt(ciphertext: string, iv: string, tag: string): string {
  const key = getEncryptionKey();
  const ivBuffer = Buffer.from(iv, 'base64');
  const tagBuffer = Buffer.from(tag, 'base64');

  if (tagBuffer.length !== TAG_LENGTH) {
    throw new Error('잘못된 인증 태그 길이');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(tagBuffer);

  let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * 자격증명 객체 암호화
 * @param credentials 자격증명 객체
 * @returns 암호화된 데이터
 */
export function encryptCredentials<T>(credentials: T): {
  encrypted_credentials: string;
  encryption_iv: string;
  encryption_tag: string;
} {
  const json = JSON.stringify(credentials);
  const { ciphertext, iv, tag } = encrypt(json);

  return {
    encrypted_credentials: ciphertext,
    encryption_iv: iv,
    encryption_tag: tag,
  };
}

/**
 * 암호화된 자격증명 복호화
 * @param encryptedCredentials 암호화된 데이터
 * @param iv 초기화 벡터
 * @param tag 인증 태그
 * @returns 복호화된 자격증명 객체
 */
export function decryptCredentials<T>(
  encryptedCredentials: string,
  iv: string,
  tag: string
): T {
  const json = decrypt(encryptedCredentials, iv, tag);
  return JSON.parse(json) as T;
}

/**
 * 세션 토큰 생성
 * @returns 랜덤 세션 토큰 (hex string)
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(SESSION_TOKEN_LENGTH).toString('hex');
}

/**
 * 세션 토큰 해시
 * @param token 세션 토큰
 * @returns SHA-256 해시 (hex string)
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 세션 만료 시간 계산
 * @returns 2시간 후의 Date 객체
 */
export function getSessionExpiry(): Date {
  return new Date(Date.now() + SESSION_DURATION_MS);
}

/**
 * 세션 유효성 검증
 * @param expiresAt 만료 시간
 * @returns 유효 여부
 */
export function isSessionValid(expiresAt: Date | string): boolean {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return expiry.getTime() > Date.now();
}
