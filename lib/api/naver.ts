// 네이버 금융 API 유틸리티

/**
 * 네이버 금융에서 한국 주식의 종목명을 가져옵니다.
 */
export async function getNaverStockName(symbol: string): Promise<string | null> {
  const clean = symbol.replace(/\.[A-Z]+$/, '');
  try {
    const res = await fetch(
      `https://finance.naver.com/item/main.naver?code=${clean}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://finance.naver.com/',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        next: { revalidate: 86400 }, // 24시간 캐시
      }
    );
    if (!res.ok) return null;

    const html = await res.text();

    // 종목명 파싱: <div class="wrap_company"> 내부의 <h2><a>종목명</a></h2>
    const nameMatch = html.match(/<div[^>]*class="wrap_company"[^>]*>[\s\S]*?<h2[^>]*><a[^>]*>([^<]+)<\/a>/);
    if (nameMatch) {
      return nameMatch[1].trim();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 여러 한국 주식의 종목명을 일괄 조회합니다.
 * 동시 요청 수를 제한하여 서버 부하를 방지합니다.
 */
export async function getNaverStockNames(
  symbols: string[],
  concurrency = 5
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const names = await Promise.all(
      batch.map(async (symbol) => {
        const name = await getNaverStockName(symbol);
        return { symbol, name };
      })
    );

    for (const { symbol, name } of names) {
      if (name) {
        results.set(symbol, name);
      }
    }
  }

  return results;
}
