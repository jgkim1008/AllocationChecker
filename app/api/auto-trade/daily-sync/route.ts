/**
 * 매일 아침 포지션 자동 싱크 API
 *
 * GET: 활성화된 자동매매 설정 기준으로 브로커 실잔고 vs DB 비교 후 불일치 시 자동 싱크
 * - GitHub Actions에서 평일 09:00 KST (00:00 UTC)에 호출
 * - 이미 일치하는 종목은 스킵, 불일치 시에만 브로커 잔고 기준으로 덮어씀
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient, getBrokerClientByCredentialId } from '@/lib/broker/session';
import type { BrokerType } from '@/lib/broker/types';

const CRON_SECRET = process.env.CRON_SECRET;
const SHARE_TOLERANCE = 0.5; // 수량 허용 오차 (주)

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && CRON_SECRET) {
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const serviceClient = await createServiceClient();

  // 활성화된 자동매매 설정 조회
  const { data: settings, error: settingsError } = await serviceClient
    .from('auto_trade_settings')
    .select('*')
    .eq('is_enabled', true);

  if (settingsError) {
    console.error('[daily-sync] 설정 조회 오류:', settingsError);
    return NextResponse.json({ error: '설정 조회 실패' }, { status: 500 });
  }

  if (!settings || settings.length === 0) {
    return NextResponse.json({
      success: true,
      message: '활성화된 자동매매 설정이 없습니다.',
      data: { total: 0, synced: 0, results: [] },
    });
  }

  const results: {
    symbol: string;
    cycleNumber?: number;
    action: 'skip' | 'synced' | 'cleared' | 'error';
    message: string;
    before?: number;
    after?: number;
  }[] = [];

  for (const setting of settings) {
    const { user_id, symbol, broker_type, broker_credential_id, total_capital } = setting;
    const upperSymbol = symbol.toUpperCase();

    try {
      // 현재 회차 번호 조회 (가장 최신 cycle_number)
      const { data: latestCycle } = await serviceClient
        .from('infinite_buy_records')
        .select('cycle_number')
        .eq('symbol', upperSymbol)
        .eq('user_id', user_id)
        .order('cycle_number', { ascending: false })
        .limit(1);

      const cycleNumber: number = latestCycle?.[0]?.cycle_number ?? 1;

      // 브로커 클라이언트 연결
      const clientResult = broker_credential_id
        ? await getBrokerClientByCredentialId(broker_credential_id)
        : await getBrokerClient(user_id, broker_type as BrokerType, { skipBlockCheck: true });

      if (!clientResult.success || !clientResult.client) {
        results.push({ symbol, cycleNumber, action: 'error', message: `브로커 연결 실패: ${clientResult.error}` });
        continue;
      }

      // 브로커 잔고 조회
      const positionsResult = await clientResult.client.getPositions();
      const brokerPosition = positionsResult.data?.find(
        (p) => p.symbol.toUpperCase() === upperSymbol
      ) ?? null;
      const brokerShares = brokerPosition?.quantity ?? 0;

      // DB 잔고 조회 (현재 회차)
      const [{ data: buyRecs }, { data: sellRecs }] = await Promise.all([
        serviceClient
          .from('infinite_buy_records')
          .select('shares, amount')
          .eq('symbol', upperSymbol)
          .eq('cycle_number', cycleNumber)
          .eq('user_id', user_id),
        serviceClient
          .from('infinite_sell_records')
          .select('shares')
          .eq('symbol', upperSymbol)
          .eq('cycle_number', cycleNumber)
          .eq('user_id', user_id),
      ]);

      const totalBuyShares = (buyRecs ?? []).reduce((s, r) => s + r.shares, 0);
      const totalSellShares = (sellRecs ?? []).reduce((s, r) => s + r.shares, 0);
      const dbShares = Math.max(0, totalBuyShares - totalSellShares);

      // 허용 오차 내 일치 → 스킵
      if (Math.abs(brokerShares - dbShares) <= SHARE_TOLERANCE) {
        results.push({
          symbol,
          cycleNumber,
          action: 'skip',
          message: `일치 (브로커 ${brokerShares}주 = DB ${dbShares}주)`,
        });
        continue;
      }

      // 불일치 → 싱크
      const { data: existingMeta } = await serviceClient
        .from('infinite_buy_records')
        .select('capital, n, target_rate')
        .eq('symbol', upperSymbol)
        .eq('cycle_number', cycleNumber)
        .eq('user_id', user_id)
        .limit(1);

      const meta = existingMeta?.[0];

      // 현재 회차 기록 삭제
      await Promise.all([
        serviceClient
          .from('infinite_buy_records')
          .delete()
          .eq('symbol', upperSymbol)
          .eq('cycle_number', cycleNumber)
          .eq('user_id', user_id),
        serviceClient
          .from('infinite_sell_records')
          .delete()
          .eq('symbol', upperSymbol)
          .eq('cycle_number', cycleNumber)
          .eq('user_id', user_id),
      ]);

      // 브로커 잔고가 0이면 기록만 비우고 종료
      if (!brokerPosition || brokerPosition.quantity <= 0) {
        results.push({
          symbol,
          cycleNumber,
          action: 'cleared',
          message: `기록 비움 (브로커 잔고 없음, DB에 ${dbShares}주 있었음)`,
          before: dbShares,
          after: 0,
        });
        continue;
      }

      // 브로커 잔고 기준으로 새 매수 기록 삽입
      await serviceClient.from('infinite_buy_records').insert({
        symbol: upperSymbol,
        buy_date: new Date().toISOString().split('T')[0],
        price: brokerPosition.avgPrice,
        shares: brokerPosition.quantity,
        amount: brokerPosition.avgPrice * brokerPosition.quantity,
        capital: meta?.capital ?? total_capital ?? 0,
        n: meta?.n ?? 40,
        target_rate: meta?.target_rate ?? 0.1,
        cycle_number: cycleNumber,
        user_id,
      });

      results.push({
        symbol,
        cycleNumber,
        action: 'synced',
        message: `싱크 완료: DB ${dbShares}주 → 브로커 ${brokerPosition.quantity}주 (평단 ${brokerPosition.avgPrice})`,
        before: dbShares,
        after: brokerPosition.quantity,
      });
    } catch (err) {
      console.error(`[daily-sync] 오류: ${symbol}`, err);
      results.push({
        symbol,
        action: 'error',
        message: err instanceof Error ? err.message : '알 수 없는 오류',
      });
    }
  }

  const syncedCount = results.filter((r) => r.action === 'synced').length;
  const clearedCount = results.filter((r) => r.action === 'cleared').length;
  const skipCount = results.filter((r) => r.action === 'skip').length;
  const errorCount = results.filter((r) => r.action === 'error').length;

  console.log(
    `[daily-sync] 완료: 전체 ${settings.length}개, 싱크 ${syncedCount}개, 비움 ${clearedCount}개, 일치 ${skipCount}개, 오류 ${errorCount}개`
  );

  return NextResponse.json({
    success: true,
    message: `${settings.length}개 종목 확인 — 싱크 ${syncedCount}개, 일치 ${skipCount}개, 오류 ${errorCount}개`,
    data: { total: settings.length, synced: syncedCount, cleared: clearedCount, skipped: skipCount, errors: errorCount, results },
  });
}
