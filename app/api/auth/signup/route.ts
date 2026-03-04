import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요' }, { status: 400 });
    }

    if (username.length < 3) {
      return NextResponse.json({ error: '아이디는 3자 이상이어야 합니다' }, { status: 400 });
    }

    if (password.length < 4) {
      return NextResponse.json({ error: '비밀번호는 4자 이상이어야 합니다' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email: `${username.trim().toLowerCase()}@allocationchecker.local`,
      password,
      email_confirm: true,
      user_metadata: { username: username.trim() },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        return NextResponse.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 });
      }
      return NextResponse.json({ error: '회원가입 중 오류가 발생했습니다' }, { status: 500 });
    }

    return NextResponse.json({ id: data.user.id }, { status: 201 });
  } catch (e) {
    console.error('[signup POST]', e);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
