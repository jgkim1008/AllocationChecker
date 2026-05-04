/**
 * 한국투자증권 시세 조회 모듈
 */

import { KIS_ENDPOINTS, KIS_TR_ID, KIS_EXCHANGE_CODE } from './constants';
import { KISAuth } from './auth';
import type { Quote, BrokerResponse, MarketType } from '../types';

interface KISDomesticQuoteResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output: {
    stck_prpr: string;      // 현재가
    prdy_vrss: string;      // 전일대비
    prdy_ctrt: string;      // 전일대비율
    stck_oprc: string;      // 시가
    stck_hgpr: string;      // 고가
    stck_lwpr: string;      // 저가
    acml_vol: string;       // 누적거래량
    stck_prdy_clpr: string; // 전일종가
    hts_kor_isnm: string;   // 종목명
  };
}

interface KISOverseasQuoteResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output: {
    last: string;           // 현재가
    diff: string;           // 전일대비
    rate: string;           // 전일대비율
    open: string;           // 시가
    high: string;           // 고가
    low: string;            // 저가
    tvol: string;           // 거래량
    base: string;           // 전일종가
    name: string;           // 종목명
  };
}

interface KISDomesticDailyPriceResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output2: {
    stck_bsop_date: string;  // 영업일 (YYYYMMDD)
    stck_clpr: string;       // 종가
    stck_hgpr: string;       // 고가
    stck_lwpr: string;       // 저가
  }[];
}

interface KISOverseasDailyPriceResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output2: {
    xymd: string;   // 날짜 (YYYYMMDD)
    clos: string;   // 종가
    high: string;   // 고가
    low: string;    // 저가
  }[];
}

/**
 * KIS 시세 조회
 */
export class KISQuote {
  private auth: KISAuth;

  constructor(auth: KISAuth) {
    this.auth = auth;
  }

  /**
   * 국내주식 현재가 조회
   */
  async getDomesticQuote(symbol: string): Promise<BrokerResponse<Quote>> {
    const trId = KIS_TR_ID.DOMESTIC.PRICE;

    try {
      const url = new URL(`${this.auth.getBaseUrl()}${KIS_ENDPOINTS.DOMESTIC.PRICE}`);
      url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J'); // 주식
      url.searchParams.set('FID_INPUT_ISCD', symbol);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          ...this.auth.getAuthHeaders(),
          tr_id: trId,
        },
      });

      const data: KISDomesticQuoteResponse = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: {
            code: data.msg_cd,
            message: data.msg1,
          },
        };
      }

      const output = data.output;

      const quote: Quote = {
        symbol,
        symbolName: output.hts_kor_isnm,
        currentPrice: parseFloat(output.stck_prpr),
        change: parseFloat(output.prdy_vrss),
        changeRate: parseFloat(output.prdy_ctrt),
        open: parseFloat(output.stck_oprc),
        high: parseFloat(output.stck_hgpr),
        low: parseFloat(output.stck_lwpr),
        volume: parseFloat(output.acml_vol),
        prevClose: parseFloat(output.stck_prdy_clpr),
        currency: 'KRW',
        market: 'domestic' as MarketType,
        updatedAt: new Date(),
      };

      return {
        success: true,
        data: quote,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'QUOTE_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 해외주식 현재가 조회 (거래소 코드 직접 지정)
   */
  async getOverseasQuoteByCode(
    symbol: string,
    excd: string
  ): Promise<BrokerResponse<Quote>> {
    const trId = KIS_TR_ID.OVERSEAS.PRICE;

    try {
      const url = new URL(`${this.auth.getBaseUrl()}${KIS_ENDPOINTS.OVERSEAS.PRICE}`);
      url.searchParams.set('AUTH', '');
      url.searchParams.set('EXCD', excd);
      url.searchParams.set('SYMB', symbol);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          ...this.auth.getAuthHeaders(),
          tr_id: trId,
        },
      });

      const data: KISOverseasQuoteResponse = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: {
            code: data.msg_cd,
            message: data.msg1,
          },
        };
      }

      const output = data.output;

      const quote: Quote = {
        symbol,
        symbolName: output.name,
        currentPrice: parseFloat(output.last),
        change: parseFloat(output.diff),
        changeRate: parseFloat(output.rate),
        open: parseFloat(output.open),
        high: parseFloat(output.high),
        low: parseFloat(output.low),
        volume: parseFloat(output.tvol),
        prevClose: parseFloat(output.base),
        currency: 'USD',
        market: 'overseas' as MarketType,
        updatedAt: new Date(),
      };

      return {
        success: true,
        data: quote,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'QUOTE_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 해외주식 거래소 코드 감지 (주문용: NASDAQ/NYSE/AMEX)
   * 시세 API는 NAS/NYS/AMS, 주문 API는 NASD/NYSE/AMEX 사용
   */
  async getExchangeForSymbol(symbol: string): Promise<keyof typeof KIS_EXCHANGE_CODE> {
    const priceToOrderExchange: Record<string, keyof typeof KIS_EXCHANGE_CODE> = {
      NAS: 'NASDAQ',
      NYS: 'NYSE',
      AMS: 'AMEX',
    };
    for (const excd of ['NAS', 'NYS', 'AMS']) {
      const result = await this.getOverseasQuoteByCode(symbol, excd);
      // rt_cd:'0'이어도 가격이 0이면 해당 거래소에 없는 종목으로 판단
      if (result.success && result.data && result.data.currentPrice > 0) {
        return priceToOrderExchange[excd];
      }
    }
    return 'NASDAQ'; // fallback
  }

  /**
   * 국내주식 일봉 종가 이력 조회 (원주가 기준, 최신순)
   * @param count 필요한 캔들 수 (최대 300)
   */
  async getDomesticDailyPriceHistory(
    symbol: string,
    count: number = 240,
  ): Promise<{ date: string; price: number; high: number; low: number }[]> {
    const results: { date: string; price: number; high: number; low: number }[] = [];
    const trId = KIS_TR_ID.DOMESTIC.DAILY_PRICE;

    // 100개씩 최대 6회 호출 (주봉 일목 78개 = 일봉 ~550개 필요)
    const maxBatches = Math.ceil(Math.min(count, 600) / 100);
    let endDate = new Date();

    for (let i = 0; i < maxBatches && results.length < count; i++) {
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 140); // ~100 영업일 = ~140 역일

      const fmt = (d: Date) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

      const url = new URL(`${this.auth.getBaseUrl()}${KIS_ENDPOINTS.DOMESTIC.DAILY_PRICE}`);
      url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
      url.searchParams.set('FID_INPUT_ISCD', symbol);
      url.searchParams.set('FID_INPUT_DATE_1', fmt(startDate));
      url.searchParams.set('FID_INPUT_DATE_2', fmt(endDate));
      url.searchParams.set('FID_PERIOD_DIV_CODE', 'D');
      url.searchParams.set('FID_ORG_ADJ_PRC', '1'); // 원주가

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { ...this.auth.getAuthHeaders(), tr_id: trId },
      });

      const data: KISDomesticDailyPriceResponse = await response.json();
      if (data.rt_cd !== '0' || !data.output2?.length) break;

      for (const row of data.output2) {
        if (row.stck_bsop_date && row.stck_clpr) {
          results.push({
            date: row.stck_bsop_date,
            price: parseFloat(row.stck_clpr),
            high: parseFloat(row.stck_hgpr ?? row.stck_clpr),
            low: parseFloat(row.stck_lwpr ?? row.stck_clpr),
          });
        }
      }

      // 다음 배치는 현재 배치의 마지막 날짜 -1일부터
      const lastDate = data.output2[data.output2.length - 1].stck_bsop_date;
      endDate = new Date(
        parseInt(lastDate.slice(0, 4)),
        parseInt(lastDate.slice(4, 6)) - 1,
        parseInt(lastDate.slice(6, 8)) - 1,
      );
    }

    // 최신순 정렬 후 count만큼 반환
    return results
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, count);
  }

  /**
   * 해외주식 일봉 종가 이력 조회 (원주가 기준, 최신순)
   * @param excd 거래소 코드 (NAS / NYS / AMS)
   * @param count 필요한 캔들 수 (최대 300)
   */
  async getOverseasDailyPriceHistory(
    symbol: string,
    excd: string,
    count: number = 240,
  ): Promise<{ date: string; price: number; high: number; low: number }[]> {
    const results: { date: string; price: number; high: number; low: number }[] = [];
    const trId = KIS_TR_ID.OVERSEAS.DAILY_PRICE;

    const maxBatches = Math.ceil(Math.min(count, 300) / 100);
    let bymd = new Date();

    for (let i = 0; i < maxBatches && results.length < count; i++) {
      const fmt = (d: Date) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

      const url = new URL(`${this.auth.getBaseUrl()}${KIS_ENDPOINTS.OVERSEAS.DAILY_PRICE}`);
      url.searchParams.set('AUTH', '');
      url.searchParams.set('EXCD', excd);
      url.searchParams.set('SYMB', symbol);
      url.searchParams.set('GUBN', '0');    // 일봉
      url.searchParams.set('BYMD', fmt(bymd));
      url.searchParams.set('MODP', '0');    // 원주가

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { ...this.auth.getAuthHeaders(), tr_id: trId },
      });

      const data: KISOverseasDailyPriceResponse = await response.json();
      if (data.rt_cd !== '0' || !data.output2?.length) break;

      for (const row of data.output2) {
        if (row.xymd && row.clos) {
          results.push({
            date: row.xymd,
            price: parseFloat(row.clos),
            high: parseFloat(row.high ?? row.clos),
            low: parseFloat(row.low ?? row.clos),
          });
        }
      }

      // 다음 배치는 현재 배치의 마지막 날짜 -1일
      const lastDate = data.output2[data.output2.length - 1].xymd;
      bymd = new Date(
        parseInt(lastDate.slice(0, 4)),
        parseInt(lastDate.slice(4, 6)) - 1,
        parseInt(lastDate.slice(6, 8)) - 1,
      );
    }

    return results
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, count);
  }

  /**
   * 일봉 종가 이력 조회 (시장 자동 판별)
   */
  async getDailyPriceHistory(
    symbol: string,
    market: 'domestic' | 'overseas',
    count: number = 240,
  ): Promise<{ date: string; price: number; high: number; low: number }[]> {
    if (market === 'domestic') {
      return this.getDomesticDailyPriceHistory(symbol, count);
    }
    for (const excd of ['NAS', 'NYS', 'AMS']) {
      const history = await this.getOverseasDailyPriceHistory(symbol, excd, count);
      if (history.length > 0) return history;
    }
    return [];
  }

  /**
   * 시세 조회 (자동 시장 판별)
   */
  async getQuote(symbol: string): Promise<BrokerResponse<Quote>> {
    // 한국 주식 판별: 6자리 숫자
    const isKorean = /^\d{6}$/.test(symbol);

    if (isKorean) {
      return this.getDomesticQuote(symbol);
    }

      // 미국 주식 - NASDAQ 먼저, NYSE, AMEX 순
    // 시세 API는 잔고 API와 거래소 코드가 다름 (NAS/NYS/AMS)
    const priceExchangeCodes = ['NAS', 'NYS', 'AMS'];
    let lastError: { code: string; message: string } | undefined;

    for (const excd of priceExchangeCodes) {
      const result = await this.getOverseasQuoteByCode(symbol, excd);
      if (result.success) {
        return result;
      }
      lastError = result.error;
    }

    return {
      success: false,
      error: {
        code: lastError?.code ?? 'QUOTE_NOT_FOUND',
        message: lastError?.message ?? `종목을 찾을 수 없습니다: ${symbol}`,
      },
    };
  }
}
