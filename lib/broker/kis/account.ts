/**
 * 한국투자증권 계좌 조회 모듈
 */

import { KIS_ENDPOINTS, KIS_TR_ID, KIS_EXCHANGE_CODE } from './constants';
import { KISAuth } from './auth';
import type { Balance, Position, BrokerResponse, MarketType } from '../types';

interface KISDomesticBalanceResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output1: Array<{
    pdno: string;           // 종목코드
    prdt_name: string;      // 종목명
    hldg_qty: string;       // 보유수량
    pchs_avg_pric: string;  // 매입평균가
    prpr: string;           // 현재가
    evlu_amt: string;       // 평가금액
    evlu_pfls_amt: string;  // 평가손익
    evlu_pfls_rt: string;   // 평가손익률
  }>;
  output2: Array<{
    dnca_tot_amt: string;   // 예수금총액
    tot_evlu_amt: string;   // 총평가금액
    pchs_amt_smtl_amt: string; // 매입금액합계
    evlu_amt_smtl_amt: string; // 평가금액합계
    evlu_pfls_smtl_amt: string; // 평가손익합계
  }>;
}

interface KISOverseasBalanceResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output1: Array<{
    ovrs_pdno: string;      // 해외종목코드
    ovrs_item_name: string; // 종목명
    ovrs_cblc_qty: string;  // 보유수량
    pchs_avg_pric: string;  // 매입평균가
    ovrs_stck_evlu_amt: string; // 평가금액(외화)
    frcr_evlu_pfls_amt: string; // 평가손익(외화)
    evlu_pfls_rt: string;   // 평가손익률
    now_pric2: string;      // 현재가
  }>;
  output2: {
    frcr_pchs_amt1: string;     // 외화매입금액
    ovrs_tot_pfls: string;      // 해외총손익
    tot_evlu_pfls_amt: string;  // 총평가손익
    frcr_buy_amt_smtl1: string; // 외화매수금액합계
  };
}

/**
 * KIS 계좌 조회
 */
export class KISAccount {
  private auth: KISAuth;

  constructor(auth: KISAuth) {
    this.auth = auth;
  }

  /**
   * 국내주식 잔고 조회
   */
  async getDomesticBalance(): Promise<BrokerResponse<{ balance: Balance; positions: Position[] }>> {
    const [accountNo, accountProduct] = this.auth.getAccountParts();
    const trId = KIS_TR_ID.DOMESTIC.BALANCE;

    try {
      const url = new URL(`${this.auth.getBaseUrl()}${KIS_ENDPOINTS.DOMESTIC.BALANCE}`);
      url.searchParams.set('CANO', accountNo);
      url.searchParams.set('ACNT_PRDT_CD', accountProduct);
      url.searchParams.set('AFHR_FLPR_YN', 'N');
      url.searchParams.set('OFL_YN', '');
      url.searchParams.set('INQR_DVSN', '02');
      url.searchParams.set('UNPR_DVSN', '01');
      url.searchParams.set('FUND_STTL_ICLD_YN', 'N');
      url.searchParams.set('FNCG_AMT_AUTO_RDPT_YN', 'N');
      url.searchParams.set('PRCS_DVSN', '00');
      url.searchParams.set('CTX_AREA_FK100', '');
      url.searchParams.set('CTX_AREA_NK100', '');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          ...this.auth.getAuthHeaders(),
          tr_id: trId,
        },
      });

      const data: KISDomesticBalanceResponse = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: {
            code: data.msg_cd,
            message: data.msg1,
          },
        };
      }

      const output2 = data.output2[0] || {
        dnca_tot_amt: '0',
        tot_evlu_amt: '0',
        pchs_amt_smtl_amt: '0',
        evlu_amt_smtl_amt: '0',
        evlu_pfls_smtl_amt: '0',
      };

      const balance: Balance = {
        totalAsset: parseFloat(output2.tot_evlu_amt),
        totalDeposit: parseFloat(output2.dnca_tot_amt),
        totalBuyAmount: parseFloat(output2.pchs_amt_smtl_amt),
        totalEvalAmount: parseFloat(output2.evlu_amt_smtl_amt),
        totalProfitLoss: parseFloat(output2.evlu_pfls_smtl_amt),
        totalProfitLossRate:
          parseFloat(output2.pchs_amt_smtl_amt) > 0
            ? (parseFloat(output2.evlu_pfls_smtl_amt) / parseFloat(output2.pchs_amt_smtl_amt)) * 100
            : 0,
        currency: 'KRW',
      };

      const positions: Position[] = data.output1
        .filter(item => parseFloat(item.hldg_qty) > 0)
        .map(item => ({
          symbol: item.pdno,
          symbolName: item.prdt_name,
          quantity: parseFloat(item.hldg_qty),
          avgPrice: parseFloat(item.pchs_avg_pric),
          currentPrice: parseFloat(item.prpr),
          evalAmount: parseFloat(item.evlu_amt),
          profitLoss: parseFloat(item.evlu_pfls_amt),
          profitLossRate: parseFloat(item.evlu_pfls_rt),
          currency: 'KRW',
          market: 'domestic' as MarketType,
        }));

      return {
        success: true,
        data: { balance, positions },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BALANCE_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 특정 거래소의 해외주식 잔고 조회
   */
  private async getOverseasBalanceByExchange(
    exchangeCode: string
  ): Promise<BrokerResponse<{ balance: Balance; positions: Position[] }>> {
    const [accountNo, accountProduct] = this.auth.getAccountParts();
    const trId = KIS_TR_ID.OVERSEAS.BALANCE;

    try {
      const url = new URL(`${this.auth.getBaseUrl()}${KIS_ENDPOINTS.OVERSEAS.BALANCE}`);
      url.searchParams.set('CANO', accountNo);
      url.searchParams.set('ACNT_PRDT_CD', accountProduct);
      url.searchParams.set('OVRS_EXCG_CD', exchangeCode);
      url.searchParams.set('TR_CRCY_CD', 'USD');
      url.searchParams.set('CTX_AREA_FK200', '');
      url.searchParams.set('CTX_AREA_NK200', '');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          ...this.auth.getAuthHeaders(),
          tr_id: trId,
        },
      });

      const data: KISOverseasBalanceResponse = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: {
            code: data.msg_cd,
            message: data.msg1,
          },
        };
      }

      const output2 = data.output2 || {
        frcr_pchs_amt1: '0',
        ovrs_tot_pfls: '0',
        tot_evlu_pfls_amt: '0',
        frcr_buy_amt_smtl1: '0',
      };

      // KIS는 "0.000000" 같은 truthy 문자열을 반환하므로 || 대신 수치 비교 사용
      const buyAmt = parseFloat(output2.frcr_buy_amt_smtl1 ?? '0') || 0;
      const pchsAmt = parseFloat(output2.frcr_pchs_amt1 ?? '0') || 0;
      const totalBuyAmount = buyAmt > 0 ? buyAmt : pchsAmt;
      const totalProfitLoss = parseFloat(output2.ovrs_tot_pfls ?? '0') || 0;

      const balance: Balance = {
        totalAsset: totalBuyAmount + totalProfitLoss,
        totalDeposit: 0, // 해외 예수금은 별도 조회 필요
        totalBuyAmount,
        totalEvalAmount: totalBuyAmount + totalProfitLoss,
        totalProfitLoss,
        totalProfitLossRate: totalBuyAmount > 0 ? (totalProfitLoss / totalBuyAmount) * 100 : 0,
        currency: 'USD',
      };

      const positions: Position[] = data.output1
        .filter(item => parseFloat(item.ovrs_cblc_qty) > 0)
        .map(item => ({
          symbol: item.ovrs_pdno,
          symbolName: item.ovrs_item_name,
          quantity: parseFloat(item.ovrs_cblc_qty),
          avgPrice: parseFloat(item.pchs_avg_pric),
          currentPrice: parseFloat(item.now_pric2),
          evalAmount: parseFloat(item.ovrs_stck_evlu_amt),
          profitLoss: parseFloat(item.frcr_evlu_pfls_amt),
          profitLossRate: parseFloat(item.evlu_pfls_rt),
          currency: 'USD',
          market: 'overseas' as MarketType,
        }));

      return {
        success: true,
        data: { balance, positions },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BALANCE_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 해외주식 잔고 조회 (NASD + NYSE + AMEX 합산)
   */
  async getOverseasBalance(): Promise<BrokerResponse<{ balance: Balance; positions: Position[] }>> {
    const exchanges = [
      KIS_EXCHANGE_CODE.NASDAQ,
      KIS_EXCHANGE_CODE.NYSE,
      KIS_EXCHANGE_CODE.AMEX,
    ];

    const results = await Promise.all(exchanges.map(ex => this.getOverseasBalanceByExchange(ex)));

    // 심볼 기준 중복 제거하며 positions 합산
    const positionMap = new Map<string, Position>();
    let totalBuyAmount = 0;
    let totalProfitLoss = 0;

    for (const r of results) {
      if (r.success && r.data) {
        for (const p of r.data.positions) {
          if (!positionMap.has(p.symbol)) {
            positionMap.set(p.symbol, p);
          }
        }
        totalBuyAmount += r.data.balance.totalBuyAmount;
        totalProfitLoss += r.data.balance.totalProfitLoss;
      }
    }

    const allPositions = Array.from(positionMap.values());

    const balance: Balance = {
      totalAsset: totalBuyAmount + totalProfitLoss,
      totalDeposit: 0,
      totalBuyAmount,
      totalEvalAmount: totalBuyAmount + totalProfitLoss,
      totalProfitLoss,
      totalProfitLossRate: totalBuyAmount > 0 ? (totalProfitLoss / totalBuyAmount) * 100 : 0,
      currency: 'USD',
    };

    return { success: true, data: { balance, positions: allPositions } };
  }

  /**
   * 통합 잔고 조회 (국내 + 해외)
   */
  async getFullBalance(): Promise<
    BrokerResponse<{
      domestic: { balance: Balance; positions: Position[] };
      overseas: { balance: Balance; positions: Position[] };
    }>
  > {
    const [domesticResult, overseasResult] = await Promise.all([
      this.getDomesticBalance(),
      this.getOverseasBalance(),
    ]);

    if (!domesticResult.success) {
      return {
        success: false,
        error: domesticResult.error,
      };
    }

    if (!overseasResult.success) {
      return {
        success: false,
        error: overseasResult.error,
      };
    }

    return {
      success: true,
      data: {
        domestic: domesticResult.data!,
        overseas: overseasResult.data!,
      },
    };
  }

  /**
   * 해외 외화예수금 + 통합잔고 조회 (inquire-present-balance)
   * - 일반 inquire-balance가 누락하는 USD 예수금까지 포함
   * - 응답 구조 검증을 위해 raw 응답도 함께 반환
   */
  async getOverseasPresentBalance(): Promise<
    BrokerResponse<{
      foreignCash: number;    // 외화예수금 (USD)
      foreignCashKRW: number; // 외화예수금 원화환산
      currency: string;
      raw: unknown;           // 원본 응답 — 필드명 검증용
    }>
  > {
    const [accountNo, accountProduct] = this.auth.getAccountParts();
    const trId = 'CTRP6504R'; // KIS Open API 해외주식 체결기준현재잔고 (실전)

    try {
      const url = new URL(`${this.auth.getBaseUrl()}${KIS_ENDPOINTS.OVERSEAS.PRESENT_BALANCE}`);
      url.searchParams.set('CANO', accountNo);
      url.searchParams.set('ACNT_PRDT_CD', accountProduct);
      url.searchParams.set('WCRC_FRCR_DVSN_CD', '02');  // 02: 외화 기준 조회
      url.searchParams.set('NATN_CD', '840');           // 840: 미국
      url.searchParams.set('TR_MKET_CD', '00');         // 00: 전체 시장
      url.searchParams.set('INQR_DVSN_CD', '00');       // 00: 전체

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          ...this.auth.getAuthHeaders(),
          tr_id: trId,
        },
      });

      const data = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: { code: data.msg_cd, message: data.msg1 },
        };
      }

      // output2: 외화별 잔고 배열, output3: 종합
      // KIS 공식 필드: frcr_dncl_amt_2 (외화예수금) — output2 또는 output3에 위치
      // 응답을 raw로 함께 반환해서 실제 필드 검증
      const output2: Array<Record<string, string>> = Array.isArray(data.output2) ? data.output2 : [];
      const output3: Record<string, string> = data.output3 ?? {};

      // USD 행만 추출 (crcy_cd = 'USD')
      const usdRow = output2.find(r => (r.crcy_cd ?? '').toUpperCase() === 'USD');

      // 외화예수금 후보 필드들 — 가능한 후보 모두 시도 후 0이 아닌 첫 값
      const candidates = [
        usdRow?.frcr_dncl_amt_2,
        usdRow?.frcr_dncl_amt,
        usdRow?.dncl_amt,
        output3?.frcr_dncl_amt_2,
        output3?.frcr_dncl_amt,
      ].map(v => (v != null ? parseFloat(v) : NaN)).filter(v => !isNaN(v));

      const foreignCash = candidates.find(v => v > 0) ?? candidates[0] ?? 0;
      const foreignCashKRW = parseFloat(output3?.frcr_evlu_tot_amt ?? '0') || 0;

      return {
        success: true,
        data: {
          foreignCash,
          foreignCashKRW,
          currency: 'USD',
          raw: { output2, output3 },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PRESENT_BALANCE_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }
}
