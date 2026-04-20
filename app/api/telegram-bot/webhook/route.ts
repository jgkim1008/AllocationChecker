import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { addSubscriber, removeSubscriber, isSubscribed } from '@/lib/notifications/telegram';

/**
 * Telegram Bot Webhook
 * POST /api/telegram-bot/webhook
 *
 * 명령어:
 * /start - 시작
 * /help - 도움말
 * /fib - 피보나치 현황
 * /us - 미국장 현황
 * /kr - 한국장 현황
 * /subscribe - 마감 알림 구독
 * /unsubscribe - 마감 알림 해제
 * $종목명 - 종목 분석 (예: $AAPL, $삼성전자)
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
      type: string;
      title?: string;
    };
    from?: {
      id: number;
      username?: string;
    };
    text?: string;
    date: number;
  };
}

// 이모지 헬퍼
function alertEmoji(distance: number): string {
  if (distance < 3) return '🔴';
  if (distance < 5) return '🟠';
  if (distance < 10) return '🟡';
  return '⚪';
}

// Telegram 메시지 전송
async function sendMessage(chatId: number, text: string, parseMode: 'HTML' | 'Markdown' = 'HTML') {
  if (!BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    return;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });
  } catch (error) {
    console.error('Telegram send error:', error);
  }
}

// 시작 메시지
function getStartMessage(): string {
  return `👋 <b>피보나치 분석 봇</b>에 오신 것을 환영합니다!

📊 주요 지수와 종목의 피보나치 레벨을 분석해드립니다.

<b>명령어:</b>
/fib - 지수 피보나치 현황
/us - 미국 근접 종목
/kr - 한국 근접 종목
/ma - 월봉 10이평 신호 전환
/subscribe 이메일 비밀번호 - 🔔 마감 알림 구독
/help - 도움말

<b>종목 분석:</b>
<code>$AAPL</code> - 애플 분석
<code>$삼성전자</code> - 삼성전자 분석`;
}

// 도움말
function getHelpMessage(): string {
  return `📖 <b>명령어 안내</b>

<b>📊 현황 조회</b>
/fib - 주요 지수 피보나치 현황
/us - 미국 레벨 근접 종목
/kr - 한국 레벨 근접 종목
/ma - 월봉 10이평 신호 전환 종목

<b>🔔 자동 알림</b>
/subscribe 이메일 비밀번호 - 마감 알림 구독 (계정 인증 필요)
/unsubscribe - 마감 알림 해제

<b>🔍 종목 분석</b>
<code>$AAPL</code> - 미국 종목
<code>$삼성전자</code> - 한국 종목
<code>$005930</code> - 종목코드로 조회

<b>ℹ️ 피보나치 레벨</b>
0%, 14%, 23.6%, 38.2%, 50%, 61.8%, 76.4%, 85.4%, 100%

🔴 3% 이내 | 🟠 5% 이내 | 🟡 10% 이내`;
}

// 피보나치 현황
async function getFibonacciStatus(): Promise<string> {
  const supabase = await createServiceClient();

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
  let text = `📊 <b>피보나치 현황</b> (${report.report_date})\n`;
  text += `━━━━━━━━━━━━━━━\n`;

  for (const idx of indices.slice(0, 6)) {
    const emoji = alertEmoji(idx.distanceFromLevel);
    const pos = (idx.fibonacciValue * 100).toFixed(1);
    const dist = idx.distanceFromLevel.toFixed(1);
    text += `${emoji} <b>${idx.name}</b>: ${pos}% (${dist}%)\n`;
  }

  return text;
}

// 미국 종목
async function getUSStocks(): Promise<string> {
  const supabase = await createServiceClient();

  const { data: report } = await supabase
    .from('fibonacci_reports')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(1)
    .single();

  if (!report) return '❌ 리포트가 없습니다.';

  const stocks = (report.us_data || [])
    .filter((s: { distanceFromLevel: number }) => s.distanceFromLevel < 10)
    .slice(0, 10);

  if (stocks.length === 0) {
    return '🇺🇸 미국장에 피보나치 레벨 근접 종목이 없습니다.';
  }

  let text = `🇺🇸 <b>미국 피보나치 근접 종목</b>\n`;
  text += `━━━━━━━━━━━━━━━\n`;

  for (const s of stocks) {
    const emoji = alertEmoji(s.distanceFromLevel);
    const pos = (s.fibonacciValue * 100).toFixed(1);
    text += `${emoji} <b>${s.symbol}</b>: ${pos}% (${s.distanceFromLevel.toFixed(1)}%)\n`;
  }

  return text;
}

// 한국 종목
async function getKRStocks(): Promise<string> {
  const supabase = await createServiceClient();

  const { data: report } = await supabase
    .from('fibonacci_reports')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(1)
    .single();

  if (!report) return '❌ 리포트가 없습니다.';

  const stocks = (report.kr_data || [])
    .filter((s: { distanceFromLevel: number }) => s.distanceFromLevel < 10)
    .slice(0, 10);

  if (stocks.length === 0) {
    return '🇰🇷 한국장에 피보나치 레벨 근접 종목이 없습니다.';
  }

  let text = `🇰🇷 <b>한국 피보나치 근접 종목</b>\n`;
  text += `━━━━━━━━━━━━━━━\n`;

  for (const s of stocks) {
    const emoji = alertEmoji(s.distanceFromLevel);
    const pos = (s.fibonacciValue * 100).toFixed(1);
    text += `${emoji} <b>${s.name}</b>: ${pos}%\n`;
  }

  return text;
}

// 월봉 10이평 신호 전환 종목
async function getMonthlyMASignals(): Promise<string> {
  const supabase = await createServiceClient();

  const { data: cached } = await supabase
    .from('monthly_ma_cache')
    .select('data, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!cached) {
    return '❌ 월봉 10이평 데이터가 없습니다.\n스캔을 먼저 실행해주세요.';
  }

  const stocks: {
    symbol: string;
    name: string;
    market: string;
    signal: string;
    signalChanged: boolean;
    maDeviation: number;
    consecutiveMonths: number;
    lastSignalDate: string | null;
    deathCandle: boolean;
  }[] = cached.data || [];

  const changed = stocks.filter(s => s.signalChanged);

  const scanDate = new Date(cached.created_at).toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric'
  });

  if (changed.length === 0) {
    return `📊 <b>월봉 10이평 신호 전환</b>\n━━━━━━━━━━━━━━━\n✅ 최근 스캔(${scanDate}) 기준 신호 전환 종목 없음`;
  }

  const buySignals  = changed.filter(s => s.signal === 'HOLD');
  const sellSignals = changed.filter(s => s.signal === 'SELL');

  let text = `📊 <b>월봉 10이평 신호 전환</b> (${scanDate})\n`;
  text += `━━━━━━━━━━━━━━━\n`;

  if (sellSignals.length > 0) {
    text += `\n🔴 <b>매도 전환 (${sellSignals.length})</b>\n`;
    for (const s of sellSignals) {
      const death = s.deathCandle ? ' ☠️' : '';
      const dev = s.maDeviation.toFixed(1);
      text += `  • <b>${s.symbol}</b> ${s.name}${death}\n`;
      text += `    MA 대비 ${dev}%\n`;
    }
  }

  if (buySignals.length > 0) {
    text += `\n🟢 <b>매수 전환 (${buySignals.length})</b>\n`;
    for (const s of buySignals) {
      const dev = s.maDeviation >= 0 ? `+${s.maDeviation.toFixed(1)}` : s.maDeviation.toFixed(1);
      text += `  • <b>${s.symbol}</b> ${s.name}\n`;
      text += `    MA 대비 ${dev}%\n`;
    }
  }

  text += `\n━━━━━━━━━━━━━━━\n`;
  text += `전체 모니터링: ${stocks.length}개 종목`;

  return text;
}

// 종목 분석
async function analyzeStock(symbol: string): Promise<string> {
  const supabase = await createServiceClient();

  const { data: stock } = await supabase
    .from('stocks')
    .select('*')
    .or(`symbol.ilike.%${symbol}%,name.ilike.%${symbol}%`)
    .limit(1)
    .single();

  if (!stock) {
    return `❌ "<code>${symbol}</code>" 종목을 찾을 수 없습니다.`;
  }

  const { current_price, year_high, year_low, name, market, change_percent } = stock;

  if (!current_price || !year_high || !year_low) {
    return `❌ ${name} 가격 정보가 없습니다.`;
  }

  const range = Number(year_high) - Number(year_low);
  const position = range > 0 ? (Number(current_price) - Number(year_low)) / range : 0.5;
  const posPercent = (position * 100).toFixed(1);

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

  let text = `${emoji} <b>${name}</b> (${stock.symbol})\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  text += `💰 현재가: <b>${priceFormat}</b> ${changeStr}\n`;
  text += `📊 피보나치: <b>${posPercent}%</b>\n`;
  text += `🎯 근접 레벨: ${(nearestLevel * 100).toFixed(1)}% (거리 ${(minDist * 100).toFixed(1)}%)\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  text += `📈 52주 고가: ${market === 'KR' ? '₩' : '$'}${Number(year_high).toLocaleString()}\n`;
  text += `📉 52주 저가: ${market === 'KR' ? '₩' : '$'}${Number(year_low).toLocaleString()}`;

  return text;
}

// 메시지 처리
async function handleMessage(chatId: number, text: string, username?: string) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 명령어 처리
  if (lower === '/start') {
    await sendMessage(chatId, getStartMessage());
    return;
  }

  if (lower === '/help' || lower === '도움말') {
    await sendMessage(chatId, getHelpMessage());
    return;
  }

  if (lower === '/fib' || lower === '피보나치' || lower === '현황') {
    const response = await getFibonacciStatus();
    await sendMessage(chatId, response);
    return;
  }

  if (lower === '/us' || lower === '미국' || lower === '미국장') {
    const response = await getUSStocks();
    await sendMessage(chatId, response);
    return;
  }

  if (lower === '/kr' || lower === '한국' || lower === '한국장') {
    const response = await getKRStocks();
    await sendMessage(chatId, response);
    return;
  }

  if (lower === '/ma' || lower === '/ma10' || lower === '월봉' || lower === '이평') {
    const response = await getMonthlyMASignals();
    await sendMessage(chatId, response);
    return;
  }

  // 마감 알림 구독 (아이디/비밀번호 인증 필요)
  if (lower.startsWith('/subscribe') || lower === '구독') {
    // /subscribe 만 입력한 경우 안내
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) {
      const alreadySubscribed = await isSubscribed(chatId);
      if (alreadySubscribed) {
        await sendMessage(chatId, `✅ 이미 마감 알림을 구독 중입니다.

계정을 연결하려면 아래 형식으로 입력하세요:
<code>/subscribe 아이디 비밀번호</code>

해제하려면 /unsubscribe`);
      } else {
        await sendMessage(chatId, `🔐 <b>구독하려면 계정 인증이 필요합니다.</b>

아래 형식으로 입력해주세요:

<code>/subscribe 아이디 비밀번호</code>

예시:
<code>/subscribe myusername mypassword</code>`);
      }
      return;
    }

    const inputUsername = parts[1].trim().toLowerCase();
    const email = `${inputUsername}@allocationchecker.local`;
    const password = parts.slice(2).join(' ');

    // Supabase 계정 인증
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      await sendMessage(chatId, '❌ 아이디 또는 비밀번호가 올바르지 않습니다.\n\n다시 시도해주세요.');
      return;
    }

    const alreadySubscribed = await isSubscribed(chatId);
    const success = await addSubscriber(chatId, username, authData.user.id);
    if (success) {
      const msg = alreadySubscribed
        ? `✅ <b>계정 연결 완료!</b>\n\n${inputUsername} 계정과 연결되었습니다.\nDCA 알림이 이제 정상적으로 발송됩니다.`
        : `🔔 <b>마감 알림 구독 완료!</b>

미국장/한국장 마감 시 자동으로 피보나치 현황을 알려드립니다.

<b>알림 시간 (한국 시간)</b>
🇺🇸 미국장: 오전 7시 (서머타임 시 6시)
🇰🇷 한국장: 오후 4시

해제하려면 /unsubscribe`;
      await sendMessage(chatId, msg);
    } else {
      await sendMessage(chatId, '❌ 구독 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
    return;
  }

  // 마감 알림 해제
  if (lower === '/unsubscribe' || lower === '구독해제') {
    const subscribed = await isSubscribed(chatId);
    if (!subscribed) {
      await sendMessage(chatId, '⚠️ 현재 구독 중이 아닙니다.\n\n구독하려면 /subscribe 를 입력하세요.');
      return;
    }

    const success = await removeSubscriber(chatId);
    if (success) {
      await sendMessage(chatId, '🔕 마감 알림 구독이 해제되었습니다.\n\n다시 구독하려면 /subscribe');
    } else {
      await sendMessage(chatId, '❌ 구독 해제 중 오류가 발생했습니다.');
    }
    return;
  }

  // $종목 분석
  if (trimmed.startsWith('$')) {
    const symbol = trimmed.slice(1).trim();
    if (symbol) {
      const response = await analyzeStock(symbol);
      await sendMessage(chatId, response);
      return;
    }
  }

  // 종목명으로 바로 검색 시도
  if (/^[a-zA-Z가-힣0-9]+$/.test(trimmed) && trimmed.length >= 2) {
    const response = await analyzeStock(trimmed);
    await sendMessage(chatId, response);
    return;
  }
}

export async function POST(request: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
  }

  try {
    const update: TelegramUpdate = await request.json();

    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const username = update.message.from?.username;

      // 메시지 처리 완료까지 대기
      await handleMessage(chatId, text, username);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook Error]', error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}

// Webhook 설정 확인용
export async function GET() {
  return NextResponse.json({
    status: 'Telegram webhook endpoint',
    configured: !!BOT_TOKEN,
  });
}
