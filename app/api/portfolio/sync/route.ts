/**
 * 브로커 → 포트폴리오 동기화 API
 *
 * POST: 매핑된 계좌의 기존 종목 삭제 후 브로커 포지션으로 덮어쓰기
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkBrokerAccess } from '@/lib/broker/auth-guard';
import { getBrokerClientByCredentialId } from '@/lib/broker/session';
import { KISClient } from '@/lib/broker/kis';
import type { Position } from '@/lib/broker/types';
import { detectMarket, getCurrency } from '@/lib/utils/market';

interface SyncResult {
  accountId: string;
  accountName: string;
  brokerType: string;
  deleted: number;
  inserted: number;
  positions: { symbol: string; symbolName: string; quantity: number }[];
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2FA 세션 확인
    const access = await checkBrokerAccess(user.id);
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.error, requiresTotpVerify: true },
        { status: 403 }
      );
    }

    // 동기화할 매핑 조회
    const { data: mappings, error: mappingError } = await supabase
      .from('account_broker_mapping')
      .select(`
        id,
        account_id,
        broker_credential_id,
        account:accounts(id, name, type, user_id),
        broker:broker_credentials(id, broker_type, account_alias)
      `);

    if (mappingError) {
      console.error('[sync POST] mapping query error:', mappingError);
      return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
    }

    // 유저 소유 매핑만 필터링
    const userMappings = (mappings || []).filter(
      (m: any) => m.account?.user_id === user.id
    );

    if (userMappings.length === 0) {
      return NextResponse.json({
        success: true,
        message: '동기화할 매핑된 계좌가 없습니다.',
        results: [],
      });
    }

    const serviceSupabase = await createServiceClient();
    const results: SyncResult[] = [];

    for (const mapping of userMappings) {
      const accountInfo = mapping.account as any;
      const brokerInfo = mapping.broker as any;
      const result: SyncResult = {
        accountId: mapping.account_id,
        accountName: accountInfo?.name || '알 수 없음',
        brokerType: brokerInfo?.broker_type || 'unknown',
        deleted: 0,
        inserted: 0,
        positions: [],
      };

      try {
        // 브로커 클라이언트 가져오기
        const clientResult = await getBrokerClientByCredentialId(mapping.broker_credential_id);
        if (!clientResult.success || !clientResult.client) {
          result.error = clientResult.error || '브로커 연결 실패';
          results.push(result);
          continue;
        }

        const client = clientResult.client;

        // 국내+해외 포지션 조회 (KIS인 경우)
        let allPositions: Position[] = [];

        if (client instanceof KISClient) {
          const fullResult = await client.getFullBalance();
          if (fullResult.success && fullResult.data) {
            allPositions = [
              ...fullResult.data.domestic.positions,
              ...fullResult.data.overseas.positions,
            ];
          } else {
            result.error = fullResult.error?.message || '잔고 조회 실패';
            results.push(result);
            continue;
          }
        } else {
          const positionsResult = await client.getPositions();
          if (positionsResult.success && positionsResult.data) {
            allPositions = positionsResult.data;
          } else {
            result.error = positionsResult.error?.message || '포지션 조회 실패';
            results.push(result);
            continue;
          }
        }

        // 1. 해당 계좌의 기존 holdings 모두 삭제 (브로커 데이터로 덮어쓰기)
        const { data: deletedRows } = await serviceSupabase
          .from('portfolio_holdings')
          .delete()
          .eq('user_id', user.id)
          .eq('account_id', mapping.account_id)
          .select('id');

        result.deleted = deletedRows?.length || 0;

        // 2. 브로커 포지션 모두 insert
        for (const position of allPositions) {
          const symbol = position.symbol.toUpperCase().replace(/\.(KS|KQ)$/i, '');
          const market = detectMarket(symbol);
          const currency = getCurrency(market);

          // stocks 테이블에 종목 upsert
          const { data: stock, error: stockError } = await serviceSupabase
            .from('stocks')
            .upsert({
              symbol,
              name: position.symbolName,
              market,
              currency,
              current_price: position.currentPrice,
              last_fetched_at: new Date().toISOString(),
            }, {
              onConflict: 'symbol',
            })
            .select('id')
            .single();

          if (stockError || !stock) {
            console.error('[sync] stock upsert error:', stockError, 'symbol:', symbol);
            continue;
          }

          // portfolio_holdings에 insert
          const { error: insertError } = await serviceSupabase
            .from('portfolio_holdings')
            .insert({
              user_id: user.id,
              account_id: mapping.account_id,
              stock_id: stock.id,
              shares: position.quantity,
              average_cost: position.avgPrice,
            });

          if (!insertError) {
            result.inserted++;
          }

          result.positions.push({
            symbol,
            symbolName: position.symbolName,
            quantity: position.quantity,
          });
        }
      } catch (err) {
        console.error('[sync] error for account:', mapping.account_id, err);
        result.error = err instanceof Error ? err.message : '알 수 없는 오류';
      }

      results.push(result);
    }

    const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
    const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);

    return NextResponse.json({
      success: true,
      message: `동기화 완료: 기존 ${totalDeleted}개 삭제, ${totalInserted}개 동기화`,
      results,
    });
  } catch (error) {
    console.error('[sync POST]', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
