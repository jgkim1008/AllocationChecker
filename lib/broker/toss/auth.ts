/**
 * 토스증권 오픈 API 인증 (읽기 전용 시세 조회용)
 *
 * 앱 단위 client_credentials 토큰 — 계정별 자격증명이 아니라
 * TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 환경변수 하나로 발급받는다.
 */

const TOSS_API_BASE = 'https://openapi.tossinvest.com';

interface TossTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('TOSS_CLIENT_ID / TOSS_CLIENT_SECRET is not set');
  }
  return { clientId, clientSecret };
}

/**
 * 액세스 토큰 조회 (만료 5분 전이면 재발급, 메모리 캐시)
 */
export async function getTossToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > 5 * 60 * 1000) {
    return cachedToken.accessToken;
  }

  const { clientId, clientSecret } = getCredentials();
  const res = await fetch(`${TOSS_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`토스 토큰 발급 실패: HTTP ${res.status} ${detail}`);
  }

  const data: TossTokenResponse = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

export { TOSS_API_BASE };
