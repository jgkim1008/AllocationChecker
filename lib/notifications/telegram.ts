/**
 * Telegram 알림 모듈
 * 마감 알림을 구독한 사용자들에게 메시지 전송
 */

import { createServiceClient } from '@/lib/supabase/server';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export interface TelegramSubscriber {
  chat_id: number;
  username?: string;
  subscribed_at: string;
  is_active: boolean;
}

/**
 * Telegram 메시지 전송
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.error('[Telegram] BOT_TOKEN not configured');
    return false;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`[Telegram] Send failed for chat ${chatId}:`, error);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[Telegram] Send error for chat ${chatId}:`, error);
    return false;
  }
}

/**
 * 구독자 목록 조회
 */
export async function getActiveSubscribers(): Promise<TelegramSubscriber[]> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from('telegram_subscribers')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('[Telegram] Failed to fetch subscribers:', error);
    return [];
  }

  return data || [];
}

/**
 * 구독 추가
 */
export async function addSubscriber(chatId: number, username?: string): Promise<boolean> {
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from('telegram_subscribers')
    .upsert(
      {
        chat_id: chatId,
        username: username || null,
        subscribed_at: new Date().toISOString(),
        is_active: true,
      },
      { onConflict: 'chat_id' }
    );

  if (error) {
    console.error('[Telegram] Failed to add subscriber:', error);
    return false;
  }

  return true;
}

/**
 * 구독 취소
 */
export async function removeSubscriber(chatId: number): Promise<boolean> {
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from('telegram_subscribers')
    .update({ is_active: false })
    .eq('chat_id', chatId);

  if (error) {
    console.error('[Telegram] Failed to remove subscriber:', error);
    return false;
  }

  return true;
}

/**
 * 구독 상태 확인
 */
export async function isSubscribed(chatId: number): Promise<boolean> {
  const supabase = await createServiceClient();

  const { data } = await supabase
    .from('telegram_subscribers')
    .select('is_active')
    .eq('chat_id', chatId)
    .single();

  return data?.is_active === true;
}

/**
 * 모든 구독자에게 메시지 전송
 */
export async function broadcastToSubscribers(text: string): Promise<number> {
  const subscribers = await getActiveSubscribers();
  let successCount = 0;

  for (const sub of subscribers) {
    const success = await sendTelegramMessage(sub.chat_id, text);
    if (success) {
      successCount++;
    } else {
      // 전송 실패 시 (봇 차단 등) 구독 비활성화
      console.log(`[Telegram] Deactivating subscriber ${sub.chat_id} due to send failure`);
      await removeSubscriber(sub.chat_id);
    }
    // Rate limit 방지
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`[Telegram] Broadcast complete: ${successCount}/${subscribers.length} delivered`);
  return successCount;
}
