import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const KR_NAMES = {
  '005930': '삼성전자',
  '000660': 'SK하이닉스',
  '373220': 'LG에너지솔루션',
  '207940': '삼성바이오로직스',
  '005380': '현대차',
  '006400': '삼성SDI',
  '051910': 'LG화학',
  '035420': 'NAVER',
  '000270': '기아',
  '068270': '셀트리온',
  '105560': 'KB금융',
  '055550': '신한지주',
  '035720': '카카오',
  '012330': '현대모비스',
  '003670': '포스코홀딩스',
  '028260': '삼성물산',
  '066570': 'LG전자',
  '096770': 'SK이노베이션',
  '086790': '하나금융지주',
  '003550': 'LG',
  '034730': 'SK',
  '015760': '한국전력',
  '010130': '고려아연',
  '032830': '삼성생명',
  '033780': 'KT&G',
  '316140': '우리금융지주',
  '009150': '삼성전기',
  '017670': 'SK텔레콤',
  '018260': '삼성에스디에스',
  '030200': 'KT',
  '^KS11': '코스피 (KOSPI)',
  '^KQ11': '코스닥 (KOSDAQ)'
};

async function updateNames() {
  console.log('🏷 Updating KR stock names...');
  for (const [symbol, name] of Object.entries(KR_NAMES)) {
    const { error } = await supabase
      .from('stocks')
      .update({ name })
      .eq('symbol', symbol);
    
    if (!error) console.log(`✅ Updated: ${symbol} -> ${name}`);
  }
  console.log('🏁 Name update finished!');
}
updateNames();
