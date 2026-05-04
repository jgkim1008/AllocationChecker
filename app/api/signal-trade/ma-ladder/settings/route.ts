/**
 * MA 계단식 자동매수 설정 API
 * GET  /api/signal-trade/ma-ladder/settings — 현재 사용자의 설정 목록
 * POST /api/signal-trade/ma-ladder/settings — 새 설정 생성
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { CreateMALadderRequest } from '@/lib/signal-trade/ma-ladder';
import { MA_PERIODS } from '@/lib/signal-trade/ma-ladder';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const { data: settings, error } = await serviceClient
      .from('ma_ladder_settings')
      .select('*, levels:ma_ladder_levels(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ settings: settings ?? [] });
  } catch (err) {
    console.error('MA Ladder settings GET error:', err);
    const msg = err instanceof Error
      ? err.message
      : (err as { message?: string })?.message
        ?? (err as { details?: string })?.details
        ?? String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body: CreateMALadderRequest & { broker_credential_id?: string | null } = await request.json();
    const { symbol, market, broker_type, levels, broker_credential_id } = body;

    if (!symbol || !market || !broker_type) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 설정 생성
    const { data: setting, error: settingError } = await serviceClient
      .from('ma_ladder_settings')
      .insert({
        user_id: user.id,
        symbol: symbol.toUpperCase(),
        market,
        broker_type,
        broker_credential_id: broker_credential_id ?? null,
        is_enabled: true,
      })
      .select()
      .single();

    if (settingError || !setting) throw settingError;

    // MA 레벨 생성
    const validLevels = levels
      .filter(l => MA_PERIODS.includes(l.ma_period as typeof MA_PERIODS[number]))
      .map(l => ({
        setting_id: setting.id,
        ma_period: l.ma_period,
        quantity: Math.max(1, l.quantity),
        is_enabled: l.is_enabled ?? true,
      }));

    if (validLevels.length > 0) {
      const { error: levelsError } = await serviceClient
        .from('ma_ladder_levels')
        .insert(validLevels);
      if (levelsError) throw levelsError;
    }

    return NextResponse.json({ success: true, setting });
  } catch (err) {
    console.error('MA Ladder settings POST error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
