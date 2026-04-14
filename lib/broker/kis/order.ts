/**
 * 한국투자증권 주문 모듈
 */

import {
  KIS_ENDPOINTS,
  KIS_TR_ID,
  KIS_DOMESTIC_ORDER_TYPE,
  KIS_OVERSEAS_ORDER_TYPE,
  KIS_EXCHANGE_CODE,
} from './constants';
import { KISAuth } from './auth';
import type {
  Order,
  OrderRequest,
  OrderStatus,
  BrokerResponse,
  MarketType,
} from '../types';

interface KISDomesticOrderResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output: {
    KRX_FWDG_ORD_ORGNO: string;  // 주문조직번호
    ODNO: string;                 // 주문번호
    ORD_TMD: string;              // 주문시각
  };
}

interface KISOverseasOrderResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output: {
    KRX_FWDG_ORD_ORGNO: string;
    ODNO: string;
    ORD_TMD: string;
  };
}

interface KISDomesticOrdersResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output1: Array<{
    odno: string;              // 주문번호
    pdno: string;              // 종목코드
    prdt_name: string;         // 종목명
    sll_buy_dvsn_cd: string;   // 매도매수구분 (01:매도, 02:매수)
    ord_dvsn_cd: string;       // 주문구분코드
    ord_qty: string;           // 주문수량
    tot_ccld_qty: string;      // 총체결수량
    ord_unpr: string;          // 주문단가
    avg_prvs: string;          // 체결평균가
    ccld_cndt_name: string;    // 체결상태명
    ord_tmd: string;           // 주문시각
  }>;
}

interface KISOverseasOrdersResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output: Array<{
    odno: string;
    pdno: string;
    prdt_name: string;
    sll_buy_dvsn_cd: string;
    ft_ord_qty: string;
    ft_ccld_qty: string;
    ft_ord_unpr3: string;
    ft_ccld_unpr3: string;
    nccs_qty: string;          // 미체결수량
    ord_tmd: string;
  }>;
}

/**
 * KIS 주문
 */
export class KISOrder {
  private auth: KISAuth;

  constructor(auth: KISAuth) {
    this.auth = auth;
  }

  /**
   * 국내주식 주문
   */
  async createDomesticOrder(request: OrderRequest): Promise<BrokerResponse<Order>> {
    const [accountNo, accountProduct] = this.auth.getAccountParts();
    const isBuy = request.side === 'buy';
    const trId = isBuy ? KIS_TR_ID.DOMESTIC.BUY : KIS_TR_ID.DOMESTIC.SELL;

    // 주문 유형 코드 결정
    let orderTypeCode: string;
    switch (request.orderType) {
      case 'market':
        orderTypeCode = KIS_DOMESTIC_ORDER_TYPE.BUY_MARKET;
        break;
      case 'limit':
      case 'loc':
        orderTypeCode = KIS_DOMESTIC_ORDER_TYPE.BUY_LIMIT;
        break;
      default:
        orderTypeCode = KIS_DOMESTIC_ORDER_TYPE.BUY_LIMIT;
    }

    try {
      const response = await fetch(
        `${this.auth.getBaseUrl()}${KIS_ENDPOINTS.DOMESTIC.ORDER}`,
        {
          method: 'POST',
          headers: {
            ...this.auth.getAuthHeaders(),
            tr_id: trId,
          },
          body: JSON.stringify({
            CANO: accountNo,
            ACNT_PRDT_CD: accountProduct,
            PDNO: request.symbol,
            ORD_DVSN: orderTypeCode,
            ORD_QTY: request.quantity.toString(),
            ORD_UNPR: request.orderType === 'market' ? '0' : (request.price?.toString() || '0'),
          }),
        }
      );

      const data: KISDomesticOrderResponse = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: {
            code: data.msg_cd,
            message: data.msg1,
          },
        };
      }

      const order: Order = {
        orderId: data.output.ODNO,
        symbol: request.symbol,
        symbolName: request.symbol, // 조회 필요
        side: request.side,
        orderType: request.orderType,
        status: 'submitted',
        orderQuantity: request.quantity,
        filledQuantity: 0,
        orderPrice: request.price || 0,
        orderTime: new Date(),
        currency: 'KRW',
        market: 'domestic',
      };

      return {
        success: true,
        data: order,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ORDER_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 해외주식 주문
   */
  async createOverseasOrder(
    request: OrderRequest,
    exchange: keyof typeof KIS_EXCHANGE_CODE = 'NASDAQ'
  ): Promise<BrokerResponse<Order>> {
    const [accountNo, accountProduct] = this.auth.getAccountParts();
    const isBuy = request.side === 'buy';
    const trId = isBuy ? KIS_TR_ID.OVERSEAS.BUY : KIS_TR_ID.OVERSEAS.SELL;

    const exchangeCode = KIS_EXCHANGE_CODE[exchange];
    // 주문 유형 코드 결정 (미국 주식 전용 TR ID 기준)
    // MOC('33'), MOO('31')는 매도 전용 / LOC('34'), LOO('32')는 매수/매도 모두 가능
    let orderTypeCode: string;
    switch (request.orderType) {
      case 'moc':
        orderTypeCode = isBuy ? KIS_OVERSEAS_ORDER_TYPE.LOC : KIS_OVERSEAS_ORDER_TYPE.MOC;
        break;
      case 'loc':
        orderTypeCode = KIS_OVERSEAS_ORDER_TYPE.LOC;
        break;
      case 'limit':
      default:
        orderTypeCode = KIS_OVERSEAS_ORDER_TYPE.LIMIT;
    }

    try {
      const response = await fetch(
        `${this.auth.getBaseUrl()}${KIS_ENDPOINTS.OVERSEAS.ORDER}`,
        {
          method: 'POST',
          headers: {
            ...this.auth.getAuthHeaders(),
            tr_id: trId,
          },
          body: JSON.stringify({
            CANO: accountNo,
            ACNT_PRDT_CD: accountProduct,
            OVRS_EXCG_CD: exchangeCode,
            PDNO: request.symbol,
            ORD_DVSN: orderTypeCode,
            ORD_QTY: request.quantity.toString(),
            OVRS_ORD_UNPR: orderTypeCode === KIS_OVERSEAS_ORDER_TYPE.MOC ? '0' : (request.price?.toFixed(2) || '0'),
            ORD_SVR_DVSN_CD: '0',
          }),
        }
      );

      const data: KISOverseasOrderResponse = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: {
            code: data.msg_cd,
            message: data.msg1,
          },
        };
      }

      const order: Order = {
        orderId: data.output.ODNO,
        symbol: request.symbol,
        symbolName: request.symbol,
        side: request.side,
        orderType: request.orderType,
        status: 'submitted',
        orderQuantity: request.quantity,
        filledQuantity: 0,
        orderPrice: request.price || 0,
        orderTime: new Date(),
        currency: 'USD',
        market: 'overseas',
      };

      return {
        success: true,
        data: order,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ORDER_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 주문 생성 (자동 시장 판별)
   */
  async createOrder(request: OrderRequest): Promise<BrokerResponse<Order>> {
    if (request.market === 'domestic') {
      return this.createDomesticOrder(request);
    }
    // KISClient.createOrder에서 exchange를 결정하므로 여기선 domestic만 사용됨
    return this.createDomesticOrder(request);
  }

  /**
   * 국내주식 주문 취소
   */
  async cancelDomesticOrder(
    orderId: string,
    symbol: string,
    quantity: number
  ): Promise<BrokerResponse<void>> {
    const [accountNo, accountProduct] = this.auth.getAccountParts();
    const trId = KIS_TR_ID.DOMESTIC.CANCEL;

    try {
      const response = await fetch(
        `${this.auth.getBaseUrl()}${KIS_ENDPOINTS.DOMESTIC.ORDER_REVISE}`,
        {
          method: 'POST',
          headers: {
            ...this.auth.getAuthHeaders(),
            tr_id: trId,
          },
          body: JSON.stringify({
            CANO: accountNo,
            ACNT_PRDT_CD: accountProduct,
            KRX_FWDG_ORD_ORGNO: '',
            ORGN_ODNO: orderId,
            ORD_DVSN: '00',
            RVSE_CNCL_DVSN_CD: '02', // 02: 취소
            ORD_QTY: quantity.toString(),
            ORD_UNPR: '0',
            QTY_ALL_ORD_YN: 'Y',
          }),
        }
      );

      const data = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: {
            code: data.msg_cd,
            message: data.msg1,
          },
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CANCEL_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 해외주식 주문 취소
   */
  async cancelOverseasOrder(
    orderId: string,
    symbol: string,
    quantity: number,
    exchange: keyof typeof KIS_EXCHANGE_CODE = 'NASDAQ'
  ): Promise<BrokerResponse<void>> {
    const [accountNo, accountProduct] = this.auth.getAccountParts();
    const trId = KIS_TR_ID.OVERSEAS.CANCEL;

    const exchangeCode = KIS_EXCHANGE_CODE[exchange];

    try {
      const response = await fetch(
        `${this.auth.getBaseUrl()}${KIS_ENDPOINTS.OVERSEAS.ORDER_REVISE}`,
        {
          method: 'POST',
          headers: {
            ...this.auth.getAuthHeaders(),
            tr_id: trId,
          },
          body: JSON.stringify({
            CANO: accountNo,
            ACNT_PRDT_CD: accountProduct,
            OVRS_EXCG_CD: exchangeCode,
            PDNO: symbol,
            ORGN_ODNO: orderId,
            RVSE_CNCL_DVSN_CD: '02',
            ORD_QTY: quantity.toString(),
            OVRS_ORD_UNPR: '0',
          }),
        }
      );

      const data = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: {
            code: data.msg_cd,
            message: data.msg1,
          },
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CANCEL_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 국내주식 당일 주문 조회
   */
  async getDomesticOrders(): Promise<BrokerResponse<Order[]>> {
    const [accountNo, accountProduct] = this.auth.getAccountParts();
    const trId = KIS_TR_ID.DOMESTIC.ORDERS;

    try {
      const url = new URL(`${this.auth.getBaseUrl()}${KIS_ENDPOINTS.DOMESTIC.ORDERS}`);
      url.searchParams.set('CANO', accountNo);
      url.searchParams.set('ACNT_PRDT_CD', accountProduct);
      url.searchParams.set('INQR_STRT_DT', formatDate(new Date()));
      url.searchParams.set('INQR_END_DT', formatDate(new Date()));
      url.searchParams.set('SLL_BUY_DVSN_CD', '00'); // 전체
      url.searchParams.set('INQR_DVSN', '00');
      url.searchParams.set('PDNO', '');
      url.searchParams.set('CCLD_DVSN', '00');
      url.searchParams.set('ORD_GNO_BRNO', '');
      url.searchParams.set('ODNO', '');
      url.searchParams.set('INQR_DVSN_3', '00');
      url.searchParams.set('INQR_DVSN_1', '');
      url.searchParams.set('CTX_AREA_FK100', '');
      url.searchParams.set('CTX_AREA_NK100', '');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          ...this.auth.getAuthHeaders(),
          tr_id: trId,
        },
      });

      const data: KISDomesticOrdersResponse = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: {
            code: data.msg_cd,
            message: data.msg1,
          },
        };
      }

      const orders: Order[] = data.output1.map(item => ({
        orderId: item.odno,
        symbol: item.pdno,
        symbolName: item.prdt_name,
        side: item.sll_buy_dvsn_cd === '02' ? 'buy' : 'sell',
        orderType: item.ord_dvsn_cd === '01' ? 'market' : 'limit',
        status: mapOrderStatus(item.tot_ccld_qty, item.ord_qty),
        orderQuantity: parseInt(item.ord_qty),
        filledQuantity: parseInt(item.tot_ccld_qty),
        orderPrice: parseFloat(item.ord_unpr),
        filledPrice: parseFloat(item.avg_prvs) || undefined,
        orderTime: parseOrderTime(item.ord_tmd),
        currency: 'KRW',
        market: 'domestic' as MarketType,
      }));

      return {
        success: true,
        data: orders,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ORDERS_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 해외주식 당일 주문 조회
   */
  async getOverseasOrders(): Promise<BrokerResponse<Order[]>> {
    const [accountNo, accountProduct] = this.auth.getAccountParts();
    const trId = KIS_TR_ID.OVERSEAS.ORDERS;

    try {
      const url = new URL(`${this.auth.getBaseUrl()}${KIS_ENDPOINTS.OVERSEAS.ORDERS}`);
      url.searchParams.set('CANO', accountNo);
      url.searchParams.set('ACNT_PRDT_CD', accountProduct);
      url.searchParams.set('PDNO', '%');
      url.searchParams.set('ORD_STRT_DT', formatDate(new Date()));
      url.searchParams.set('ORD_END_DT', formatDate(new Date()));
      url.searchParams.set('SLL_BUY_DVSN', '00');
      url.searchParams.set('CCLD_NCCS_DVSN', '00');
      url.searchParams.set('OVRS_EXCG_CD', '%');
      url.searchParams.set('SORT_SQN', 'DS');
      url.searchParams.set('ORD_DT', '');
      url.searchParams.set('ORD_GNO_BRNO', '');
      url.searchParams.set('ODNO', '');
      url.searchParams.set('CTX_AREA_NK200', '');
      url.searchParams.set('CTX_AREA_FK200', '');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          ...this.auth.getAuthHeaders(),
          tr_id: trId,
        },
      });

      const data: KISOverseasOrdersResponse = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: {
            code: data.msg_cd,
            message: data.msg1,
          },
        };
      }

      const orders: Order[] = data.output.map(item => ({
        orderId: item.odno,
        symbol: item.pdno,
        symbolName: item.prdt_name,
        side: item.sll_buy_dvsn_cd === '02' ? 'buy' : 'sell',
        orderType: 'limit',
        status: mapOrderStatus(item.ft_ccld_qty, item.ft_ord_qty),
        orderQuantity: parseInt(item.ft_ord_qty),
        filledQuantity: parseInt(item.ft_ccld_qty),
        orderPrice: parseFloat(item.ft_ord_unpr3),
        filledPrice: parseFloat(item.ft_ccld_unpr3) || undefined,
        orderTime: parseOrderTime(item.ord_tmd),
        currency: 'USD',
        market: 'overseas' as MarketType,
      }));

      return {
        success: true,
        data: orders,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ORDERS_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  /**
   * 당일 전체 주문 조회 (국내 + 해외)
   */
  async getOrders(): Promise<BrokerResponse<Order[]>> {
    const [domesticResult, overseasResult] = await Promise.all([
      this.getDomesticOrders(),
      this.getOverseasOrders(),
    ]);

    const orders: Order[] = [];

    if (domesticResult.success && domesticResult.data) {
      orders.push(...domesticResult.data);
    }

    if (overseasResult.success && overseasResult.data) {
      orders.push(...overseasResult.data);
    }

    return {
      success: true,
      data: orders.sort((a, b) => b.orderTime.getTime() - a.orderTime.getTime()),
    };
  }
}

// NYSE ARCA(AMEX)에 상장된 주요 미국 ETF 목록
// KIS에서는 NYSE Arca = 'AMEX'로 처리
// 참고: TQQQ/SQQQ는 NASDAQ, SOXL/TECL 등 Direxion은 NYSE Arca
const AMEX_SYMBOLS = new Set([
  // Direxion 레버리지 ETF (NYSE Arca)
  'SOXL', 'SOXS', 'TECL', 'TECS', 'LABU', 'LABD',
  'DFEN', 'WANT', 'PILL', 'CURE',
  'DRN', 'DRV', 'FAS', 'FAZ', 'TNA', 'TZA',
  'NAIL', 'HIBL', 'HIBS', 'INDL',
  'SPXL', 'SPXS',
  // MicroSectors ETF (NYSE Arca)
  'FNGU', 'FNGD',
  // ProShares 레버리지 ETF (NYSE Arca)
  'UPRO', 'SPXU', 'UDOW', 'SDOW', 'URTY', 'SRTY',
  'UCO', 'SCO', 'UVXY', 'SVXY', 'VIXY',
  // 주요 인덱스 ETF (NYSE Arca)
  'SPY', 'IVV', 'VOO', 'GLD', 'SLV', 'USO',
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE',
  'EEM', 'EFA', 'VWO', 'AGG', 'BND', 'LQD', 'HYG', 'VNQ',
  // NASDAQ 상장: TQQQ, SQQQ, QQQ 등 → 기본값(NASD) 사용
]);

// 알 수 없는 종목은 NASD 기본값 사용

export function getExchangeForSymbol(symbol: string): keyof typeof KIS_EXCHANGE_CODE {
  const upper = symbol.toUpperCase();
  if (AMEX_SYMBOLS.has(upper)) return 'AMEX';
  return 'NASDAQ';
}

// 유틸리티 함수들

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function parseOrderTime(timeStr: string): Date {
  const now = new Date();
  if (timeStr.length >= 6) {
    const hours = parseInt(timeStr.substring(0, 2));
    const minutes = parseInt(timeStr.substring(2, 4));
    const seconds = parseInt(timeStr.substring(4, 6));
    now.setHours(hours, minutes, seconds);
  }
  return now;
}

function mapOrderStatus(filledQty: string, orderQty: string): OrderStatus {
  const filled = parseInt(filledQty);
  const ordered = parseInt(orderQty);

  if (filled === 0) return 'submitted';
  if (filled < ordered) return 'partial';
  if (filled >= ordered) return 'filled';
  return 'submitted';
}
