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
