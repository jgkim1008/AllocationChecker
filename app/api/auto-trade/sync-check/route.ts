/**
 * 포지션 싱크 검증 API
 *
 * GET: 증권사 실제 잔고 vs DB 기록 비교
 * PUT: 증권사 실제 잔고로 DB 자동 동기화
 * POST: 수동 조정 (DB 기록 1건 추가)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient, getBrokerClientByCredentialId } from '@/lib/broker/session';
import type { BrokerType } from '@/lib/broker/types';

const SHARE_TOLERANCE = 0.5;   // 수량 허용 오차 (주)
const PRICE_TOLERANCE = 0.01;  // 평균단가 허용 오차 (1%)

async function getAuthenticatedBrokerClient(
  userId: string,
  credentialId?: string | null,
  brokerType?: string | null,
) {
  if (credentialId) {
    return getBrokerClientByCredentialId(credentialId);
  }
  return getBrokerClient(userId, (brokerType || 'kis') as BrokerType);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const brokerType = searchParams.get('brokerType');
    const symbol = searchParams.get('symbol')?.toUpperCase();
    const cycleNumber = searchParams.get('cycle_number') ? parseInt(searchParams.get('cycle_number')!, 10) : 1;

    if (!symbol) return NextResponse.json({ success: false, error: 'symbol이 필요합니다.' }, { status: 400 });

    // 1. 증권사 포지션 조회
    const clientResult = await getAuthenticatedBrokerClient(user.id, credentialId, brokerType);
    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json({ success: false, error: clientResult.error || '브로커에 연결되지 않았습니다.' }, { status: 400 });
    }

    const positionsResult = await clientResult.client.getPositions();
    const brokerPosition = positionsResult.data?.find(
      (p) => p.symbol.toUpperCase() === symbol
    ) ?? null;

    // 2. DB 기록 조회 (현재 회차 기준)
    const serviceSupabase = await createServiceClient();
    const [{ data: buyRecords }, { data: sellRecords }] = await Promise.all([
      serviceSupabase
        .from('infinite_buy_records')
        .select('shares, amount, price, buy_date')
        .eq('symbol', symbol)
        .eq('cycle_number', cycleNumber)
        .order('buy_date', { ascending: true }),
      serviceSupabase
        .from('infinite_sell_records')
        .select('shares, amount, price, sell_date')
        .eq('symbol', symbol)
        .eq('cycle_number', cycleNumber)
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
        cycleNumber,
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

// 증권사 실제 잔고로 DB 자동 동기화
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const body = await request.json();
    const { symbol, credentialId, brokerType, cycleNumber = 1 } = body;

    if (!symbol) {
      return NextResponse.json({ success: false, error: 'symbol이 필요합니다.' }, { status: 400 });
    }

    // 1. 증권사 포지션 조회
    const clientResult = await getAuthenticatedBrokerClient(user.id, credentialId, brokerType);
    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json({ success: false, error: clientResult.error || '브로커에 연결되지 않았습니다.' }, { status: 400 });
    }

    const positionsResult = await clientResult.client.getPositions();
    const brokerPosition = positionsResult.data?.find(
      (p) => p.symbol.toUpperCase() === symbol.toUpperCase()
    );

    const serviceSupabase = await createServiceClient();

    // 2. 현재 회차 기록 조회 (capital, n, target_rate 보존용)
    const { data: existingRecords } = await serviceSupabase
      .from('infinite_buy_records')
      .select('capital, n, target_rate')
      .eq('symbol', symbol.toUpperCase())
      .eq('cycle_number', cycleNumber)
      .limit(1);

    const existingMeta = existingRecords?.[0];

    // 3. 현재 회차 기록만 삭제
    await Promise.all([
      serviceSupabase
        .from('infinite_buy_records')
        .delete()
        .eq('symbol', symbol.toUpperCase())
        .eq('cycle_number', cycleNumber),
      serviceSupabase
        .from('infinite_sell_records')
        .delete()
        .eq('symbol', symbol.toUpperCase())
        .eq('cycle_number', cycleNumber),
    ]);

    // 4. 증권사에 포지션이 없으면 (전량 매도 상태) → 기록만 비우고 종료
    if (!brokerPosition || brokerPosition.quantity <= 0) {
      return NextResponse.json({
        success: true,
        data: {
          symbol: symbol.toUpperCase(),
          shares: 0,
          avgCost: 0,
          message: `${symbol} ${cycleNumber}회차 기록을 비웠습니다. (증권사 보유 없음)`,
        },
      });
    }

    // 5. 증권사 잔고 기준으로 새 매수 기록 생성
    const { data, error } = await serviceSupabase
      .from('infinite_buy_records')
      .insert({
        symbol: symbol.toUpperCase(),
        buy_date: new Date().toISOString().split('T')[0],
        price: brokerPosition.avgPrice,
        shares: brokerPosition.quantity,
        amount: brokerPosition.avgPrice * brokerPosition.quantity,
        capital: existingMeta?.capital ?? 0,
        n: existingMeta?.n ?? 40,
        target_rate: existingMeta?.target_rate ?? 0.1,
        cycle_number: cycleNumber,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        shares: brokerPosition.quantity,
        avgCost: brokerPosition.avgPrice,
        message: `${symbol} ${cycleNumber}회차가 증권사 실제 잔고(${brokerPosition.quantity}주, 평단 ${brokerPosition.avgPrice})로 동기화되었습니다.`,
      },
    });
  } catch (error) {
    console.error('[sync-check PUT]', error);
    return NextResponse.json({ success: false, error: '동기화 실패' }, { status: 500 });
  }
}

// 수동 조정: DB 매수 기록 1건 추가 (불일치 보정용)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const body = await request.json();
    const { symbol, shares, price, buy_date, capital, n, target_rate, cycleNumber = 1 } = body;

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
        cycle_number: Number(cycleNumber),
        user_id: user.id,
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
