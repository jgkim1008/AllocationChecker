import { createBrowserClient } from '@supabase/ssr';

// 브라우저 환경에서 단일 인스턴스 유지 — 여러 번 호출해도 동일 객체 반환
// (매 호출마다 새 인스턴스를 만들면 Web Locks 충돌로 AbortError 발생)
type SupabaseClient = ReturnType<typeof createBrowserClient>;
let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
