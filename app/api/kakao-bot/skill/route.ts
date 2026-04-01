import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * 카카오 i 오픈빌더 스킬 서버
 * POST /api/kakao-bot/skill
 *
 * 지원하는 발화:
 * - "피보나치 현황", "미국장 현황", "한국장 현황"
 * - "AAPL 분석", "삼성전자 분석" (종목 분석)
 * - "도움말", "사용법"
 */

interface KakaoSkillRequest {
  intent: {
    id: string;
    name: string;
  };
  userRequest: {
    utterance: string;
    user: {
      id: string;
    };
  };
  action: {
    name: string;
    params: Record<string, string>;
  };
}

interface SimpleText {
  simpleText: {
    text: string;
  };
}

interface ListCard {
  listCard: {
    header: {
      title: string;
    };
    items: {
      title: string;
      description: string;
    }[];
  };
}

type OutputType = SimpleText | ListCard;

interface KakaoSkillResponse {
  version: string;
  template: {
    outputs: OutputType[];
    quickReplies?: {
      label: string;
      action: string;
      messageText: string;
    }[];
  };
}

// 이모지 헬퍼
function alertEmoji(distance: number): string {
  if (distance < 3) return '🔴';
  if (distance < 5) return '🟠';
  if (distance < 10) return '🟡';
  return '⚪';
}

// 응답 빌더
function buildResponse(outputs: OutputType[], quickReplies?: { label: string; messageText: string }[]): KakaoSkillResponse {
  return {
    version: '2.0',
    template: {
      outputs,
      quickReplies: quickReplies?.map(qr => ({
        label: qr.label,
        action: 'message',
        messageText: qr.messageText,
      })),
    },
  };
}

function simpleText(text: string): SimpleText {
  return { simpleText: { text } };
}

// 피보나치 현황 조회
async function getFibonacciStatus(market?: 'US' | 'KR' | 'INDEX'): Promise<OutputType[]> {
  const supabase = await createServiceClient();

  const { data: report } = await supabase
    .from('fibonacci_reports')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(1)
    .single();

  if (!report) {
    return [simpleText('아직 피보나치 리포트가 없습니다. 잠시 후 다시 시도해주세요.')];
  }

  const outputs: OutputType[] = [];

  // 지수 현황
  if (!market || market === 'INDEX') {
    const indices = report.indices_data || [];
    if (indices.length > 0) {
      let text = '📊 주요 지수 피보나치 현황\n\n';
      for (const idx of indices.slice(0, 5)) {
        const emoji = alertEmoji(idx.distanceFromLevel);
        const pos = (idx.fibonacciValue * 100).toFixed(1);
        text += `${emoji} ${idx.name}: ${pos}% (거리 ${idx.distanceFromLevel.toFixed(1)}%)\n`;
      }
      text += `\n📅 ${report.report_date} 기준`;
      outputs.push(simpleText(text));
    }
  }

  // 미국 종목
  if (market === 'US') {
    const usStocks = report.us_data || [];
    const nearLevel = usStocks.filter((s: { distanceFromLevel: number }) => s.distanceFromLevel < 5).slice(0, 5);
    if (nearLevel.length > 0) {
      let text = '🇺🇸 미국 피보나치 레벨 근접 종목\n\n';
      for (const s of nearLevel) {
        const emoji = alertEmoji(s.distanceFromLevel);
        text += `${emoji} ${s.symbol}: ${(s.fibonacciValue * 100).toFixed(1)}%\n`;
      }
      outputs.push(simpleText(text));
    } else {
      outputs.push(simpleText('🇺🇸 미국 시장에 피보나치 레벨 근접 종목이 없습니다.'));
    }
  }

  // 한국 종목
  if (market === 'KR') {
    const krStocks = report.kr_data || [];
    const nearLevel = krStocks.filter((s: { distanceFromLevel: number }) => s.distanceFromLevel < 5).slice(0, 5);
    if (nearLevel.length > 0) {
      let text = '🇰🇷 한국 피보나치 레벨 근접 종목\n\n';
      for (const s of nearLevel) {
        const emoji = alertEmoji(s.distanceFromLevel);
        text += `${emoji} ${s.symbol}: ${(s.fibonacciValue * 100).toFixed(1)}%\n`;
      }
      outputs.push(simpleText(text));
    } else {
      outputs.push(simpleText('🇰🇷 한국 시장에 피보나치 레벨 근접 종목이 없습니다.'));
    }
  }

  return outputs.length > 0 ? outputs : [simpleText('데이터를 불러오는 중 오류가 발생했습니다.')];
}

// 종목 분석
async function analyzeStock(symbol: string): Promise<OutputType[]> {
  const supabase = await createServiceClient();

  // stocks 테이블에서 종목 검색
  const { data: stock } = await supabase
    .from('stocks')
    .select('*')
    .or(`symbol.ilike.%${symbol}%,name.ilike.%${symbol}%`)
    .limit(1)
    .single();

  if (!stock) {
    return [simpleText(`"${symbol}" 종목을 찾을 수 없습니다.\n\n정확한 종목코드나 이름으로 다시 시도해주세요.`)];
  }

  const { current_price, year_high, year_low, name, market } = stock;

  if (!current_price || !year_high || !year_low) {
    return [simpleText(`${name} (${stock.symbol}) 가격 정보가 없습니다.`)];
  }

  const range = year_high - year_low;
  const position = range > 0 ? (current_price - year_low) / range : 0.5;
  const posPercent = (position * 100).toFixed(1);

  // 가장 가까운 피보나치 레벨 찾기
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

  const emoji = alertEmoji(minDist * 100);

  let text = `${emoji} ${name} (${stock.symbol})\n\n`;
  text += `💰 현재가: ${priceFormat}\n`;
  text += `📊 피보나치 위치: ${posPercent}%\n`;
  text += `🎯 가장 가까운 레벨: ${(nearestLevel * 100).toFixed(1)}%\n`;
  text += `📏 레벨까지 거리: ${(minDist * 100).toFixed(1)}%\n\n`;
  text += `📈 52주 고가: ${market === 'KR' ? '₩' : '$'}${Number(year_high).toLocaleString()}\n`;
  text += `📉 52주 저가: ${market === 'KR' ? '₩' : '$'}${Number(year_low).toLocaleString()}`;

  return [simpleText(text)];
}

// 도움말
function getHelp(): OutputType[] {
  const text = `📖 사용 가능한 명령어

📊 현황 조회
• "피보나치 현황" - 전체 현황
• "미국장 현황" - 미국 종목
• "한국장 현황" - 한국 종목

🔍 종목 분석
• "AAPL 분석" - 미국 종목
• "삼성전자 분석" - 한국 종목
• "005930 분석" - 종목코드로 조회

❓ 기타
• "도움말" - 이 메시지`;

  return [simpleText(text)];
}

export async function POST(request: NextRequest) {
  try {
    const body: KakaoSkillRequest = await request.json();
    const utterance = body.userRequest.utterance.trim();
    const actionName = body.action?.name || '';
    const params = body.action?.params || {};

    let outputs: OutputType[] = [];
    let quickReplies = [
      { label: '피보나치 현황', messageText: '피보나치 현황' },
      { label: '도움말', messageText: '도움말' },
    ];

    // 액션 기반 처리 (오픈빌더에서 설정한 경우)
    if (actionName === 'fibonacci_status') {
      const market = params.market as 'US' | 'KR' | 'INDEX' | undefined;
      outputs = await getFibonacciStatus(market);
      quickReplies = [
        { label: '미국장', messageText: '미국장 현황' },
        { label: '한국장', messageText: '한국장 현황' },
        { label: '도움말', messageText: '도움말' },
      ];
    } else if (actionName === 'stock_analysis') {
      const symbol = params.symbol || '';
      outputs = await analyzeStock(symbol);
    } else if (actionName === 'help') {
      outputs = getHelp();
    }
    // 발화 기반 처리 (폴백)
    else {
      const lowerUtterance = utterance.toLowerCase();

      if (lowerUtterance.includes('도움말') || lowerUtterance.includes('사용법') || lowerUtterance.includes('help')) {
        outputs = getHelp();
      } else if (lowerUtterance.includes('미국') || lowerUtterance.includes('us')) {
        outputs = await getFibonacciStatus('US');
        quickReplies = [
          { label: '한국장', messageText: '한국장 현황' },
          { label: '지수', messageText: '피보나치 현황' },
        ];
      } else if (lowerUtterance.includes('한국') || lowerUtterance.includes('kr') || lowerUtterance.includes('코스피') || lowerUtterance.includes('코스닥')) {
        outputs = await getFibonacciStatus('KR');
        quickReplies = [
          { label: '미국장', messageText: '미국장 현황' },
          { label: '지수', messageText: '피보나치 현황' },
        ];
      } else if (lowerUtterance.includes('피보나치') || lowerUtterance.includes('현황') || lowerUtterance.includes('지수')) {
        outputs = await getFibonacciStatus('INDEX');
        quickReplies = [
          { label: '미국장', messageText: '미국장 현황' },
          { label: '한국장', messageText: '한국장 현황' },
        ];
      } else if (lowerUtterance.includes('분석')) {
        // "AAPL 분석", "삼성전자 분석" 형태
        const symbol = utterance.replace(/분석/g, '').trim();
        if (symbol) {
          outputs = await analyzeStock(symbol);
        } else {
          outputs = [simpleText('분석할 종목명이나 코드를 입력해주세요.\n예: "AAPL 분석", "삼성전자 분석"')];
        }
      } else {
        // 기본 응답
        outputs = [simpleText(`안녕하세요! 피보나치 분석 봇입니다 📊\n\n"피보나치 현황" 또는 "도움말"을 입력해보세요!`)];
      }
    }

    return NextResponse.json(buildResponse(outputs, quickReplies));
  } catch (error) {
    console.error('[Kakao Bot Error]', error);
    return NextResponse.json(
      buildResponse([simpleText('오류가 발생했습니다. 잠시 후 다시 시도해주세요.')])
    );
  }
}
