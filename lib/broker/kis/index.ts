/**
 * 한국투자증권 API 클라이언트
 */

import type { IBroker } from '../interface';
import type {
  KISCredentials,
  TokenInfo,
  Balance,
  Position,
  Quote,
  Order,
  OrderRequest,
  BrokerResponse,
  BrokerType,
} from '../types';
import { KISAuth } from './auth';
import { KISAccount } from './account';
import { KISQuote } from './quote';
import { KISOrder } from './order';

export class KISClient implements IBroker {
  readonly type: BrokerType = 'kis';

  private auth: KISAuth;
  private account: KISAccount;
  private quote: KISQuote;
  private order: KISOrder;
  private connected = false;

  constructor(credentials: KISCredentials) {
    this.auth = new KISAuth(credentials);
    this.account = new KISAccount(this.auth);
    this.quote = new KISQuote(this.auth);
    this.order = new KISOrder(this.auth);
  }

  isConnected(): boolean {
    return this.connected && this.auth.getCurrentToken() !== null;
  }

  async connect(): Promise<BrokerResponse<TokenInfo>> {
    const result = await this.auth.getToken();
    if (result.success) {
      this.connected = true;
    }
    return result;
  }

  async disconnect(): Promise<void> {
    await this.auth.revokeToken();
    this.connected = false;
  }

  async refreshToken(): Promise<BrokerResponse<TokenInfo>> {
    return this.auth.getToken();
  }

  async getBalance(): Promise<BrokerResponse<Balance>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }

    // 국내 잔고 기준으로 반환 (필요시 해외도 통합 가능)
    const result = await this.account.getDomesticBalance();
    if (result.success && result.data) {
      return {
        success: true,
        data: result.data.balance,
      };
    }
    return {
      success: false,
      error: result.error,
    };
  }

  async getPositions(): Promise<BrokerResponse<Position[]>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }

    const result = await this.account.getFullBalance();
    if (result.success && result.data) {
      const positions = [
        ...result.data.domestic.positions,
        ...result.data.overseas.positions,
      ];
      return {
        success: true,
        data: positions,
      };
    }
    return {
      success: false,
      error: result.error,
    };
  }

  async getQuote(symbol: string): Promise<BrokerResponse<Quote>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }
    return this.quote.getQuote(symbol);
  }

  async createOrder(request: OrderRequest): Promise<BrokerResponse<Order>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }
    return this.order.createOrder(request);
  }

  async executeOrder(orderId: string): Promise<BrokerResponse<Order>> {
    // KIS는 주문 생성 즉시 실행됨
    // 이 메서드는 주문 상태 조회로 대체
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

  async cancelOrder(orderId: string): Promise<BrokerResponse<void>> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }

    // 주문 정보 조회 후 취소
    const ordersResult = await this.getOrders();
    if (!ordersResult.success || !ordersResult.data) {
      return {
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다.' },
      };
    }

    const order = ordersResult.data.find(o => o.orderId === orderId);
    if (!order) {
      return {
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다.' },
      };
    }

    if (order.market === 'domestic') {
      return this.order.cancelDomesticOrder(
        orderId,
        order.symbol,
        order.orderQuantity - order.filledQuantity
      );
    } else {
      return this.order.cancelOverseasOrder(
        orderId,
        order.symbol,
        order.orderQuantity - order.filledQuantity
      );
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
    return this.order.getOrders();
  }

  async getFilledOrders(startDate?: Date, endDate?: Date): Promise<BrokerResponse<Order[]>> {
    // 현재는 당일 체결 내역만 지원
    const result = await this.getOrders();
    if (result.success && result.data) {
      const filledOrders = result.data.filter(
        o => o.status === 'filled' || o.status === 'partial'
      );
      return { success: true, data: filledOrders };
    }
    return result;
  }

  // 추가 메서드: 통합 잔고 조회
  async getFullBalance(): Promise<
    BrokerResponse<{
      domestic: { balance: Balance; positions: Position[] };
      overseas: { balance: Balance; positions: Position[] };
    }>
  > {
    if (!this.isConnected()) {
      return {
        success: false,
        error: { code: 'NOT_CONNECTED', message: '연결되지 않았습니다.' },
      };
    }
    return this.account.getFullBalance();
  }

  // 토큰 복원 (서버 세션에서 토큰 복원시 사용)
  restoreToken(token: TokenInfo): void {
    this.auth.setToken(token);
    this.connected = true;
  }
}

// 하위 모듈 export
export { KISAuth } from './auth';
export { KISAccount } from './account';
export { KISQuote } from './quote';
export { KISOrder } from './order';
export * from './constants';
