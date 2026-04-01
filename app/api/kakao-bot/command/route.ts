import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * 오픈채팅방 봇용 명령어 API
 * GET /api/kakao-bot/command?q=명령어
 *
 * 명령어 형식:
 * $ + 종목명 : 종목 시세/분석
 * & + 키워드 : 피보나치 현황, 지수 등
 * ? + 질문  : AI 질문 (추후 구현)
 */

export const maxDuration = 30;

// 이모지 헬퍼
function alertEmoji(distance: number): string {
  if (distance < 3) return '🔴';
  if (distance < 5) return '🟠';
  if (distance < 10) return '🟡';
  return '⚪';
}

// 종목 시세/분석 ($명령어)
async function handleStockCommand(query: string): Promise<string> {
  const supabase = await createServiceClient();
  const symbol = query.trim();

  if (!symbol) {
    return '❌ 종목명을 입력해주세요.\n예: $AAPL  $삼성전자  $비트코인';
  }

  // stocks 테이블에서 종목 검색
  const { data: stock } = await supabase
    .from('stocks')
    .select('*')
    .or(`symbol.ilike.%${symbol}%,name.ilike.%${symbol}%`)
    .limit(1)
    .single();

  if (!stock) {
    return `❌ "${symbol}" 종목을 찾을 수 없습니다.`;
  }

  const { current_price, year_high, year_low, name, market, change_percent } = stock;

  if (!current_price || !year_high || !year_low) {
    return `❌ ${name} (${stock.symbol}) 가격 정보가 없습니다.`;
  }

  const range = Number(year_high) - Number(year_low);
  const position = range > 0 ? (Number(current_price) - Number(year_low)) / range : 0.5;
  const posPercent = (position * 100).toFixed(1);

  // 가장 가까운 피보나치 레벨
  const FIB_LEVELS = [0, 0.14, 0.236, 0.382, 0.5, 0.618, 0.764, 0.854, 1];
  let nearestLevel = 0;
  let minDist = Infinity;
  for (const lvl of FIB_LEVELS) {
    const d = Math.abs(position - lvl);
    if (d < minDist) {
      minDist = d;
      nearestLevel = lvl;
    }
  }

  const priceFormat = market === 'KR'
    ? `₩${Number(current_price).toLocaleString()}`
    : `$${Number(current_price).toFixed(2)}`;

  const changeStr = change_percent != null
    ? `${Number(change_percent) >= 0 ? '📈' : '📉'} ${Number(change_percent) >= 0 ? '+' : ''}${Number(change_percent).toFixed(2)}%`
    : '';

  const emoji = alertEmoji(minDist * 100);

  let response = `${emoji} ${name} (${stock.symbol})\n`;
  response += `━━━━━━━━━━━━━━━\n`;
  response += `💰 현재가: ${priceFormat} ${changeStr}\n`;
  response += `📊 피보나치: ${posPercent}%\n`;
  response += `🎯 근접 레벨: ${(nearestLevel * 100).toFixed(1)}% (거리 ${(minDist * 100).toFixed(1)}%)\n`;
  response += `━━━━━━━━━━━━━━━\n`;
  response += `📈 52주 고가: ${market === 'KR' ? '₩' : '$'}${Number(year_high).toLocaleString()}\n`;
  response += `📉 52주 저가: ${market === 'KR' ? '₩' : '$'}${Number(year_low).toLocaleString()}`;

  return response;
}

// 정보 조회 (&명령어)
async function handleInfoCommand(query: string): Promise<string> {
  const supabase = await createServiceClient();
  const keyword = query.trim().toLowerCase();

  // 피보나치 현황
  if (keyword === '피보나치' || keyword === '현황' || keyword === '지수' || keyword === '') {
    const { data: report } = await supabase
      .from('fibonacci_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(1)
      .single();

    if (!report) {
      return '❌ 피보나치 리포트가 없습니다.';
    }

    const indices = report.indices_data || [];
    let response = `📊 피보나치 현황 (${report.report_date})\n`;
    response += `━━━━━━━━━━━━━━━\n`;

    for (const idx of indices.slice(0, 5)) {
      const emoji = alertEmoji(idx.distanceFromLevel);
      const pos = (idx.fibonacciValue * 100).toFixed(1);
      response += `${emoji} ${idx.name}: ${pos}%\n`;
    }

    return response;
  }

  // 미국
  if (keyword === '미국' || keyword === 'us' || keyword === '미국장') {
    const { data: report } = await supabase
      .from('fibonacci_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(1)
      .single();

    if (!report) return '❌ 리포트가 없습니다.';

    const stocks = (report.us_data || [])
      .filter((s: { distanceFromLevel: number }) => s.distanceFromLevel < 10)
      .slice(0, 7);

    if (stocks.length === 0) {
      return '🇺🇸 미국장 피보나치 레벨 근접 종목이 없습니다.';
    }

    let response = `🇺🇸 미국장 피보나치 근접 종목\n`;
    response += `━━━━━━━━━━━━━━━\n`;
    for (const s of stocks) {
      const emoji = alertEmoji(s.distanceFromLevel);
      response += `${emoji} ${s.symbol}: ${(s.fibonacciValue * 100).toFixed(1)}%\n`;
    }
    return response;
  }

  // 한국
  if (keyword === '한국' || keyword === 'kr' || keyword === '한국장' || keyword === '코스피' || keyword === '코스닥') {
    const { data: report } = await supabase
      .from('fibonacci_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(1)
      .single();

    if (!report) return '❌ 리포트가 없습니다.';

    const stocks = (report.kr_data || [])
      .filter((s: { distanceFromLevel: number }) => s.distanceFromLevel < 10)
      .slice(0, 7);

    if (stocks.length === 0) {
      return '🇰🇷 한국장 피보나치 레벨 근접 종목이 없습니다.';
    }

    let response = `🇰🇷 한국장 피보나치 근접 종목\n`;
    response += `━━━━━━━━━━━━━━━\n`;
    for (const s of stocks) {
      const emoji = alertEmoji(s.distanceFromLevel);
      response += `${emoji} ${s.name}: ${(s.fibonacciValue * 100).toFixed(1)}%\n`;
    }
    return response;
  }

  // 도움말
  if (keyword === '도움말' || keyword === 'help' || keyword === '명령어') {
    return getHelp();
  }

  return `❌ 알 수 없는 명령어: ${keyword}\n\n&도움말 을 입력해보세요.`;
}

// 도움말
function getHelp(): string {
  return `📖 명령어 안내
━━━━━━━━━━━━━━━
▶️ $ + 종목명
   종목 시세/피보나치 분석
   예: $AAPL  $삼성전자

▶️ & + 키워드
   &피보나치 - 지수 현황
   &미국 - 미국 근접 종목
   &한국 - 한국 근접 종목
   &도움말 - 이 메시지

▶️ ? + 질문 (준비중)
   AI 기반 질문 응답`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';

  if (!query.trim()) {
    return NextResponse.json({
      success: false,
      response: '❌ 명령어를 입력해주세요.\n\n' + getHelp(),
    });
  }

  try {
    let response = '';
    const trimmed = query.trim();
    const prefix = trimmed.charAt(0);
    const content = trimmed.slice(1).trim();

    switch (prefix) {
      case '$':
        response = await handleStockCommand(content);
        break;
      case '&':
        response = await handleInfoCommand(content);
        break;
      case '?':
        // AI 질문 (추후 구현)
        response = '🤖 AI 질문 기능은 준비 중입니다.';
        break;
      default:
        // 기본: 종목 조회 시도
        if (/^[a-zA-Z가-힣0-9]+$/.test(trimmed)) {
          response = await handleStockCommand(trimmed);
        } else {
          response = getHelp();
        }
    }

    return NextResponse.json({
      success: true,
      query,
      response,
    });
  } catch (error) {
    console.error('[Command Error]', error);
    return NextResponse.json({
      success: false,
      response: '❌ 오류가 발생했습니다.',
      error: String(error),
    });
  }
}
