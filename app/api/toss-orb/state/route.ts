/**
 * 토스 ORB 페이퍼 트레이딩 워커 상태 API
 *
 * GET: 워커 상태 조회 (python/toss_orb_watch.py 가 upsert)
 * POST: 정지 신호 전송 — should_run=false 로 세팅. 워커가 다음 폴링(최대 20초)에 감지하고 스스로 종료.
 *       ⚠️ 실제 주문과 무관. 페이퍼 트레이딩 감시 루프를 멈추는 신호일 뿐.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export interface TossOrbWorkerState {
  symbol: string;
  status: 'stopped' | 'waiting' | 'watching' | 'in_position' | 'error';
  should_run: boolean;
  box_high: number | null;
  box_low: number | null;
  position_entry: number | null;
  position_entry_time: string | null;
  position_stop: number | null;
  last_price: number | null;
  last_event: string | null;
  updated_at: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol') ?? '122630';

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('toss_orb_worker_state')
      .select('*')
      .eq('symbol', symbol)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, state: data as TossOrbWorkerState | null });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbol = body.symbol ?? '122630';

    const supabase = await createServiceClient();
    const { error } = await supabase
      .from('toss_orb_worker_state')
      .update({ should_run: false })
      .eq('symbol', symbol);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '알 수 없는 오류' },
      { status: 500 }
    );
  }
}
