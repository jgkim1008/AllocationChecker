'use client';

import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Loader2,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from 'lucide-react';
import { useSignalTradeSettings } from '@/hooks/useSignalTradeSettings';
import { useSignalPositions } from '@/hooks/useSignalPositions';
import { SIGNAL_STRATEGIES, type SignalStrategyType } from '@/lib/signal-trade/types';
import { getExitReasonLabel } from '@/lib/signal-trade/exit-evaluator';

type BrokerType = 'kis' | 'kiwoom';

export function SignalTradePanel() {
  const { settings, loading, createSetting, deleteSetting, toggleEnabled } = useSignalTradeSettings();
  const { positions, loading: positionsLoading, closePosition, refresh: refreshPositions } = useSignalPositions('open');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // 신규 설정 폼 상태
  const [formData, setFormData] = useState({
    symbol: '',
    broker_type: 'kis' as BrokerType,
    strategy_type: 'ma-alignment' as SignalStrategyType,
    min_sync_rate: 60,
    take_profit_pct: 10,
    stop_loss_pct: -5,
    max_hold_days: 30,
    exit_on_signal_loss: false,
    investment_amount: 1000,
    max_positions: 1,
  });

  const handleCreate = async () => {
    if (!formData.symbol.trim()) {
      alert('종목 코드를 입력하세요.');
      return;
    }

    setSaving(true);
    const result = await createSetting({
      ...formData,
      symbol: formData.symbol.toUpperCase(),
      take_profit_pct: formData.take_profit_pct || null,
      stop_loss_pct: formData.stop_loss_pct || null,
      max_hold_days: formData.max_hold_days || null,
    });

    setSaving(false);

    if (result.success) {
      setIsDialogOpen(false);
      setFormData({
        symbol: '',
        broker_type: 'kis',
        strategy_type: 'ma-alignment',
        min_sync_rate: 60,
        take_profit_pct: 10,
        stop_loss_pct: -5,
        max_hold_days: 30,
        exit_on_signal_loss: false,
        investment_amount: 1000,
        max_positions: 1,
      });
    } else {
      alert(result.error || '저장 실패');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 설정을 삭제하시겠습니까?')) return;
    const result = await deleteSetting(id);
    if (!result.success) {
      alert(result.error || '삭제 실패');
    }
  };

  const handleClosePosition = async (positionId: string) => {
    if (!confirm('이 포지션을 수동 청산하시겠습니까?')) return;
    const result = await closePosition(positionId);
    if (!result.success) {
      alert(result.error || '청산 실패');
    }
  };

  const getStrategyName = (type: SignalStrategyType) => {
    return SIGNAL_STRATEGIES.find(s => s.id === type)?.name || type;
  };

  return (
    <div className="space-y-6">
      {/* 설정 목록 카드 */}
      <Card className="border-emerald-500/30 bg-white">
        <CardHeader className="flex flex-row items-center justify-between border-b border-emerald-200 bg-emerald-50">
          <div>
            <CardTitle className="text-emerald-700">신호 전략 설정</CardTitle>
            <CardDescription className="text-gray-600">스캔 전략 신호 기반 자동매매 설정</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                전략 추가
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>신호 전략 추가</DialogTitle>
                <DialogDescription>
                  스캔 전략 신호가 발생하면 자동으로 매수합니다.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>종목 코드</Label>
                    <Input
                      placeholder="예: TQQQ, SOXL"
                      value={formData.symbol}
                      onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>증권사</Label>
                    <Select
                      value={formData.broker_type}
                      onValueChange={(v) => setFormData({ ...formData, broker_type: v as BrokerType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kis">한국투자증권</SelectItem>
                        <SelectItem value="kiwoom">키움증권</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>전략</Label>
                  <Select
                    value={formData.strategy_type}
                    onValueChange={(v) => setFormData({ ...formData, strategy_type: v as SignalStrategyType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* 일봉 기반 전략 */}
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500">일봉 전략</div>
                      {SIGNAL_STRATEGIES.filter(s => s.category === 'daily' && s.autoTradeEnabled).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                      {/* 차트 패턴 */}
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500 mt-1">차트 패턴</div>
                      {SIGNAL_STRATEGIES.filter(s => s.category === 'pattern' && s.autoTradeEnabled).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                      {/* 월봉 전략 */}
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500 mt-1">월봉 전략</div>
                      {SIGNAL_STRATEGIES.filter(s => s.category === 'monthly' && s.autoTradeEnabled).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    {SIGNAL_STRATEGIES.find(s => s.id === formData.strategy_type)?.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>1회 투자금 ($)</Label>
                    <Input
                      type="number"
                      value={formData.investment_amount}
                      onChange={(e) => setFormData({ ...formData, investment_amount: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>최소 싱크로율 (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.min_sync_rate}
                      onChange={(e) => setFormData({ ...formData, min_sync_rate: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">청산 조건</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>목표 수익률 (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.take_profit_pct}
                        onChange={(e) => setFormData({ ...formData, take_profit_pct: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>손절선 (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.stop_loss_pct}
                        onChange={(e) => setFormData({ ...formData, stop_loss_pct: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label>최대 보유일</Label>
                      <Input
                        type="number"
                        value={formData.max_hold_days}
                        onChange={(e) => setFormData({ ...formData, max_hold_days: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-center space-x-2 pt-6">
                      <Switch
                        checked={formData.exit_on_signal_loss}
                        onCheckedChange={(v) => setFormData({ ...formData, exit_on_signal_loss: v })}
                      />
                      <Label>신호 소멸 시 청산</Label>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  취소
                </Button>
                <Button onClick={handleCreate} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  저장
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : settings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>설정된 신호 전략이 없습니다.</p>
              <p className="text-sm">위의 &quot;전략 추가&quot; 버튼을 눌러 시작하세요.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>종목</TableHead>
                  <TableHead>전략</TableHead>
                  <TableHead>투자금</TableHead>
                  <TableHead>청산조건</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.map((setting) => (
                  <TableRow key={setting.id}>
                    <TableCell className="font-medium">{setting.symbol}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getStrategyName(setting.strategy_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>${setting.investment_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {setting.take_profit_pct && (
                        <span className="text-green-600">+{setting.take_profit_pct}%</span>
                      )}
                      {setting.take_profit_pct && setting.stop_loss_pct && ' / '}
                      {setting.stop_loss_pct && (
                        <span className="text-red-600">{setting.stop_loss_pct}%</span>
                      )}
                      {setting.max_hold_days && (
                        <span className="ml-1 text-gray-400">({setting.max_hold_days}일)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={setting.is_enabled}
                        onCheckedChange={(v) => toggleEnabled(setting.id, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(setting.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 오픈 포지션 카드 */}
      <Card className="border-emerald-500/30 bg-white">
        <CardHeader className="border-b border-emerald-200 bg-emerald-50">
          <CardTitle className="text-emerald-700">오픈 포지션</CardTitle>
          <CardDescription className="text-gray-600">신호 전략으로 진입한 현재 포지션</CardDescription>
        </CardHeader>
        <CardContent>
          {positionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>오픈된 포지션이 없습니다.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>종목</TableHead>
                  <TableHead>전략</TableHead>
                  <TableHead>진입가</TableHead>
                  <TableHead>현재가</TableHead>
                  <TableHead>손익률</TableHead>
                  <TableHead>보유일</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position) => {
                  const pnl = position.currentPnL ?? 0;
                  const isProfit = pnl >= 0;

                  return (
                    <TableRow key={position.id}>
                      <TableCell className="font-medium">{position.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getStrategyName(position.entry_signal_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>${position.entry_price.toFixed(2)}</TableCell>
                      <TableCell>
                        {position.currentPrice
                          ? `$${position.currentPrice.toFixed(2)}`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`flex items-center ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                          {isProfit ? (
                            <TrendingUp className="h-4 w-4 mr-1" />
                          ) : (
                            <TrendingDown className="h-4 w-4 mr-1" />
                          )}
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell>{position.holdDays ?? 0}일</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClosePosition(position.id)}
                        >
                          청산
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
