// scripts/create-initial-user.mjs
// Run: node scripts/create-initial-user.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Parse .env.local manually
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const USERNAME = 'rlawnsrjs100';
  const PASSWORD = '12345';
  const EMAIL = `${USERNAME}@allocationchecker.local`;

  // 1. 이미 존재하는지 확인
  const { data: existing } = await supabase.auth.admin.listUsers();
  const existingUser = existing?.users?.find((u) => u.email === EMAIL);

  let userId;

  if (existingUser) {
    userId = existingUser.id;
    console.log(`User already exists: ${userId}`);
  } else {
    // 2. 유저 생성
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { username: USERNAME },
    });

    if (error) {
      console.error('Failed to create user:', error.message);
      process.exit(1);
    }

    userId = data.user.id;
    console.log(`Created user: ${userId}`);
  }

  // 3. 기존 portfolio_holdings (user_id = null) → 이 유저에게 할당
  const { error: phError, count: phCount } = await supabase
    .from('portfolio_holdings')
    .update({ user_id: userId })
    .is('user_id', null)
    .select('id', { count: 'exact' });

  if (phError) console.error('portfolio_holdings update error:', phError.message);
  else console.log(`Updated portfolio_holdings: ${phCount ?? 'unknown'} rows`);

  // 4. 기존 accounts (user_id = null) → 이 유저에게 할당
  const { error: acError, count: acCount } = await supabase
    .from('accounts')
    .update({ user_id: userId })
    .is('user_id', null)
    .select('id', { count: 'exact' });

  if (acError) console.error('accounts update error:', acError.message);
  else console.log(`Updated accounts: ${acCount ?? 'unknown'} rows`);

  console.log('\nDone! Login credentials:');
  console.log(`  ID: ${USERNAME}`);
  console.log(`  PW: ${PASSWORD}`);
}

main().catch(console.error);
