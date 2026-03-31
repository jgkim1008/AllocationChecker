import { createServiceClient } from '@/lib/supabase/server';

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_SEND_URL  = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
const CACHE_KEY = 'kakao_tokens';

interface KakaoTokenData {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO 8601
}

async function getStoredTokens(): Promise<KakaoTokenData | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('api_cache')
    .select('data')
    .eq('cache_key', CACHE_KEY)
    .single();
  return data ? (data.data as KakaoTokenData) : null;
}

async function saveTokens(tokens: KakaoTokenData): Promise<void> {
  const supabase = await createServiceClient();
  await supabase.from('api_cache').upsert(
    {
      cache_key: CACHE_KEY,
      data: tokens,
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60일
    },
    { onConflict: 'cache_key' }
  );
}

async function refreshAccessToken(refreshToken: string): Promise<KakaoTokenData | null> {
  const clientId     = process.env.KAKAO_REST_API_KEY;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (!clientId) return null;

  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     clientId,
    refresh_token: refreshToken,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
  });

  const res = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    console.error('[Kakao] Token refresh failed:', await res.text());
    return null;
  }

  const json = await res.json();
  const expiresIn: number = json.expires_in ?? 21600; // 기본 6시간
  return {
    access_token:  json.access_token,
    refresh_token: json.refresh_token ?? refreshToken, // 새 refresh_token이 없으면 기존 유지
    expires_at:    new Date(Date.now() + (expiresIn - 300) * 1000).toISOString(), // 5분 여유
  };
}

async function getValidAccessToken(): Promise<string | null> {
  const stored = await getStoredTokens();
  if (!stored) return null;

  // 만료 여부 확인
  if (new Date(stored.expires_at) > new Date()) {
    return stored.access_token;
  }

  // 만료됐으면 refresh
  const refreshed = await refreshAccessToken(stored.refresh_token);
  if (!refreshed) return null;

  await saveTokens(refreshed);
  return refreshed.access_token;
}

/**
 * 카카오톡 나에게 보내기 (feed 템플릿 - title + description)
 */
export async function sendKakaoNotification(title: string, description: string): Promise<boolean> {
  const token = await getValidAccessToken();
  if (!token) {
    console.warn('[Kakao] 유효한 액세스 토큰이 없습니다. 카카오 인증을 먼저 완료해주세요.');
    return false;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://allocation-checker-mu.vercel.app';
  const template = JSON.stringify({
    object_type: 'feed',
    content: {
      title:       title.slice(0, 200),
      description: description.slice(0, 400),
      link: {
        web_url:        `${appUrl}/strategies/fibonacci`,
        mobile_web_url: `${appUrl}/strategies/fibonacci`,
      },
    },
  });

  const res = await fetch(KAKAO_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ template_object: template }).toString(),
  });

  if (!res.ok) {
    console.error('[Kakao] 메시지 발송 실패:', await res.text());
    return false;
  }

  const json = await res.json();
  if (json.result_code !== 0) {
    console.error('[Kakao] 메시지 발송 오류:', json);
    return false;
  }

  console.log('[Kakao] 메시지 발송 성공');
  return true;
}

/**
 * 초기 인가 코드로 토큰 발급 후 Supabase에 저장
 * /api/auth/kakao/callback 에서 호출
 */
export async function issueTokenFromCode(code: string, redirectUri: string): Promise<boolean> {
  const clientId     = process.env.KAKAO_REST_API_KEY;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (!clientId) return false;

  const params = new URLSearchParams({
    grant_type:   'authorization_code',
    client_id:    clientId,
    redirect_uri: redirectUri,
    code,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
  });

  const res = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const json = await res.json();
  if (!res.ok) {
    console.error('[Kakao] 토큰 발급 실패:', json);
    throw new Error(JSON.stringify(json));
  }
  const expiresIn: number = json.expires_in ?? 21600;
  await saveTokens({
    access_token:  json.access_token,
    refresh_token: json.refresh_token,
    expires_at:    new Date(Date.now() + (expiresIn - 300) * 1000).toISOString(),
  });
  return true;
}
