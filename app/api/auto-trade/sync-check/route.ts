/**
 * 포지션 싱크 검증 API
 *
 * GET: 증권사 실제 잔고 vs DB 기록 비교
 * POST: 수동 조정 (DB 기록 추가/덮어쓰기)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient } from '@/lib/broker/session';
import type { BrokerType } from '@/lib/broker/types';

const SHARE_TOLERANCE = 0.5;   // 수량 허용 오차 (주)
const PRICE_TOLERANCE = 0.01;  // 평균단가 허용 오차 (1%)

export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const brokerType = (searchParams.get('brokerType') || 'kis') as BrokerType;
    const symbol = searchParams.get('symbol')?.toUpperCase();
    if (!symbol) return NextResponse.json({ success: false, error: 'symbol이 필요합니다.' }, { status: 400 });

    // 1. 증권사 잔고 조회
    const clientResult = await getBrokerClient(user.id, brokerType);
    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json({ success: false, error: clientResult.error || '브로커에 연결되지 않았습니다.' }, { status: 400 });
    }

    const balanceResult = await clientResult.client.getBalance();
    const brokerPosition = balanceResult.data?.positions?.find(
      (p) => p.symbol.toUpperCase() === symbol
    ) ?? null;

    // 2. DB 기록 조회 (매수 - 매도)
    const serviceSupabase = await createServiceClient();
    const [{ data: buyRecords }, { data: sellRecords }] = await Promise.all([
      serviceSupabase
        .from('infinite_buy_records')
        .select('shares, amount, price, buy_date')
        .eq('symbol', symbol)
        .order('buy_date', { ascending: true }),
      serviceSupabase
        .from('infinite_sell_records')
        .select('shares, amount, price, sell_date')
        .eq('symbol', symbol)
        .order('sell_date', { ascending: true }),
    ]);

    const totalBuyShares = (buyRecords ?? []).reduce((s, r) => s + r.shares, 0);
    const totalBuyAmount = (buyRecords ?? []).reduce((s, r) => s + r.amount, 0);
    const totalSellShares = (sellRecords ?? []).reduce((s, r) => s + r.shares, 0);

    const dbShares = Math.max(0, totalBuyShares - totalSellShares);
    const dbAvgCost = totalBuyShares > 0 ? totalBuyAmount / totalBuyShares : 0;

    // 3. 비교
    const brokerShares = brokerPosition?.quantity ?? 0;
    const brokerAvgCost = brokerPosition?.avgPrice ?? 0;

    const sharesDiff = brokerShares - dbShares;
    const avgCostDiff = dbAvgCost > 0 ? (brokerAvgCost - dbAvgCost) / dbAvgCost : 0;

    const sharesMatch = Math.abs(sharesDiff) <= SHARE_TOLERANCE;
    const avgCostMatch = dbAvgCost === 0 || Math.abs(avgCostDiff) <= PRICE_TOLERANCE;
    const inSync = sharesMatch && avgCostMatch;

    return NextResponse.json({
      success: true,
      data: {
        symbol,
        inSync,
        broker: {
          shares: brokerShares,
          avgCost: brokerAvgCost,
          currentPrice: brokerPosition?.currentPrice ?? null,
          evalAmount: brokerPosition?.evalAmount ?? null,
          profitLoss: brokerPosition?.profitLoss ?? null,
          profitLossRate: brokerPosition?.profitLossRate ?? null,
          found: brokerPosition !== null,
        },
        db: {
          shares: dbShares,
          avgCost: dbAvgCost,
          buyCount: (buyRecords ?? []).length,
          sellCount: (sellRecords ?? []).length,
          totalBuyShares,
          totalSellShares,
        },
        diff: {
          shares: sharesDiff,
          avgCostPct: avgCostDiff * 100,
          sharesMatch,
          avgCostMatch,
        },
      },
    });
  } catch (error) {
    console.error('[sync-check GET]', error);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 수동 조정: DB 매수 기록 1건 추가 (불일치 보정용)
export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const body = await request.json();
    const { symbol, shares, price, buy_date, capital, n, target_rate } = body;

    if (!symbol || !shares || !price || !buy_date) {
      return NextResponse.json({ success: false, error: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    const serviceSupabase = await createServiceClient();
    const amount = shares * price;

    const { data, error } = await serviceSupabase
      .from('infinite_buy_records')
      .insert({
        symbol: symbol.toUpperCase(),
        buy_date,
        price: Number(price),
        shares: Number(shares),
        amount,
        capital: Number(capital ?? 0),
        n: Number(n ?? 40),
        target_rate: Number(target_rate ?? 0.1),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[sync-check POST]', error);
    return NextResponse.json({ success: false, error: '수동 조정 실패' }, { status: 500 });
  }
}
