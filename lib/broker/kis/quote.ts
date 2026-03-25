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
   * 해외주식 현재가 조회
   */
  async getOverseasQuote(
    symbol: string,
    exchange: keyof typeof KIS_EXCHANGE_CODE = 'NASDAQ'
  ): Promise<BrokerResponse<Quote>> {
    const trId = KIS_TR_ID.OVERSEAS.PRICE;
    const exchangeCode = KIS_EXCHANGE_CODE[exchange];

    try {
      const url = new URL(`${this.auth.getBaseUrl()}${KIS_ENDPOINTS.OVERSEAS.PRICE}`);
      url.searchParams.set('AUTH', '');
      url.searchParams.set('EXCD', exchangeCode);
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
   * 시세 조회 (자동 시장 판별)
   */
  async getQuote(symbol: string): Promise<BrokerResponse<Quote>> {
    // 한국 주식 판별: 6자리 숫자
    const isKorean = /^\d{6}$/.test(symbol);

    if (isKorean) {
      return this.getDomesticQuote(symbol);
    }

    // 미국 주식 - 거래소 자동 판별 시도
    // NASDAQ 먼저 시도, 실패시 NYSE, AMEX 순
    const exchanges: (keyof typeof KIS_EXCHANGE_CODE)[] = ['NASDAQ', 'NYSE', 'AMEX'];

    for (const exchange of exchanges) {
      const result = await this.getOverseasQuote(symbol, exchange);
      if (result.success) {
        return result;
      }
    }

    return {
      success: false,
      error: {
        code: 'QUOTE_NOT_FOUND',
        message: `종목을 찾을 수 없습니다: ${symbol}`,
      },
    };
  }
}
