import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const name = process.argv[2];

if (!name) {
  console.error('Usage: node scripts/debug-chart-pattern.mjs <stock-name>');
  process.exit(1);
}

const { data, error } = await supabase
  .from('stocks')
  .select('symbol,name,market,current_price')
  .ilike('name', `%${name}%`)
  .limit(10);

if (error) {
  console.error(error);
  process.exit(1);
}

console.log(JSON.stringify(data ?? [], null, 2));
