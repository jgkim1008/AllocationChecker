/**
 * TOTP (Time-based One-Time Password) 유틸리티
 * Google Authenticator 호환 2FA 구현
 */

import {
  generateSecret,
  generateSync,
  verifySync,
  generateURI,
  NobleCryptoPlugin,
  ScureBase32Plugin,
} from 'otplib';
import * as QRCode from 'qrcode';

// TOTP 설정
const APP_NAME = 'AllocationChecker';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30; // 30초

// 공통 플러그인
const crypto = new NobleCryptoPlugin();
const base32 = new ScureBase32Plugin();

/**
 * 새 TOTP 시크릿 생성
 * @returns Base32 인코딩된 시크릿
 */
export function generateTOTPSecret(): string {
  return generateSecret({ length: 20, base32 });
}

/**
 * TOTP otpauth URI 생성 (QR 코드용)
 * @param secret TOTP 시크릿
 * @param userEmail 사용자 이메일 (식별용)
 * @returns otpauth:// URI
 */
export function generateTOTPUri(secret: string, userEmail: string): string {
  return generateURI({
    secret,
    label: userEmail,
    issuer: APP_NAME,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    algorithm: 'sha1',
  });
}

/**
 * QR 코드 데이터 URL 생성
 * @param secret TOTP 시크릿
 * @param userEmail 사용자 이메일
 * @returns QR 코드 이미지 데이터 URL (Base64)
 */
export async function generateQRCodeDataUrl(
  secret: string,
  userEmail: string
): Promise<string> {
  const uri = generateTOTPUri(secret, userEmail);
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
  });
}

/**
 * TOTP 코드 검증
 * @param secret TOTP 시크릿
 * @param token 사용자 입력 6자리 코드
 * @returns 유효 여부
 */
export function verifyTOTPToken(secret: string, token: string): boolean {
  // 앞뒤 공백 제거, 숫자만 추출
  const cleanToken = token.replace(/\s/g, '').replace(/\D/g, '');

  if (cleanToken.length !== TOTP_DIGITS) {
    return false;
  }

  // 현재 시간 기준 ±1 window 허용 (epochTolerance = 30초)
  const result = verifySync({
    secret,
    token: cleanToken,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    algorithm: 'sha1',
    epochTolerance: TOTP_PERIOD,
    crypto,
    base32,
  });

  return result.valid;
}

/**
 * 현재 TOTP 코드 생성 (테스트/디버깅용)
 * @param secret TOTP 시크릿
 * @returns 6자리 TOTP 코드
 */
export function generateCurrentTOTP(secret: string): string {
  return generateSync({
    secret,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    algorithm: 'sha1',
    crypto,
    base32,
  });
}

/**
 * TOTP 시크릿 포맷 검증
 * @param secret 시크릿 문자열
 * @returns Base32 형식 유효 여부
 */
export function isValidTOTPSecret(secret: string): boolean {
  // Base32: A-Z, 2-7
  return /^[A-Z2-7]{16,}$/.test(secret);
}
