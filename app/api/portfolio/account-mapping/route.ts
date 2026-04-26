/**
 * 포트폴리오 계좌 ↔ 브로커 계좌 매핑 API
 *
 * GET: 현재 매핑 목록 조회
 * POST: 매핑 생성 { accountId, brokerCredentialId }
 * DELETE: 매핑 해제 { accountId } 또는 { brokerCredentialId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 현재 사용자의 계좌 ID 목록 조회
    const { data: userAccounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', user.id);

    const userAccountIds = (userAccounts || []).map((a: any) => a.id);

    if (userAccountIds.length === 0) {
      return NextResponse.json([]);
    }

    // 현재 사용자 계좌에 속한 매핑만 조회
    const { data: mappings, error } = await supabase
      .from('account_broker_mapping')
      .select(`
        id,
        account_id,
        broker_credential_id,
        created_at,
        account:accounts(id, name, type),
        broker:broker_credentials(id, broker_type, account_alias)
      `)
      .in('account_id', userAccountIds)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[account-mapping GET]', error);
      return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
    }

    const userMappings = mappings || [];

    return NextResponse.json(userMappings);
  } catch (error) {
    console.error('[account-mapping GET]', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { accountId, brokerCredentialId } = body;

    if (!accountId || !brokerCredentialId) {
      return NextResponse.json(
        { error: 'accountId와 brokerCredentialId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 계좌 소유권 확인
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, user_id')
      .eq('id', accountId)
      .single();

    if (accountError || !account || account.user_id !== user.id) {
      return NextResponse.json({ error: '계좌를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 브로커 자격증명 소유권 확인
    const { data: broker, error: brokerError } = await supabase
      .from('broker_credentials')
      .select('id, user_id')
      .eq('id', brokerCredentialId)
      .single();

    if (brokerError || !broker || broker.user_id !== user.id) {
      return NextResponse.json({ error: '브로커 자격증명을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 매핑 생성 (upsert - accountId 기준)
    const { data: mapping, error: insertError } = await supabase
      .from('account_broker_mapping')
      .upsert({
        account_id: accountId,
        broker_credential_id: brokerCredentialId,
      }, {
        onConflict: 'account_id',
      })
      .select(`
        id,
        account_id,
        broker_credential_id,
        created_at,
        account:accounts(id, name, type),
        broker:broker_credentials(id, broker_type, account_alias)
      `)
      .single();

    if (insertError) {
      // broker_credential_id 중복 에러 처리
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: '해당 브로커 계좌는 이미 다른 포트폴리오 계좌에 연결되어 있습니다.' },
          { status: 409 }
        );
      }
      console.error('[account-mapping POST]', insertError);
      return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 });
    }

    return NextResponse.json(mapping, { status: 201 });
  } catch (error) {
    console.error('[account-mapping POST]', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const brokerCredentialId = searchParams.get('brokerCredentialId');

    if (!accountId && !brokerCredentialId) {
      return NextResponse.json(
        { error: 'accountId 또는 brokerCredentialId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 매핑 조회 및 소유권 확인
    let query = supabase
      .from('account_broker_mapping')
      .select('id, account_id, account:accounts(user_id)');

    if (accountId) {
      query = query.eq('account_id', accountId);
    } else {
      query = query.eq('broker_credential_id', brokerCredentialId!);
    }

    const { data: mapping, error: findError } = await query.maybeSingle();

    if (findError || !mapping) {
      return NextResponse.json({ error: '매핑을 찾을 수 없습니다.' }, { status: 404 });
    }

    const accountOwner = (mapping.account as any)?.user_id;
    if (accountOwner !== user.id) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 매핑 삭제
    const { error: deleteError } = await supabase
      .from('account_broker_mapping')
      .delete()
      .eq('id', mapping.id);

    if (deleteError) {
      console.error('[account-mapping DELETE]', deleteError);
      return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[account-mapping DELETE]', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
