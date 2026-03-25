/**
 * 키움증권 API 클라이언트
 *
 * 참고: 키움증권 REST API는 한국투자증권 API와 유사한 구조입니다.
 * 실제 운영 시에는 키움증권 공식 API 문서를 참고하여 수정이 필요할 수 있습니다.
 */

import type { IBroker } from '../interface';
import type {
  KiwoomCredentials,
  TokenInfo,
  Balance,
  Position,
  Quote,
  Order,
  OrderRequest,
  BrokerResponse,
  BrokerType,
  MarketType,
  OrderStatus,
} from '../types';
import { KIWOOM_API_BASE_URL, KIWOOM_ENDPOINTS, KIWOOM_TR_ID, KIWOOM_EXCHANGE_CODE } from './constants';

export class KiwoomClient implements IBroker {
  readonly type: BrokerType = 'kiwoom';

  private credentials: KiwoomCredentials;
  private token: TokenInfo | null = null;
  private connected = false;
  private baseUrl: string;

  constructor(credentials: KiwoomCredentials) {
    this.credentials = credentials;
    this.baseUrl = KIWOOM_API_BASE_URL.REAL;
  }

  isConnected(): boolean {
    if (!this.connected || !this.token) return false;
    const now = new Date();
    const bufferTime = 5 * 60 * 1000;
    return this.token.expiresAt.getTime() - now.getTime() > bufferTime;
  }

  async connect(): Promise<BrokerResponse<TokenInfo>> {
    try {
      const response = await fetch(`${this.baseUrl}${KIWOOM_ENDPOINTS.AUTH.TOKEN}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: this.credentials.appKey,
          appsecret: this.credentials.appSecret,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: 'AUTH_FAILED',
            message: `토큰 발급 실패: ${response.statusText}`,
          },
        };
      }

      const data = await response.json();
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 86400));

      this.token = {
        accessToken: data.access_token,
        tokenType: data.token_type || 'Bearer',
        expiresAt,
      };
      this.connected = true;

      return { success: true, data: this.token };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  async disconnect(): Promise<void> {
    this.token = null;
    this.connected = false;
  }

  async refreshToken(): Promise<BrokerResponse<TokenInfo>> {
    return this.connect();
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.token) {
      throw new Error('토큰이 없습니다.');
    }
    return {
      'Content-Type': 'application/json; charset=utf-8',
      authorization: `${this.token.tokenType} ${this.token.accessToken}`,
      appkey: this.credentials.appKey,
      appsecret: this.credentials.appSecret,
    };
  }

  private getAccountParts(): [string, string] {
    const parts = this.credentials.accountNumber.split('-');
    return parts.length === 2 ? [parts[0], parts[1]] : [this.credentials.accountNumber, '01'];
  }

  async getBalance(): Promise<BrokerResponse<Balance>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }

    const [accountNo, accountProduct] = this.getAccountParts();

    try {
      const url = new URL(`${this.baseUrl}${KIWOOM_ENDPOINTS.DOMESTIC.BALANCE}`);
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
          ...this.getAuthHeaders(),
          tr_id: KIWOOM_TR_ID.DOMESTIC.BALANCE,
        },
      });

      const data = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: { code: data.msg_cd, message: data.msg1 },
        };
      }

      const output2 = data.output2?.[0] || {};

      const balance: Balance = {
        totalAsset: parseFloat(output2.tot_evlu_amt || '0'),
        totalDeposit: parseFloat(output2.dnca_tot_amt || '0'),
        totalBuyAmount: parseFloat(output2.pchs_amt_smtl_amt || '0'),
        totalEvalAmount: parseFloat(output2.evlu_amt_smtl_amt || '0'),
        totalProfitLoss: parseFloat(output2.evlu_pfls_smtl_amt || '0'),
        totalProfitLossRate:
          parseFloat(output2.pchs_amt_smtl_amt || '0') > 0
            ? (parseFloat(output2.evlu_pfls_smtl_amt || '0') / parseFloat(output2.pchs_amt_smtl_amt || '0')) * 100
            : 0,
        currency: 'KRW',
      };

      return { success: true, data: balance };
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

  async getPositions(): Promise<BrokerResponse<Position[]>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }

    const [accountNo, accountProduct] = this.getAccountParts();

    try {
      const url = new URL(`${this.baseUrl}${KIWOOM_ENDPOINTS.DOMESTIC.BALANCE}`);
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
          ...this.getAuthHeaders(),
          tr_id: KIWOOM_TR_ID.DOMESTIC.BALANCE,
        },
      });

      const data = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: { code: data.msg_cd, message: data.msg1 },
        };
      }

      const positions: Position[] = (data.output1 || [])
        .filter((item: any) => parseFloat(item.hldg_qty || '0') > 0)
        .map((item: any) => ({
          symbol: item.pdno,
          symbolName: item.prdt_name,
          quantity: parseFloat(item.hldg_qty || '0'),
          avgPrice: parseFloat(item.pchs_avg_pric || '0'),
          currentPrice: parseFloat(item.prpr || '0'),
          evalAmount: parseFloat(item.evlu_amt || '0'),
          profitLoss: parseFloat(item.evlu_pfls_amt || '0'),
          profitLossRate: parseFloat(item.evlu_pfls_rt || '0'),
          currency: 'KRW' as const,
          market: 'domestic' as MarketType,
        }));

      return { success: true, data: positions };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'POSITIONS_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류',
        },
      };
    }
  }

  async getQuote(symbol: string): Promise<BrokerResponse<Quote>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }

    const isKorean = /^\d{6}$/.test(symbol);

    try {
      if (isKorean) {
        return this.getDomesticQuote(symbol);
      } else {
        return this.getOverseasQuote(symbol);
      }
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

  private async getDomesticQuote(symbol: string): Promise<BrokerResponse<Quote>> {
    const url = new URL(`${this.baseUrl}${KIWOOM_ENDPOINTS.DOMESTIC.PRICE}`);
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
    url.searchParams.set('FID_INPUT_ISCD', symbol);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
        tr_id: KIWOOM_TR_ID.DOMESTIC.PRICE,
      },
    });

    const data = await response.json();

    if (data.rt_cd !== '0') {
      return {
        success: false,
        error: { code: data.msg_cd, message: data.msg1 },
      };
    }

    const output = data.output;

    const quote: Quote = {
      symbol,
      symbolName: output.hts_kor_isnm || symbol,
      currentPrice: parseFloat(output.stck_prpr || '0'),
      change: parseFloat(output.prdy_vrss || '0'),
      changeRate: parseFloat(output.prdy_ctrt || '0'),
      open: parseFloat(output.stck_oprc || '0'),
      high: parseFloat(output.stck_hgpr || '0'),
      low: parseFloat(output.stck_lwpr || '0'),
      volume: parseFloat(output.acml_vol || '0'),
      prevClose: parseFloat(output.stck_prdy_clpr || '0'),
      currency: 'KRW',
      market: 'domestic',
      updatedAt: new Date(),
    };

    return { success: true, data: quote };
  }

  private async getOverseasQuote(symbol: string): Promise<BrokerResponse<Quote>> {
    const exchanges: (keyof typeof KIWOOM_EXCHANGE_CODE)[] = ['NASDAQ', 'NYSE', 'AMEX'];

    for (const exchange of exchanges) {
      const url = new URL(`${this.baseUrl}${KIWOOM_ENDPOINTS.OVERSEAS.PRICE}`);
      url.searchParams.set('AUTH', '');
      url.searchParams.set('EXCD', KIWOOM_EXCHANGE_CODE[exchange]);
      url.searchParams.set('SYMB', symbol);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          ...this.getAuthHeaders(),
          tr_id: KIWOOM_TR_ID.OVERSEAS.PRICE,
        },
      });

      const data = await response.json();

      if (data.rt_cd === '0' && data.output) {
        const output = data.output;

        const quote: Quote = {
          symbol,
          symbolName: output.name || symbol,
          currentPrice: parseFloat(output.last || '0'),
          change: parseFloat(output.diff || '0'),
          changeRate: parseFloat(output.rate || '0'),
          open: parseFloat(output.open || '0'),
          high: parseFloat(output.high || '0'),
          low: parseFloat(output.low || '0'),
          volume: parseFloat(output.tvol || '0'),
          prevClose: parseFloat(output.base || '0'),
          currency: 'USD',
          market: 'overseas',
          updatedAt: new Date(),
        };

        return { success: true, data: quote };
      }
    }

    return {
      success: false,
      error: { code: 'QUOTE_NOT_FOUND', message: `종목을 찾을 수 없습니다: ${symbol}` },
    };
  }

  async createOrder(request: OrderRequest): Promise<BrokerResponse<Order>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }

    const [accountNo, accountProduct] = this.getAccountParts();
    const isBuy = request.side === 'buy';
    const isDomestic = request.market === 'domestic';

    const endpoint = isDomestic ? KIWOOM_ENDPOINTS.DOMESTIC.ORDER : KIWOOM_ENDPOINTS.OVERSEAS.ORDER;
    const trId = isDomestic
      ? isBuy
        ? KIWOOM_TR_ID.DOMESTIC.BUY
        : KIWOOM_TR_ID.DOMESTIC.SELL
      : isBuy
        ? KIWOOM_TR_ID.OVERSEAS.BUY
        : KIWOOM_TR_ID.OVERSEAS.SELL;

    try {
      const body: Record<string, string> = {
        CANO: accountNo,
        ACNT_PRDT_CD: accountProduct,
        PDNO: request.symbol,
        ORD_DVSN: request.orderType === 'market' ? '01' : '00',
        ORD_QTY: request.quantity.toString(),
        ORD_UNPR: request.orderType === 'market' ? '0' : (request.price?.toString() || '0'),
      };

      if (!isDomestic) {
        body.OVRS_EXCG_CD = KIWOOM_EXCHANGE_CODE.NASDAQ;
        body.OVRS_ORD_UNPR = request.price?.toFixed(2) || '0';
        body.ORD_SVR_DVSN_CD = '0';
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          tr_id: trId,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: { code: data.msg_cd, message: data.msg1 },
        };
      }

      const order: Order = {
        orderId: data.output?.ODNO || '',
        symbol: request.symbol,
        symbolName: request.symbol,
        side: request.side,
        orderType: request.orderType,
        status: 'submitted',
        orderQuantity: request.quantity,
        filledQuantity: 0,
        orderPrice: request.price || 0,
        orderTime: new Date(),
        currency: isDomestic ? 'KRW' : 'USD',
        market: request.market,
      };

      return { success: true, data: order };
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

  async executeOrder(orderId: string): Promise<BrokerResponse<Order>> {
    // 키움도 주문 생성 즉시 실행됨
    return this.getOrder(orderId);
  }

  async cancelOrder(orderId: string): Promise<BrokerResponse<void>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }

    const orderResult = await this.getOrder(orderId);
    if (!orderResult.success || !orderResult.data) {
      return {
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다.' },
      };
    }

    const order = orderResult.data;
    const [accountNo, accountProduct] = this.getAccountParts();
    const isDomestic = order.market === 'domestic';

    const endpoint = isDomestic
      ? KIWOOM_ENDPOINTS.DOMESTIC.ORDER_CANCEL
      : KIWOOM_ENDPOINTS.OVERSEAS.ORDER_CANCEL;
    const trId = isDomestic ? KIWOOM_TR_ID.DOMESTIC.CANCEL : KIWOOM_TR_ID.OVERSEAS.CANCEL;

    try {
      const body: Record<string, string> = {
        CANO: accountNo,
        ACNT_PRDT_CD: accountProduct,
        ORGN_ODNO: orderId,
        ORD_DVSN: '00',
        RVSE_CNCL_DVSN_CD: '02',
        ORD_QTY: (order.orderQuantity - order.filledQuantity).toString(),
        ORD_UNPR: '0',
        QTY_ALL_ORD_YN: 'Y',
      };

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          tr_id: trId,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: { code: data.msg_cd, message: data.msg1 },
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

  async getOrder(orderId: string): Promise<BrokerResponse<Order>> {
    const result = await this.getOrders();
    if (result.success && result.data) {
      const order = result.data.find(o => o.orderId === orderId);
      if (order) {
        return { success: true, data: order };
      }
    }
    return {
      success: false,
      error: { code: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다.' },
    };
  }

  async getOrders(): Promise<BrokerResponse<Order[]>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }

    const [accountNo, accountProduct] = this.getAccountParts();
    const today = formatDate(new Date());

    try {
      const url = new URL(`${this.baseUrl}${KIWOOM_ENDPOINTS.DOMESTIC.ORDERS}`);
      url.searchParams.set('CANO', accountNo);
      url.searchParams.set('ACNT_PRDT_CD', accountProduct);
      url.searchParams.set('INQR_STRT_DT', today);
      url.searchParams.set('INQR_END_DT', today);
      url.searchParams.set('SLL_BUY_DVSN_CD', '00');
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
          ...this.getAuthHeaders(),
          tr_id: KIWOOM_TR_ID.DOMESTIC.ORDERS,
        },
      });

      const data = await response.json();

      if (data.rt_cd !== '0') {
        return {
          success: false,
          error: { code: data.msg_cd, message: data.msg1 },
        };
      }

      const orders: Order[] = (data.output1 || []).map((item: any) => ({
        orderId: item.odno,
        symbol: item.pdno,
        symbolName: item.prdt_name,
        side: item.sll_buy_dvsn_cd === '02' ? 'buy' : 'sell',
        orderType: item.ord_dvsn_cd === '01' ? 'market' : 'limit',
        status: mapOrderStatus(item.tot_ccld_qty, item.ord_qty),
        orderQuantity: parseInt(item.ord_qty || '0'),
        filledQuantity: parseInt(item.tot_ccld_qty || '0'),
        orderPrice: parseFloat(item.ord_unpr || '0'),
        filledPrice: parseFloat(item.avg_prvs || '0') || undefined,
        orderTime: parseOrderTime(item.ord_tmd),
        currency: 'KRW' as const,
        market: 'domestic' as MarketType,
      }));

      return { success: true, data: orders };
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

  async getFilledOrders(startDate?: Date, endDate?: Date): Promise<BrokerResponse<Order[]>> {
    const result = await this.getOrders();
    if (result.success && result.data) {
      const filledOrders = result.data.filter(
        o => o.status === 'filled' || o.status === 'partial'
      );
      return { success: true, data: filledOrders };
    }
    return result;
  }

  // 토큰 복원
  restoreToken(token: TokenInfo): void {
    this.token = token;
    this.connected = true;
  }
}

// 유틸리티 함수
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function parseOrderTime(timeStr: string): Date {
  const now = new Date();
  if (timeStr && timeStr.length >= 6) {
    const hours = parseInt(timeStr.substring(0, 2));
    const minutes = parseInt(timeStr.substring(2, 4));
    const seconds = parseInt(timeStr.substring(4, 6));
    now.setHours(hours, minutes, seconds);
  }
  return now;
}

function mapOrderStatus(filledQty: string, orderQty: string): OrderStatus {
  const filled = parseInt(filledQty || '0');
  const ordered = parseInt(orderQty || '0');

  if (filled === 0) return 'submitted';
  if (filled < ordered) return 'partial';
  if (filled >= ordered) return 'filled';
  return 'submitted';
}

export * from './constants';
