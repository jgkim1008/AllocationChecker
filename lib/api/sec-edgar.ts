const EDGAR_BASE = 'https://data.sec.gov';
const ARCHIVE_BASE = 'https://www.sec.gov/Archives/edgar/data';
const SEC_HEADERS = {
  'User-Agent': 'AllocationChecker/1.0 contact@allocationchecker.local',
};

export interface Holding {
  nameOfIssuer: string;
  cusip: string;
  value: number;   // 달러 단위 (13F XML value 필드 그대로)
  shares: number;
  type: string;    // SH | PRN
}

/** CIK를 10자리 제로 패딩으로 변환 */
function padCik(cik: string): string {
  return cik.replace(/^0+/, '').padStart(10, '0');
}

/** accessionNumber 대시 제거 (폴더명용) */
function stripDashes(accession: string): string {
  return accession.replace(/-/g, '');
}

/** 최신 13F-HR 파일링의 accessionNumber와 filingDate 반환 */
export async function getLatest13FFiling(
  cik: string
): Promise<{ accession: string; date: string } | null> {
  const paddedCik = padCik(cik);
  const url = `${EDGAR_BASE}/submissions/CIK${paddedCik}.json`;

  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: SEC_HEADERS,
  });
  if (!res.ok) return null;

  const data = await res.json();
  const forms: string[] = data?.filings?.recent?.form ?? [];
  const accessions: string[] = data?.filings?.recent?.accessionNumber ?? [];
  const dates: string[] = data?.filings?.recent?.filingDate ?? [];

  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === '13F-HR') {
      return { accession: accessions[i], date: dates[i] };
    }
  }
  return null;
}

/**
 * infotable XML 텍스트를 파싱하여 보유 종목 배열 반환.
 * 네임스페이스 prefix (e.g. ns1:) 유무 모두 처리.
 */
function parseInfoTable(xml: string): Holding[] {
  const holdings: Holding[] = [];

  // <infoTable> 또는 <ns1:infoTable> 등 임의 prefix 허용
  const blockRegex = /<[\w]*:?infoTable>([\s\S]*?)<\/[\w]*:?infoTable>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(xml)) !== null) {
    const block = match[1];

    const nameMatch = block.match(/<[\w]*:?nameOfIssuer>(.*?)<\/[\w]*:?nameOfIssuer>/i);
    const cusipMatch = block.match(/<[\w]*:?cusip>(.*?)<\/[\w]*:?cusip>/i);
    const valueMatch = block.match(/<[\w]*:?value>(.*?)<\/[\w]*:?value>/i);
    const sharesMatch = block.match(/<[\w]*:?sshPrnamt>(.*?)<\/[\w]*:?sshPrnamt>/i);
    const typeMatch = block.match(/<[\w]*:?sshPrnamtType>(.*?)<\/[\w]*:?sshPrnamtType>/i);

    if (!nameMatch || !cusipMatch || !valueMatch || !sharesMatch) continue;

    holdings.push({
      nameOfIssuer: nameMatch[1].trim(),
      cusip: cusipMatch[1].trim(),
      value: parseInt(valueMatch[1].trim(), 10) || 0,  // 달러 단위
      shares: parseInt(sharesMatch[1].trim(), 10) || 0,
      type: typeMatch ? typeMatch[1].trim() : 'SH',
    });
  }

  return holdings;
}

/**
 * 파일링 디렉토리 HTML에서 infotable XML 파일명을 찾는다.
 * EDGAR 디렉토리에는 절대 경로 href가 포함됨.
 * primary_doc.xml 제외, 나머지 .xml 파일 중 첫 번째 반환.
 */
async function findInfotableFilename(cik: string, accNoDashes: string): Promise<string | null> {
  const rawCik = cik.replace(/^0+/, '');
  const dirUrl = `${ARCHIVE_BASE}/${rawCik}/${accNoDashes}/`;

  const res = await fetch(dirUrl, {
    next: { revalidate: 3600 },
    headers: SEC_HEADERS,
  });
  if (!res.ok) return null;

  const html = await res.text();

  // EDGAR 디렉토리는 절대 경로 href 사용: /Archives/edgar/data/{cik}/{acc}/filename.xml
  const pattern = new RegExp(
    `/Archives/edgar/data/${rawCik}/${accNoDashes}/([^"<>\\s]+\\.xml)`,
    'gi'
  );

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const filename = m[1];
    if (filename.toLowerCase() !== 'primary_doc.xml') {
      return filename;
    }
  }
  return null;
}

/** 13F-HR의 infotable XML을 가져와 보유 종목 배열 반환 */
export async function get13FHoldings(cik: string, accession: string): Promise<Holding[]> {
  const rawCik = cik.replace(/^0+/, '');
  const accNoDashes = stripDashes(accession);

  // 1. 디렉토리 HTML 파싱으로 infotable 파일명 확인
  const discovered = await findInfotableFilename(cik, accNoDashes);

  // 2. 발견된 파일명 우선, 없으면 흔한 이름들로 시도
  const candidates = discovered
    ? [discovered]
    : ['infotable.xml', 'form13fInfoTable.xml'];

  for (const filename of candidates) {
    const xmlUrl = `${ARCHIVE_BASE}/${rawCik}/${accNoDashes}/${filename}`;
    const xmlRes = await fetch(xmlUrl, {
      next: { revalidate: 3600 },
      headers: SEC_HEADERS,
    });
    if (!xmlRes.ok) continue;

    const xmlText = await xmlRes.text();
    const holdings = parseInfoTable(xmlText);
    if (holdings.length > 0) return holdings;
  }

  return [];
}
