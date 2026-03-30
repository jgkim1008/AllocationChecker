/**
 * 자동매매 상태 API
 *
 * GET: 자동매매 상태 조회
 * POST: 자동매매 설정 저장
 * DELETE: 자동매매 중지
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient } from '@/lib/broker/session';
import type { BrokerType, AutoTradeStatus, MarketType } from '@/lib/broker/types';
import type { StrategyVersion } from '@/lib/infinite-buy/core/types';

interface AutoTradeSettings {
  userId: string;
  symbol: string;
  brokerType: BrokerType;
  strategyVersion: StrategyVersion;
  totalCapital: number;
  currentCycle: number;
  currentRound: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// GET: 자동매매 상태 조회
export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    const serviceClient = await createServiceClient();

    // 자동매매 설정 조회
    let query = serviceClient
      .from('auto_trade_settings')
      .select('*')
      .eq('user_id', user.id);

    if (symbol) {
      query = query.eq('symbol', symbol);
    }

    const { data: settings, error } = await query;

    if (error && error.code !== 'PGRST116') {
      console.error('자동매매 설정 조회 오류:', error);
      return NextResponse.json(
        { success: false, error: '설정 조회에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        settings: settings || [],
      },
    });
  } catch (error) {
    console.error('자동매매 상태 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 자동매매 설정 저장
export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      symbol,
      brokerType,
      strategyVersion,
      totalCapital,
      currentCycle,
      currentRound,
      isEnabled,
    } = body as {
      symbol: string;
      brokerType: BrokerType;
      strategyVersion: StrategyVersion;
      totalCapital: number;
      currentCycle?: number;
      currentRound?: number;
      isEnabled?: boolean;
    };

    if (!symbol || !brokerType || !strategyVersion || !totalCapital) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    const serviceClient = await createServiceClient();

    const settingsData = {
      user_id: user.id,
      symbol,
      broker_type: brokerType,
      strategy_version: strategyVersion,
      total_capital: totalCapital,
      current_cycle: currentCycle ?? 1,
      current_round: currentRound ?? 0,
      is_enabled: isEnabled ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await serviceClient
      .from('auto_trade_settings')
      .upsert(settingsData, {
        onConflict: 'user_id,symbol',
      })
      .select()
      .single();

    if (error) {
      console.error('자동매매 설정 저장 오류:', error);
      return NextResponse.json(
        { success: false, error: '설정 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '자동매매 설정이 저장되었습니다.',
      data: {
        settings: data,
      },
    });
  } catch (error) {
    console.error('자동매매 설정 저장 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 자동매매 중지
export async function DELETE(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'symbol이 필요합니다.' },
        { status: 400 }
      );
    }

    const serviceClient = await createServiceClient();

    // is_enabled를 false로 설정 (완전 삭제 대신)
    const { error } = await serviceClient
      .from('auto_trade_settings')
      .update({
        is_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('symbol', symbol);

    if (error) {
      console.error('자동매매 중지 오류:', error);
      return NextResponse.json(
        { success: false, error: '자동매매 중지에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '자동매매가 중지되었습니다.',
    });
  } catch (error) {
    console.error('자동매매 중지 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
