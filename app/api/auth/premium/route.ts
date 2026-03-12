import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ isPremium: false });
    }

    const { data } = await supabase
      .from('premium_users')
      .select('is_active, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      const isActive = data.is_active;
      const notExpired = !data.expires_at || new Date(data.expires_at) > new Date();
      return NextResponse.json({ isPremium: isActive && notExpired });
    }

    return NextResponse.json({ isPremium: false });
  } catch (error) {
    console.error('Premium check error:', error);
    return NextResponse.json({ isPremium: false });
  }
}
