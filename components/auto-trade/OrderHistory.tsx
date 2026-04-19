'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  RefreshCw,
  XCircle,
  History,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

type BrokerType = 'kis' | 'kiwoom';

interface Order {
  orderId: string;
  symbol: string;
  symbolName: string;
  side: 'buy' | 'sell';
  orderType: string;
  status: string;
  orderQuantity: number;
  filledQuantity: number;
  orderPrice: number;
  filledPrice?: number;
  orderTime: string;
  currency: string;
  market: string;
}

interface OrderHistoryProps {
  defaultBroker?: BrokerType;
  credentialId?: string;
}

export function OrderHistory({ defaultBroker = 'kis', credentialId }: OrderHistoryProps) {
  const [brokerType, setBrokerType] = useState<BrokerType>(defaultBroker);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [brokerType, credentialId]);

  const fetchOrders = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = credentialId
        ? `credentialId=${credentialId}`
        : `brokerType=${brokerType}`;
      const response = await fetch(`/api/broker/orders?${params}`);
      const data = await response.json();

      if (data.success) {
        setOrders(data.data.orders || []);
      } else {
        setError(data.error || '주문 내역을 불러올 수 없습니다.');
      }
    } catch (err) {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (!confirm('이 주문을 취소하시겠습니까?')) return;

    setCancellingId(orderId);

    try {
      const params = credentialId
        ? `credentialId=${credentialId}&orderId=${orderId}`
        : `brokerType=${brokerType}&orderId=${orderId}`;
      const response = await fetch(
        `/api/broker/orders?${params}`,
        { method: 'DELETE' }
      );
      const data = await response.json();

      if (data.success) {
        fetchOrders();
      } else {
        alert(data.error || '주문 취소에 실패했습니다.');
      }
    } catch (err) {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'filled':
        return <Badge className="bg-green-500">체결</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-500">부분체결</Badge>;
      case 'submitted':
        return <Badge variant="secondary">접수</Badge>;
      case 'cancelled':
        return <Badge variant="outline">취소</Badge>;
      case 'rejected':
        return <Badge variant="destructive">거부</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatPrice = (price: number, currency: string) => {
    if (currency === 'USD') {
      return `$${price.toFixed(2)}`;
    }
    return `${price.toLocaleString()}원`;
  };

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Card className="border-emerald-500/30 bg-white">
      <CardHeader className="border-b border-emerald-200 bg-emerald-50">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <History className="h-5 w-5" />
              주문 내역
            </CardTitle>
            <CardDescription className="text-gray-600">오늘의 주문 및 체결 내역</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={brokerType}
              onValueChange={(v) => setBrokerType(v as BrokerType)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kis">한국투자증권</SelectItem>
                <SelectItem value="kiwoom">키움증권</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchOrders}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && orders.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
            <span className="ml-2 text-gray-600">불러오는 중...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-destructive">
            {error}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-600">
            <History className="mb-2 h-8 w-8" />
            <p>오늘 주문 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시간</TableHead>
                  <TableHead>종목</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead className="text-right">주문</TableHead>
                  <TableHead className="text-right">체결</TableHead>
                  <TableHead className="text-right">가격</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.orderId}>
                    <TableCell className="text-sm text-gray-600">
                      {formatTime(order.orderTime)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{order.symbol}</p>
                        <p className="text-xs text-gray-600">
                          {order.symbolName}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`flex items-center ${
                          order.side === 'buy'
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {order.side === 'buy' ? (
                          <ArrowUpRight className="mr-1 h-4 w-4" />
                        ) : (
                          <ArrowDownRight className="mr-1 h-4 w-4" />
                        )}
                        {order.side === 'buy' ? '매수' : '매도'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {order.orderType === 'market'
                          ? '시장가'
                          : order.orderType === 'limit'
                          ? '지정가'
                          : 'LOC'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {order.orderQuantity}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          order.filledQuantity > 0 ? 'font-medium' : ''
                        }
                      >
                        {order.filledQuantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div>
                        <p>{formatPrice(order.orderPrice, order.currency)}</p>
                        {order.filledPrice && order.filledPrice > 0 && (
                          <p className="text-xs text-gray-600">
                            체결: {formatPrice(order.filledPrice, order.currency)}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell>
                      {(order.status === 'submitted' ||
                        order.status === 'partial') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelOrder(order.orderId)}
                          disabled={cancellingId === order.orderId}
                        >
                          {cancellingId === order.orderId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
