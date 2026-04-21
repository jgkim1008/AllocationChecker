/**
 * 브로커 자격증명 진단 API (개발용 — 프로덕션 차단)
 * GET: 저장된 계좌번호 형식 확인 (마스킹 처리)
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { decryptCredentials } from '@/lib/crypto/encryption';
import type { KISCredentials } from '@/lib/broker/types';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: '프로덕션에서 사용 불가' }, { status: 403 });
  }

  const supabase = await createServiceClient();
  const { data: rows, error } = await supabase
    .from('broker_credentials')
    .select('id, user_id, broker_type, account_alias, encrypted_credentials, encryption_iv, encryption_tag, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = (rows || []).map(row => {
    try {
      const creds = decryptCredentials<KISCredentials>(
        row.encrypted_credentials,
        row.encryption_iv,
        row.encryption_tag,
      );

      const raw = creds.accountNumber ?? '';
      const normalized = raw.replace(/[\s-]/g, '');

      // 계좌번호 형식 분석
      let cano = '';
      let productCode = '';
      let formatOk = false;

      if (normalized.length === 10 && /^\d{10}$/.test(normalized)) {
        cano = normalized.slice(0, 8);
        productCode = normalized.slice(8);
        formatOk = true;
      } else if (raw.includes('-')) {
        const parts = raw.split('-');
        cano = parts[0];
        productCode = parts[1] ?? '';
        formatOk = /^\d{8}$/.test(cano) && /^\d{2}$/.test(productCode);
      }

      // 마스킹: 앞 4자리만 표시
      const maskedRaw = raw.length > 4 ? raw.slice(0, 4) + '*'.repeat(raw.length - 4) : raw;

      return {
        id: row.id,
        brokerType: row.broker_type,
        accountAlias: row.account_alias,
        savedAt: row.created_at,
        accountNumber: {
          raw: maskedRaw,
          length: raw.length,
          normalizedLength: normalized.length,
          cano: cano ? cano.slice(0, 2) + '******' : '?',
          productCode,
          formatOk,
          issue: !formatOk ? `길이 ${raw.length}자 — XXXXXXXX-XX 또는 XXXXXXXXXX 형식이어야 함` : null,
        },
        hasAppKey: !!creds.appKey,
        hasAppSecret: !!creds.appSecret,
      };
    } catch (e) {
      return {
        id: row.id,
        brokerType: row.broker_type,
        accountAlias: row.account_alias,
        decryptError: (e as Error).message,
      };
    }
  });

  return NextResponse.json({ count: result.length, credentials: result });
}
