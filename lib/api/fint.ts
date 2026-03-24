import type { Browser } from 'puppeteer-core';

export interface FintStock {
  symbol: string;
  name: string;
  market: 'KR' | 'US';
  reason?: string;
}

export interface FintPortfolio {
  name: string;
  stocks: FintStock[];
  description?: string;
  category?: string;
}

async function createBrowser(): Promise<Browser> {
  // Vercel/AWS Lambda 환경
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = await import('@sparticuz/chromium');
    const puppeteerCore = await import('puppeteer-core');

    return puppeteerCore.default.launch({
      args: chromium.default.args,
      defaultViewport: chromium.default.defaultViewport,
      executablePath: await chromium.default.executablePath(),
      headless: chromium.default.headless,
    });
  }

  // 로컬 개발 환경
  const puppeteer = await import('puppeteer');
  return puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

/**
 * 네이버 금융 페이지에서 실제 종목 코드 파싱
 */
async function getActualStockCode(naverCode: string): Promise<string | null> {
  try {
    const res = await fetch(`https://finance.naver.com/item/main.naver?code=${naverCode}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;

    const html = await res.text();
    // code=XXXXXX 패턴에서 6자리 숫자 코드 추출
    const match = html.match(/code=(\d{6})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 네이버 증권 자동완성 API로 종목 코드 검색
 */
async function searchNaverStock(query: string): Promise<{ code: string; name: string } | null> {
  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const items = data?.items;

    if (!items || items.length === 0) return null;

    // 가장 유사한 종목 찾기 (이름이 정확히 일치하거나 포함되는 것)
    const exactMatch = items.find((item: { name: string }) =>
      item.name === query || item.name.replace(/\s/g, '') === query.replace(/\s/g, '')
    );

    const matched = exactMatch || items[0];
    let code = matched.code;

    // 코드가 6자리 숫자가 아니면 네이버 금융 페이지에서 실제 코드 파싱
    if (!/^\d{6}$/.test(code)) {
      const actualCode = await getActualStockCode(code);
      if (actualCode) {
        code = actualCode;
      }
    }

    return { code, name: matched.name };
  } catch {
    return null;
  }
}

/**
 * KRX(한국거래소) ETF 검색 API로 종목 코드 검색
 */
async function searchKrxEtf(query: string): Promise<{ code: string; name: string } | null> {
  try {
    // ETF 브랜드명(KODEX, TIGER 등)과 종목명 분리
    const brandMatch = query.match(/^(KODEX|TIGER|PLUS|KBSTAR|ARIRANG|HANARO|SOL|KOSEF|ACE)\s*(.+)/i);
    const searchTerm = brandMatch ? brandMatch[2].trim() : query;

    // 네이버 금융 ETF 검색 페이지에서 직접 검색
    const searchUrl = `https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0&targetColumn=market_sum&sortOrder=desc`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const items = data?.result?.etfItemList;

    if (!items || items.length === 0) return null;

    // 검색어와 가장 유사한 ETF 찾기
    const normalizedQuery = query.replace(/\s/g, '').toLowerCase();
    const found = items.find((item: { itemname: string; itemcode: string }) => {
      const normalizedName = item.itemname.replace(/\s/g, '').toLowerCase();
      return normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName);
    });

    if (found) {
      return { code: found.itemcode, name: found.itemname };
    }

    // 브랜드명 제외하고 핵심 키워드로 검색
    if (searchTerm) {
      const normalizedSearchTerm = searchTerm.replace(/\s/g, '').replace(/\(.*\)/g, '').toLowerCase();
      const partialMatch = items.find((item: { itemname: string; itemcode: string }) => {
        const normalizedName = item.itemname.replace(/\s/g, '').toLowerCase();
        return normalizedName.includes(normalizedSearchTerm);
      });

      if (partialMatch) {
        return { code: partialMatch.itemcode, name: partialMatch.itemname };
      }
    }

    return null;
  } catch (error) {
    console.warn(`[fint] KRX ETF search failed for: ${query}`, error);
    return null;
  }
}

/**
 * Google 검색을 통해 ETF 종목코드 찾기 (최후의 수단)
 */
async function searchGoogleForStockCode(query: string): Promise<{ code: string; name: string } | null> {
  try {
    // Google 검색 URL
    const searchQuery = `${query} ETF 종목코드 site:finance.naver.com OR site:etf.krx.co.kr`;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

    const res = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    // HTML에서 6자리 종목코드 패턴 찾기
    // 네이버 금융 URL 패턴: code=123456 또는 /item/main.naver?code=123456
    const codeMatches = html.match(/code[=\/](\d{6})/g);
    if (codeMatches && codeMatches.length > 0) {
      // 첫 번째 매칭된 코드 추출
      const codeMatch = codeMatches[0].match(/(\d{6})/);
      if (codeMatch) {
        return { code: codeMatch[1], name: query };
      }
    }

    return null;
  } catch (error) {
    console.warn(`[fint] Google search failed for: ${query}`, error);
    return null;
  }
}

/**
 * 한글 종목명 목록을 네이버에서 검색해서 티커로 변환
 * 네이버 검색 실패 시 KRX ETF 목록, Google 검색 순으로 fallback
 */
async function resolveKoreanStockCodes(stocks: FintStock[]): Promise<FintStock[]> {
  const results: FintStock[] = [];

  for (const stock of stocks) {
    // 이미 숫자 코드인 경우 (한국 주식)
    if (/^\d{6}$/.test(stock.symbol)) {
      results.push(stock);
      continue;
    }

    // 영문 티커인 경우 (미국 주식/ETF)
    if (/^[A-Z]{2,5}$/.test(stock.symbol)) {
      results.push(stock);
      continue;
    }

    // 1차: 네이버 증권 자동완성 검색
    let searchResult = await searchNaverStock(stock.symbol);

    // 2차: KRX ETF 목록에서 검색
    if (!searchResult || !/^\d{6}$/.test(searchResult.code)) {
      console.log(`[fint] Naver search failed for ${stock.symbol}, trying KRX ETF list...`);
      const krxResult = await searchKrxEtf(stock.symbol);
      if (krxResult && /^\d{6}$/.test(krxResult.code)) {
        searchResult = krxResult;
      }
    }

    // 3차: Google 검색으로 종목코드 찾기
    if (!searchResult || !/^\d{6}$/.test(searchResult.code)) {
      console.log(`[fint] KRX search failed for ${stock.symbol}, trying Google search...`);
      const googleResult = await searchGoogleForStockCode(stock.symbol);
      if (googleResult && /^\d{6}$/.test(googleResult.code)) {
        searchResult = googleResult;
      }
    }

    if (searchResult && /^\d{6}$/.test(searchResult.code)) {
      results.push({
        symbol: searchResult.code,
        name: searchResult.name,
        market: stock.market,
      });
    } else {
      // 모든 검색 실패시 원래 데이터 유지
      console.warn(`[fint] All searches failed for: ${stock.symbol}`);
      results.push(stock);
    }
  }

  return results;
}

type StrategyType = 'stock-kr' | 'stock-us' | 'etf-kr' | 'etf-us';

interface StrategyPage {
  url: string;
  name: string;
  market: 'KR' | 'US';
  description: string;
  category: string;
  type: StrategyType;
}

// 모든 전략 페이지 목록
const STRATEGY_PAGES: StrategyPage[] = [
  // 주식투자
  {
    url: 'https://partners.fint.co.kr/fint/guide/kor-strategy/',
    name: '한국주식',
    market: 'KR',
    description: 'AI가 발굴한 한국주식 알짜 종목',
    category: '주식투자',
    type: 'stock-kr',
  },
  {
    url: 'https://partners.fint.co.kr/fint/guide/usa-strategy/',
    name: '미국주식',
    market: 'US',
    description: 'AI가 발굴한 미국주식 알짜 종목',
    category: '주식투자',
    type: 'stock-us',
  },
  {
    url: 'https://partners.fint.co.kr/fint/guide/usa-dividend-strategy/',
    name: '미국배당주식',
    market: 'US',
    description: 'AI가 발굴한 고배당 미국주식 알짜 종목',
    category: '주식투자',
    type: 'stock-us',
  },
  {
    url: 'https://partners.fint.co.kr/fint/guide/us-next-paradigm/',
    name: '미국 넥스트 패러다임',
    market: 'US',
    description: '차세대 기술혁신을 이끌 미국주식에 투자',
    category: '주식투자',
    type: 'stock-us',
  },
  {
    url: 'https://partners.fint.co.kr/fint/guide/us-esg-strategy/',
    name: '미국 거버넌스',
    market: 'US',
    description: 'ESG 실천 기업 중심 미국주식 투자',
    category: '주식투자',
    type: 'stock-us',
  },
  {
    url: 'https://partners.fint.co.kr/fint/guide/kor-dividend-plus/',
    name: '한국주식 배당플러스',
    market: 'KR',
    description: 'AI가 발굴한 한국 우량 배당 종목',
    category: '주식투자',
    type: 'stock-kr',
  },
  // ETF투자
  {
    url: 'https://partners.fint.co.kr/fint/guide/etf-strategy/?currency=krw&is_pension=false',
    name: '원화ETF',
    market: 'KR',
    description: '리스크를 고려해 유망 자산 분산 투자',
    category: 'ETF투자',
    type: 'etf-kr',
  },
  {
    url: 'https://partners.fint.co.kr/fint/guide/etf-strategy/?currency=usd&is_pension=false',
    name: '달러ETF',
    market: 'US',
    description: '리스크를 고려해 유망 자산 분산 투자',
    category: 'ETF투자',
    type: 'etf-us',
  },
  // 연금저축
  {
    url: 'https://partners.fint.co.kr/fint/guide/etf-strategy/?currency=krw&is_pension=true',
    name: '연금저축 원화ETF',
    market: 'KR',
    description: '리스크를 고려해 유망 자산 분산 투자',
    category: '연금저축',
    type: 'etf-kr',
  },
];

function extractStocks(text: string, type: StrategyType, market: 'KR' | 'US'): FintStock[] {
  const results: FintStock[] = [];

  // 아이작이 담은 종목 또는 아이작 추천 종목 섹션 찾기
  let stockSection = text.split('아이작이 담은 종목')[1] ||
                     text.split('아이작이 담은')[1] ||
                     text.split('아이작 추천 종목')[1] ||
                     text.split('글로벌 자산배분')[1]; // 펀드용

  if (!stockSection) return results;

  // 관련 없는 부분 제거
  stockSection = stockSection.split('*오늘 투자하면')[0] ||
                 stockSection.split('오늘 투자하면')[0] ||
                 stockSection.split('고수익을 위해')[0] ||
                 stockSection.split('전 세계')[0] ||
                 stockSection.split('글로벌')[0] ||
                 stockSection.slice(0, 1500);

  const lines = stockSection.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  switch (type) {
    case 'stock-kr':
      // 한국주식: 종목명 + 6자리 숫자 코드
      for (let i = 0; i < lines.length - 1; i++) {
        const name = lines[i];
        const code = lines[i + 1];
        if (/^\d{6}$/.test(code) && name.length > 1) {
          if (!results.find(r => r.symbol === code)) {
            results.push({ symbol: code, name, market: 'KR' });
          }
        }
      }
      break;

    case 'stock-us':
      // 미국주식: 종목명 + 영문 티커
      for (let i = 0; i < lines.length - 1; i++) {
        const name = lines[i];
        const ticker = lines[i + 1];
        if (/^[A-Z]{2,5}$/.test(ticker) && name.length > 1 && !/^[A-Z]{2,5}$/.test(name)) {
          if (!results.find(r => r.symbol === ticker)) {
            results.push({ symbol: ticker, name, market: 'US' });
          }
        }
      }
      break;

    case 'etf-kr':
      // 한국 ETF: KODEX, TIGER, PLUS, KBSTAR 등으로 시작하는 라인 (한글 이름으로 저장, 나중에 검색)
      const krEtfPrefixes = ['KODEX', 'TIGER', 'PLUS', 'KBSTAR', 'ARIRANG', 'HANARO', 'SOL', 'KOSEF', 'ACE'];
      for (const line of lines) {
        if (krEtfPrefixes.some(prefix => line.startsWith(prefix))) {
          if (!results.find(r => r.name === line)) {
            results.push({ symbol: line, name: line, market: 'KR' });
          }
        }
      }
      break;

    case 'etf-us':
      // 미국 ETF: 티커(설명) 형식 또는 영문 티커만
      for (const line of lines) {
        const tickerMatch = line.match(/^([A-Z]{2,5})(?:\s*\(|$)/);
        if (tickerMatch) {
          const ticker = tickerMatch[1];
          if (!results.find(r => r.symbol === ticker)) {
            results.push({ symbol: ticker, name: line, market: 'US' });
          }
        }
      }
      break;
  }

  return results;
}

async function scrapeStrategyPage(
  browser: Browser,
  strategy: StrategyPage
): Promise<FintPortfolio | null> {
  const page = await browser.newPage();

  try {
    await page.goto(strategy.url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // 페이지 로딩 대기
    await new Promise(r => setTimeout(r, 2000));

    // 페이지 텍스트 추출
    const bodyText = await page.evaluate(() => document.body.innerText || '');

    // 종목 추출
    let stocks = extractStocks(bodyText, strategy.type, strategy.market);

    // 한글 종목명을 네이버에서 검색해서 티커로 변환 (etf-kr 타입만)
    if (strategy.type === 'etf-kr') {
      stocks = await resolveKoreanStockCodes(stocks);
    }

    if (stocks.length === 0) return null;

    return {
      name: strategy.name,
      stocks,
      description: strategy.description,
      category: strategy.category,
    };
  } catch (error) {
    console.error(`[fint] Error scraping ${strategy.name}:`, error);
    return null;
  } finally {
    await page.close();
  }
}

export async function scrapeFintAI(): Promise<FintPortfolio[]> {
  const browser = await createBrowser();
  const portfolios: FintPortfolio[] = [];

  try {
    for (const strategy of STRATEGY_PAGES) {
      try {
        const portfolio = await scrapeStrategyPage(browser, strategy);
        if (portfolio && portfolio.stocks.length > 0) {
          portfolios.push(portfolio);
        }
      } catch (error) {
        console.error(`[fint] Failed to scrape ${strategy.name}:`, error);
      }
    }
  } finally {
    await browser.close();
  }

  return portfolios;
}

/**
 * 다음 달 1일 자정까지의 밀리초를 반환
 */
export function getMillisecondsUntilNextMonth(): number {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return nextMonth.getTime() - now.getTime();
}
