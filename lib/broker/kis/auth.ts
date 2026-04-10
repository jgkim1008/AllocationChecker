/**
 * 한국투자증권 인증 모듈
 */

import { KIS_API_BASE_URL, KIS_ENDPOINTS } from './constants';
import type { KISCredentials, TokenInfo, BrokerResponse } from '../types';

interface KISTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  access_token_token_expired: string;
}

/**
 * KIS 토큰 관리자
 */
export class KISAuth {
  private credentials: KISCredentials;
  private token: TokenInfo | null = null;
  private baseUrl: string;

  constructor(credentials: KISCredentials) {
    this.credentials = credentials;
    this.baseUrl = KIS_API_BASE_URL.REAL;
  }

  /**
   * 토큰 발급
   */
  async getToken(): Promise<BrokerResponse<TokenInfo>> {
    try {
      const response = await fetch(`${this.baseUrl}${KIS_ENDPOINTS.AUTH.TOKEN}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: this.credentials.appKey,
          appsecret: this.credentials.appSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: {
            code: 'AUTH_FAILED',
            message: `토큰 발급 실패: ${errorText}`,
          },
        };
      }

      const data: KISTokenResponse = await response.json();

      // 만료 시간 계산 (KIS는 24시간)
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);

      this.token = {
        accessToken: data.access_token,
        tokenType: data.token_type,
        expiresAt,
      };

      return {
        success: true,
        data: this.token,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 토큰 폐기
   */
  async revokeToken(): Promise<BrokerResponse<void>> {
    if (!this.token) {
      return { success: true };
    }

    try {
      await fetch(`${this.baseUrl}${KIS_ENDPOINTS.AUTH.REVOKE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appkey: this.credentials.appKey,
          appsecret: this.credentials.appSecret,
          token: this.token.accessToken,
        }),
      });

      this.token = null;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REVOKE_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 현재 토큰 반환 (만료 확인)
   */
  getCurrentToken(): TokenInfo | null {
    if (!this.token) return null;

    // 만료 5분 전이면 갱신 필요
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5분
    if (this.token.expiresAt.getTime() - now.getTime() < bufferTime) {
      return null;
    }

    return this.token;
  }

  /**
   * 토큰 설정 (외부에서 저장된 토큰 복원시 사용)
   */
  setToken(token: TokenInfo): void {
    this.token = token;
  }

  /**
   * 인증 헤더 생성
   */
  getAuthHeaders(): Record<string, string> {
    if (!this.token) {
      throw new Error('토큰이 없습니다. connect()를 먼저 호출하세요.');
    }

    return {
      'Content-Type': 'application/json; charset=utf-8',
      authorization: `${this.token.tokenType} ${this.token.accessToken}`,
      appkey: this.credentials.appKey,
      appsecret: this.credentials.appSecret,
    };
  }

  /**
   * 계좌번호 반환
   */
  getAccountNumber(): string {
    return this.credentials.accountNumber;
  }

  /**
   * 계좌번호 분리 (XXXXXXXX-XX → [XXXXXXXX, XX])
   */
  getAccountParts(): [string, string] {
    const parts = this.credentials.accountNumber.split('-');
    if (parts.length !== 2) {
      throw new Error('계좌번호 형식이 올바르지 않습니다. (XXXXXXXX-XX)');
    }
    return [parts[0], parts[1]];
  }

  /**
   * 기본 URL 반환
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}
