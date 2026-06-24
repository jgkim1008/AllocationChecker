// 네이버 증권 ETF 데이터 fetch 유틸 (ETF 매수 분석기 전용)

const NAVER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15';
const PC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

export interface NaverEtfItem {
  code: string;             // 6자리 종목코드 (예: '069500')
  name: string;             // ETF명 (예: 'KODEX 200')
  price: number;            // 현재가
  changeRate: number;       // 등락률 (%)
  nav: number;              // NAV
  threeMonthEarnRate: number;
  volume: number;           // 거래량 (quant)
  tradingValue: number;     // 거래대금 (백만원)
  marketCap: number;        // 시총 (억원)
}

/**
 * 네이버 증권 ETF 전체 목록 — 거래량(quant) 내림차순으로 상위 N개 반환
 * 출처: https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0
 */
export async function fetchNaverEtfTopByVolume(limit = 50): Promise<NaverEtfItem[]> {
  const url = 'https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0';
  const res = await fetch(url, {
    headers: { 'User-Agent': PC_UA, 'Referer': 'https://finance.naver.com/' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Naver ETF list fetch failed: ${res.status}`);

  // 응답이 EUC-KR로 옴 (Content-Type: text/plain;charset=EUC-KR)
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('euc-kr').decode(buf);
  let json: { result?: { etfItemList?: RawEtfItem[] } };
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }

  interface RawEtfItem {
    itemcode: string;
    itemname: string;
    nowVal: number;
    changeRate: number;
    nav: number;
    threeMonthEarnRate: number;
    quant: number;
    amonut: number;       // sic — naver typo
    marketSum: number;
  }

  const items = (json?.result?.etfItemList ?? []) as RawEtfItem[];

  const decoded: NaverEtfItem[] = items.map((it) => ({
    code: it.itemcode,
    name: it.itemname,
    price: it.nowVal,
    changeRate: it.changeRate,
    nav: it.nav,
    threeMonthEarnRate: it.threeMonthEarnRate,
    volume: it.quant,
    tradingValue: it.amonut,
    marketCap: it.marketSum,
  }));

  return decoded
    .filter(e => e.price > 0 && e.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit);
}

/**
 * 네이버 ETF 전체 — 거래량 상위 + 테마(섹터) ETF 합쳐 반환.
 * 거래량 상위 N개 + 테마별 거래량 상위 M개를 합쳐 중복 제거.
 *
 * 테마 카테고리(이름 키워드 매칭):
 *   양자컴퓨팅, 방산, 조선, 2차전지, 반도체, 헬스케어/바이오,
 *   우주항공, AI, 친환경/2차전지, 게임, 메타버스, 로봇
 */
export interface NaverEtfItemWithTheme extends NaverEtfItem {
  theme: string | null;
}

const THEMES: { name: string; pattern: RegExp }[] = [
  { name: '양자컴퓨팅', pattern: /양자|퀀텀|Quantum/i },
  { name: '방산',       pattern: /방산|K-방산|디펜스|Defense/i },
  { name: '조선',       pattern: /조선|Shipbuild/i },
  { name: '우주항공',   pattern: /우주|항공|에어로|스페이스|space/i },
  { name: '반도체',     pattern: /반도체|Semi|SOX|메모리/i },
  { name: '2차전지',    pattern: /2차전지|이차전지|배터리|Battery/i },
  { name: '바이오',     pattern: /바이오|헬스케어|제약|BIO|Health/i },
  { name: 'AI',         pattern: /\bAI\b|인공지능|Artificial/i },
  { name: '로봇',       pattern: /로봇|Robot/i },
  { name: '게임',       pattern: /게임|Game/i },
  { name: '메타버스',   pattern: /메타버스|Metaverse/i },
  { name: '친환경',     pattern: /친환경|ESG|클린|Clean|그린에너지/i },
];

function matchTheme(name: string): string | null {
  for (const t of THEMES) {
    if (t.pattern.test(name)) return t.name;
  }
  return null;
}

export async function fetchNaverEtfScanList(opts: {
  topByVolume?: number;
  perThemeLimit?: number;
} = {}): Promise<NaverEtfItemWithTheme[]> {
  const topN = opts.topByVolume ?? 50;
  const perTheme = opts.perThemeLimit ?? 3;

  // 전체 ETF 한 번만 fetch
  const url = 'https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0';
  const res = await fetch(url, {
    headers: { 'User-Agent': PC_UA, 'Referer': 'https://finance.naver.com/' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Naver ETF list fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('euc-kr').decode(buf);

  interface RawEtfItem {
    itemcode: string; itemname: string; nowVal: number; changeRate: number;
    nav: number; threeMonthEarnRate: number; quant: number; amonut: number; marketSum: number;
  }
  const json: { result?: { etfItemList?: RawEtfItem[] } } = JSON.parse(text);
  const items = (json?.result?.etfItemList ?? [])
    .filter(it => it.nowVal > 0 && it.quant > 0);

  const toItem = (it: RawEtfItem): NaverEtfItemWithTheme => ({
    code: it.itemcode,
    name: it.itemname,
    price: it.nowVal,
    changeRate: it.changeRate,
    nav: it.nav,
    threeMonthEarnRate: it.threeMonthEarnRate,
    volume: it.quant,
    tradingValue: it.amonut,
    marketCap: it.marketSum,
    theme: matchTheme(it.itemname),
  });

  // 1) 거래량 상위
  const byVolume = [...items].sort((a, b) => b.quant - a.quant).slice(0, topN);

  // 2) 테마별 거래량 상위 N개
  const themeBuckets = new Map<string, RawEtfItem[]>();
  for (const it of items) {
    const theme = matchTheme(it.itemname);
    if (!theme) continue;
    if (!themeBuckets.has(theme)) themeBuckets.set(theme, []);
    themeBuckets.get(theme)!.push(it);
  }

  const themeSelected: RawEtfItem[] = [];
  for (const list of themeBuckets.values()) {
    list.sort((a, b) => b.quant - a.quant);
    themeSelected.push(...list.slice(0, perTheme));
  }

  // 3) 합치고 중복 제거 (code 기준)
  const seen = new Set<string>();
  const merged: NaverEtfItemWithTheme[] = [];
  for (const it of [...byVolume, ...themeSelected]) {
    if (seen.has(it.itemcode)) continue;
    seen.add(it.itemcode);
    merged.push(toItem(it));
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────
// ETF 구성종목 (Holdings)
// ─────────────────────────────────────────────────────────────

export interface EtfHolding {
  code: string;        // 종목코드 (예: '005930')
  name: string;        // 종목명
  shares: number;      // 주식수
  weight: number;      // 구성비중 (%)
  price: number;       // 현재 시세
  changeRate: number;  // 등락률 (%)
}

/**
 * ETF 구성종목 + 비중 — finance.naver.com/item/main.naver HTML 파싱
 * 상위 ~10-15개 종목만 노출됨 (네이버 페이지 구조 한계)
 */
export async function fetchNaverEtfHoldings(code: string): Promise<EtfHolding[]> {
  const clean = code.replace(/\.(KS|KQ)$/i, '');
  const url = `https://finance.naver.com/item/main.naver?code=${clean}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': PC_UA, 'Referer': 'https://finance.naver.com/' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];

  const html = await res.text();

  // etf_asset 섹션만 추출
  const sectionMatch = html.match(/<div[^>]*class="section etf_asset"[\s\S]*?<\/div>\s*<\/div>/);
  if (!sectionMatch) return [];
  const section = sectionMatch[0];

  // 각 <tr> 단위로 종목명 + 주식수 + 비중 + 시세 + 등락률 추출
  // 행 구조: <td class="ctg"><a href="/item/main.naver?code=XXX">NAME</a></td>
  //         <td>SHARES</td><td class="per">PCT%</td><td>PRICE</td><td>전일비</td><td>RATE%</td>
  const rowRegex = /<a href="\/item\/main\.naver\?code=(\d{6})">([^<]+)<\/a>[\s\S]*?<td>\s*([\d,]+)\s*<\/td>\s*<td class="per">\s*([\d.]+)%\s*<\/td>\s*<td>([\d,]+)<\/td>[\s\S]*?<em class="f_(up|down|na)[^>]*>(?:<span[^>]*>[^<]*<\/span>)?\s*([+-]?[\d.]+)%/g;

  const holdings: EtfHolding[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(section)) !== null) {
    const [, hCode, name, sharesStr, weightStr, priceStr, , rateStr] = m;
    // HTML이 이미 +/- 부호를 포함하므로 그대로 사용
    const rate = parseFloat(rateStr) || 0;
    holdings.push({
      code: hCode,
      name: name.trim(),
      shares: parseInt(sharesStr.replace(/,/g, ''), 10) || 0,
      weight: parseFloat(weightStr) || 0,
      price: parseInt(priceStr.replace(/,/g, ''), 10) || 0,
      changeRate: rate,
    });
  }

  return holdings;
}

// ─────────────────────────────────────────────────────────────
// ETF 보강 메타 (NAV, 운용사, 기초지수, 펀드보수)
// ─────────────────────────────────────────────────────────────

export interface NaverEtfMeta {
  code: string;
  name: string;
  price: number;
  nav: number | null;
  baseIndex: string | null;       // 기초지수 (예: '코스피 200')
  issuer: string | null;          // 운용사
  totalFee: number | null;        // 펀드보수 (%)
  marketValue: string | null;     // 시총 (문자열, 한글 단위)
  dividendYield: number | null;
}

export async function fetchNaverEtfMeta(code: string): Promise<NaverEtfMeta | null> {
  const clean = code.replace(/\.(KS|KQ)$/i, '');
  const url = `https://m.stock.naver.com/api/stock/${clean}/integration`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': NAVER_UA },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    interface Info { code: string; value: string }
    interface ApiResp {
      stockName?: string;
      totalInfos?: Info[];
      etfKeyIndicator?: {
        issuerName?: string;
        marketValue?: string;
        dividendYieldTtm?: number;
        nav?: string | number;
        totalFee?: number;
      };
    }
    const data: ApiResp = await res.json();
    const infos = data?.totalInfos ?? [];
    const get = (key: string) => infos.find(i => i.code === key)?.value;

    const priceStr = get('lastClosePrice') ?? get('nowVal') ?? '0';
    return {
      code: clean,
      name: data?.stockName ?? clean,
      price: parseFloat(priceStr.replace(/,/g, '')) || 0,
      nav: parseFloat(String(get('nav') ?? data?.etfKeyIndicator?.nav ?? '').replace(/,/g, '')) || null,
      baseIndex: get('etfBaseIdx') ?? null,
      issuer: get('issueName') ?? data?.etfKeyIndicator?.issuerName ?? null,
      totalFee: data?.etfKeyIndicator?.totalFee ?? null,
      marketValue: data?.etfKeyIndicator?.marketValue ?? null,
      dividendYield: data?.etfKeyIndicator?.dividendYieldTtm ?? null,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 벤치마크 자동 매핑 (ETF 이름 휴리스틱)
// ─────────────────────────────────────────────────────────────

export interface BenchmarkRef {
  symbol: string;          // Yahoo ticker (예: '^GSPC')
  name: string;            // 표시명
  market: 'US' | 'KR';
}

export function pickBenchmarkForEtf(etfName: string, baseIndex?: string | null): BenchmarkRef {
  const text = `${etfName} ${baseIndex ?? ''}`.toUpperCase();

  if (/NASDAQ|나스닥|NDX/i.test(text)) {
    return { symbol: '^IXIC', name: 'NASDAQ', market: 'US' };
  }
  if (/S&P\s*500|SP500|에스앤피|S&P500|미국|US/i.test(text)) {
    return { symbol: '^GSPC', name: 'S&P 500', market: 'US' };
  }
  if (/반도체|SEMI|SOX|필라델피아/i.test(text)) {
    return { symbol: 'SOXL', name: 'SOXL', market: 'US' };
  }
  if (/KOSDAQ|코스닥/i.test(text)) {
    return { symbol: '^KQ11', name: 'KOSDAQ', market: 'KR' };
  }
  return { symbol: '^KS11', name: 'KOSPI', market: 'KR' };
}
