'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, TrendingUp, AlertCircle, RefreshCw, BarChart2, Play, CheckCircle2, XCircle, Clock, Cloud } from 'lucide-react';
import {
  MA_PERIODS, ICHIMOKU_LEVEL_DEFS, isIchimokuKey,
  type MALadderSettingWithLevels, type MAPeriod, type MALadderOrder, type IchimokuPrice,
} from '@/lib/signal-trade/ma-ladder';

type BrokerType = 'kis' | 'kiwoom';
type MarketType = 'domestic' | 'overseas';

interface SavedCredential {
  id: string;
  brokerType: BrokerType;
  accountAlias: string;
}

interface FormLevel {
  ma_period: number;
  quantity: number;
  is_enabled: boolean;
}

const DEFAULT_MA_LEVELS: FormLevel[] = MA_PERIODS.map((p) => ({
  ma_period: p,
  quantity: p <= 10 ? 1 : p <= 60 ? 2 : 3,
  is_enabled: p !== 3 && p !== 5,
}));

const DEFAULT_ICH_LEVELS: FormLevel[] = ICHIMOKU_LEVEL_DEFS.map((d) => ({
  ma_period: d.key,
  quantity: 1,
  is_enabled: false, // 기본 비활성
}));

export function MALadderPanel() {
  const [settings, setSettings] = useState<MALadderSettingWithLevels[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPrices, setPreviewPrices] = useState<{ period: MAPeriod; price: number | null }[]>([]);
  const [previewIchimoku, setPreviewIchimoku] = useState<IchimokuPrice[]>([]);
  const [previewDataSource, setPreviewDataSource] = useState<string | null>(null);
  const [previewKisError, setPreviewKisError] = useState<string | null>(null);
  const [useKisPrice, setUseKisPrice] = useState(true);

  // 설정별 실시간 MA 가격 { settingId: { period: price } }
  const [livePrices, setLivePrices] = useState<Record<string, Record<number, number | null>>>({});

  // 오늘 주문 현황
  const [todayOrders, setTodayOrders] = useState<MALadderOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // 수동 실행
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<string | null>(null);

  // 저장된 계좌 목록
  const [savedCredentials, setSavedCredentials] = useState<SavedCredential[]>([]);

  // 폼 상태
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState<MarketType>('overseas');
  const [credentialId, setCredentialId] = useState<string>('');
  const [brokerType, setBrokerType] = useState<BrokerType>('kis');
  const [levels, setLevels] = useState<FormLevel[]>([...DEFAULT_MA_LEVELS, ...DEFAULT_ICH_LEVELS]);

  const fetchTodayOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch('/api/signal-trade/ma-ladder/orders');
      const data = await res.json();
      setTodayOrders(data.orders ?? []);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const fetchLivePrices = useCallback(async (settingList: MALadderSettingWithLevels[]) => {
    const priceMap: Record<string, Record<number, number | null>> = {};
    await Promise.all(
      settingList.map(async (s) => {
        const marketParam = s.market === 'domestic' ? 'KR' : 'US';
        const credParam = s.broker_credential_id ? `&credentialId=${s.broker_credential_id}` : '';
        try {
          const res = await fetch(
            `/api/signal-trade/ma-ladder/preview?symbol=${encodeURIComponent(s.symbol)}&market=${marketParam}${credParam}`
          );
          const data = await res.json();
          priceMap[s.id] = {};
          for (const p of data.prices ?? []) {
            priceMap[s.id][p.period] = p.price;
          }
          for (const p of data.ichimokuPrices ?? []) {
            priceMap[s.id][p.key] = p.price;
          }
        } catch {
          priceMap[s.id] = {};
        }
      })
    );
    setLivePrices(priceMap);
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/signal-trade/ma-ladder/settings');
      const data = await res.json();
      const list = data.settings ?? [];
      setSettings(list);
      if (list.length > 0) fetchLivePrices(list);
    } finally {
      setLoading(false);
    }
  }, [fetchLivePrices]);

  const handleExecuteNow = async () => {
    setExecuting(true);
    setExecResult(null);
    try {
      const res = await fetch('/api/signal-trade/ma-ladder/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      const total = data.results?.reduce(
        (s: number, r: { placed?: number }) => s + (r.placed ?? 0), 0
      ) ?? 0;
      setExecResult(`완료 — ${total}건 주문 등록`);
      await fetchTodayOrders();
    } catch {
      setExecResult('실행 실패');
    } finally {
      setExecuting(false);
    }
  };

  // 저장된 계좌 목록 로드
  useEffect(() => {
    fetch('/api/broker/credentials')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          const creds: SavedCredential[] = data.data.map((c: { id: string; brokerType: string; accountAlias: string }) => ({
            id: c.id,
            brokerType: c.brokerType as BrokerType,
            accountAlias: c.accountAlias,
          }));
          setSavedCredentials(creds);
          // 계좌가 하나면 자동 선택
          if (creds.length > 0) {
            setCredentialId(creds[0].id);
            setBrokerType(creds[0].brokerType);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchTodayOrders();
  }, [fetchSettings, fetchTodayOrders]);

  const handlePreview = async (forceKis?: boolean) => {
    if (!symbol.trim()) return;
    setPreviewLoading(true);
    setPreviewPrices([]);
    try {
      const marketParam = market === 'domestic' ? 'KR' : 'US';
      const shouldUseKis = forceKis ?? useKisPrice;
      const credParam = shouldUseKis && credentialId ? `&credentialId=${credentialId}` : '';
      const res = await fetch(`/api/signal-trade/ma-ladder/preview?symbol=${encodeURIComponent(symbol.toUpperCase())}&market=${marketParam}${credParam}`);
      const data = await res.json();
      setPreviewPrices(data.prices ?? []);
      setPreviewIchimoku(data.ichimokuPrices ?? []);
      setPreviewDataSource(data.dataSource ?? null);
      setPreviewKisError(data.kisError ?? null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!symbol.trim()) {
      alert('종목 코드를 입력하세요.');
      return;
    }
    if (!credentialId && savedCredentials.length > 0) {
      alert('계좌를 선택하세요.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/signal-trade/ma-ladder/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          market,
          broker_type: brokerType,
          broker_credential_id: credentialId || null,
          levels,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');

      setIsDialogOpen(false);
      setSymbol('');
      setLevels([...DEFAULT_MA_LEVELS, ...DEFAULT_ICH_LEVELS]);
      setPreviewPrices([]);
      await fetchSettings();
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/signal-trade/ma-ladder/settings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: enabled }),
    });
    setSettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_enabled: enabled } : s))
    );
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 설정을 삭제하시겠습니까?')) return;
    await fetch(`/api/signal-trade/ma-ladder/settings/${id}`, { method: 'DELETE' });
    setSettings((prev) => prev.filter((s) => s.id !== id));
  };

  const updateLevel = (period: number, field: 'quantity' | 'is_enabled', value: number | boolean) => {
    setLevels((prev) =>
      prev.map((l) => (l.ma_period === period ? { ...l, [field]: value } : l))
    );
  };

  const getPreviewPrice = (period: MAPeriod) =>
    previewPrices.find((p) => p.period === period)?.price ?? null;

  const getIchimokuPreviewPrice = (key: number) =>
    previewIchimoku.find((p) => p.key === key)?.price ?? null;

  const currency = market === 'domestic' ? '₩' : '$';

  return (
    <div className="space-y-4">
      <Card className="border-violet-500/30 bg-white">
        <CardHeader className="flex flex-row items-center justify-between border-b border-violet-200 bg-violet-50">
          <div>
            <CardTitle className="text-violet-700 flex items-center gap-2">
              <BarChart2 className="h-5 w-5" />
              MA 계단식 자동매수
            </CardTitle>
            <CardDescription className="text-gray-600 mt-0.5">
              이동평균선(3·5·10·20·60·120·240) 가격에 매일 지정가 주문 자동 갱신
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExecuteNow}
              disabled={executing || settings.length === 0}
              className="text-violet-600 border-violet-300 hover:bg-violet-50"
            >
              {executing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
              지금 실행
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-violet-600 hover:bg-violet-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                추가
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>MA 계단식 설정 추가</DialogTitle>
                <DialogDescription>
                  종목의 이동평균선 가격에 지정가 매수 주문을 매일 자동으로 갱신합니다.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* 종목 + 시장 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">종목 코드</Label>
                    <div className="flex gap-1 mb-1">
                      {['SOXL', 'TQQQ', 'QLD'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            setSymbol(t);
                            // 입력값이 state에 반영되기 전이라 직접 symbol 값 전달
                            const marketParam = market === 'domestic' ? 'KR' : 'US';
                            const credParam = useKisPrice && credentialId ? `&credentialId=${credentialId}` : '';
                            setPreviewLoading(true);
                            setPreviewPrices([]);
                            fetch(`/api/signal-trade/ma-ladder/preview?symbol=${t}&market=${marketParam}${credParam}`)
                              .then(r => r.json())
                              .then(d => { setPreviewPrices(d.prices ?? []); setPreviewIchimoku(d.ichimokuPrices ?? []); setPreviewDataSource(d.dataSource ?? null); setPreviewKisError(d.kisError ?? null); })
                              .catch(() => {})
                              .finally(() => setPreviewLoading(false));
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                            symbol === t
                              ? 'bg-violet-600 text-white border-violet-600'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-violet-400 hover:text-violet-600'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <Input
                      placeholder="TQQQ, SOXL"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">시장</Label>
                    <Select value={market} onValueChange={(v) => setMarket(v as MarketType)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="overseas">미국 (해외)</SelectItem>
                        <SelectItem value="domestic">국내</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 계좌 선택 */}
                <div className="space-y-1.5">
                  <Label className="text-xs">계좌</Label>
                  {savedCredentials.length > 0 ? (
                    <Select
                      value={credentialId}
                      onValueChange={(v) => {
                        setCredentialId(v);
                        const cred = savedCredentials.find((c) => c.id === v);
                        if (cred) setBrokerType(cred.brokerType);
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="계좌 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {savedCredentials.map((cred) => (
                          <SelectItem key={cred.id} value={cred.id}>
                            {cred.brokerType === 'kis' ? '한투' : '키움'} —{' '}
                            {cred.accountAlias === 'default' ? '기본계좌' : cred.accountAlias}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={brokerType} onValueChange={(v) => setBrokerType(v as BrokerType)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kis">한국투자증권</SelectItem>
                        <SelectItem value="kiwoom">키움증권</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {savedCredentials.length === 0 && (
                    <p className="text-[10px] text-amber-600">
                      저장된 계좌 없음 — 자동매매 &gt; 계좌 연결에서 먼저 등록하세요.
                    </p>
                  )}
                </div>

                {/* MA 미리보기 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {/* 데이터 소스 토글 */}
                    <div className="flex items-center rounded-md border border-gray-200 overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => { setUseKisPrice(true); if (previewPrices.length > 0) handlePreview(true); }}
                        className={`px-2.5 py-1.5 font-medium transition-colors ${
                          useKisPrice ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        한투 API
                      </button>
                      <button
                        type="button"
                        onClick={() => { setUseKisPrice(false); if (previewPrices.length > 0) handlePreview(false); }}
                        className={`px-2.5 py-1.5 font-medium transition-colors border-l border-gray-200 ${
                          !useKisPrice ? 'bg-gray-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        Yahoo
                      </button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreview()}
                      disabled={!symbol.trim() || previewLoading}
                      className="text-xs"
                    >
                      {previewLoading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      )}
                      MA 가격 미리보기
                    </Button>
                    {previewPrices.length > 0 && (
                      <span className={`text-xs font-medium ${previewDataSource === 'kis' ? 'text-blue-600' : 'text-gray-500'}`}>
                        {previewDataSource === 'kis' ? '한투 기준' : 'Yahoo 기준'}
                      </span>
                    )}
                  </div>
                  {previewKisError && useKisPrice && (
                    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      한투 API 실패 → Yahoo 대체: {previewKisError}
                    </p>
                  )}
                </div>

                {/* MA 레벨 테이블 */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-4 gap-0 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 border-b">
                    <span>이평선</span>
                    <span className="text-right">현재 MA 가격</span>
                    <span className="text-center">수량 (주)</span>
                    <span className="text-center">활성</span>
                  </div>
                  {levels.filter(l => !isIchimokuKey(l.ma_period)).map((level) => {
                    const preview = getPreviewPrice(level.ma_period as MAPeriod);
                    return (
                      <div
                        key={level.ma_period}
                        className={`grid grid-cols-4 gap-0 px-3 py-2 border-b last:border-0 items-center ${
                          !level.is_enabled ? 'opacity-40' : ''
                        }`}
                      >
                        <span className="text-sm font-semibold text-violet-700">
                          MA{level.ma_period}
                        </span>
                        <span className="text-right text-sm text-gray-700 tabular-nums">
                          {preview !== null
                            ? `${currency}${preview.toLocaleString(market === 'domestic' ? 'ko-KR' : 'en-US', {
                                minimumFractionDigits: market === 'domestic' ? 0 : 2,
                                maximumFractionDigits: market === 'domestic' ? 0 : 2,
                              })}`
                            : <span className="text-gray-400 text-xs">—</span>}
                        </span>
                        <div className="flex justify-center">
                          <Input
                            type="number"
                            min="1"
                            max="999"
                            value={level.quantity}
                            onChange={(e) =>
                              updateLevel(level.ma_period, 'quantity', Math.max(1, Number(e.target.value)))
                            }
                            className="h-7 w-16 text-center text-sm"
                            disabled={!level.is_enabled}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={level.is_enabled}
                            onCheckedChange={(v) => updateLevel(level.ma_period, 'is_enabled', v)}
                            className="scale-75"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Ichimoku 레벨 테이블 */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border-b border-indigo-100">
                    <Cloud className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-xs font-bold text-indigo-700">일목균형표 구름대</span>
                    <span className="text-[10px] text-indigo-400 ml-auto">선행스팬1/2 가격에 지정가 주문</span>
                  </div>
                  <div className="grid grid-cols-4 gap-0 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 border-b">
                    <span>타임프레임</span>
                    <span className="text-right">현재 스팬 가격</span>
                    <span className="text-center">수량 (주)</span>
                    <span className="text-center">활성</span>
                  </div>
                  {ICHIMOKU_LEVEL_DEFS.map((def) => {
                    const level = levels.find(l => l.ma_period === def.key);
                    if (!level) return null;
                    const price = getIchimokuPreviewPrice(def.key);
                    return (
                      <div
                        key={def.key}
                        className={`grid grid-cols-4 gap-0 px-3 py-2 border-b last:border-0 items-center ${
                          !level.is_enabled ? 'opacity-40' : ''
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-indigo-700">{def.label}</span>
                          <span className="text-[10px] text-indigo-400">{def.sublabel}</span>
                        </div>
                        <span className="text-right text-sm text-gray-700 tabular-nums">
                          {price !== null
                            ? `${currency}${price.toLocaleString(market === 'domestic' ? 'ko-KR' : 'en-US', {
                                minimumFractionDigits: market === 'domestic' ? 0 : 2,
                                maximumFractionDigits: market === 'domestic' ? 0 : 4,
                              })}`
                            : <span className="text-gray-400 text-xs">—</span>}
                        </span>
                        <div className="flex justify-center">
                          <Input
                            type="number"
                            min="1"
                            max="999"
                            value={level.quantity}
                            onChange={(e) =>
                              updateLevel(def.key, 'quantity', Math.max(1, Number(e.target.value)))
                            }
                            className="h-7 w-16 text-center text-sm"
                            disabled={!level.is_enabled}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={level.is_enabled}
                            onCheckedChange={(v) => updateLevel(def.key, 'is_enabled', v)}
                            className="scale-75"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-400">
                  매일 미국장 개장 전 이전 미체결 주문을 취소하고 최신 MA/스팬 가격으로 재주문합니다.
                  가격이 현재가 이상이면 주문을 넣지 않습니다.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  취소
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={saving}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  저장
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : settings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">등록된 MA 계단식 설정이 없습니다.</p>
              <p className="text-xs text-gray-400 mt-1">
                위의 &quot;추가&quot; 버튼을 눌러 시작하세요.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {settings.map((setting) => {
                const activeLevels = setting.levels?.filter((l) => l.is_enabled) ?? [];
                return (
                  <div
                    key={setting.id}
                    className="p-4 border border-gray-200 rounded-xl bg-white hover:border-violet-200 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`border-0 text-xs ${
                            setting.market === 'overseas'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {setting.market === 'overseas' ? 'US' : 'KR'}
                        </Badge>
                        <span className="font-bold text-gray-900">{setting.symbol}</span>
                        <Badge variant="outline" className="text-xs text-gray-500">
                          {(() => {
                            const cred = savedCredentials.find((c) => c.id === setting.broker_credential_id);
                            if (cred) {
                              return `${cred.brokerType === 'kis' ? '한투' : '키움'} ${cred.accountAlias === 'default' ? '' : `— ${cred.accountAlias}`}`;
                            }
                            return setting.broker_type === 'kis' ? '한투' : '키움';
                          })()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={setting.is_enabled}
                          onCheckedChange={(v) => handleToggle(setting.id, v)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(setting.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </div>

                    {/* 활성 레벨 요약 */}
                    {activeLevels.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {activeLevels.map((level) => {
                          const price = livePrices[setting.id]?.[level.ma_period] ?? null;
                          const cur = setting.market === 'domestic' ? '₩' : '$';
                          const isIch = isIchimokuKey(level.ma_period);
                          const ichDef = isIch ? ICHIMOKU_LEVEL_DEFS.find(d => d.key === level.ma_period) : null;
                          return (
                            <div
                              key={level.ma_period}
                              className={`flex items-center gap-1 px-2 py-1 rounded-md border ${
                                isIch
                                  ? 'bg-indigo-50 border-indigo-200'
                                  : 'bg-violet-50 border-violet-200'
                              }`}
                            >
                              {isIch
                                ? <Cloud className="h-3 w-3 text-indigo-500" />
                                : <TrendingUp className="h-3 w-3 text-violet-500" />}
                              <span className={`text-xs font-semibold ${isIch ? 'text-indigo-700' : 'text-violet-700'}`}>
                                {isIch && ichDef
                                  ? `${ichDef.label} ${ichDef.sublabel}`
                                  : `MA${level.ma_period}`}
                              </span>
                              {price !== null ? (
                                <span className={`text-xs tabular-nums ${isIch ? 'text-indigo-600' : 'text-violet-600'}`}>
                                  {cur}{price.toLocaleString(setting.market === 'domestic' ? 'ko-KR' : 'en-US', {
                                    minimumFractionDigits: setting.market === 'domestic' ? 0 : 2,
                                    maximumFractionDigits: setting.market === 'domestic' ? 0 : 4,
                                  })} × {level.quantity}주
                                </span>
                              ) : (
                                <span className={`text-xs ${isIch ? 'text-indigo-600' : 'text-violet-600'}`}>× {level.quantity}주</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">활성화된 레벨 없음</p>
                    )}

                    {!setting.is_enabled && (
                      <p className="text-xs text-gray-400 mt-2">⏸ 일시정지됨</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 수동 실행 결과 */}
          {execResult && (
            <div className="mt-3 p-2 bg-violet-50 rounded-lg text-xs text-violet-700 text-center">
              {execResult}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 오늘 주문 현황 */}
      <Card className="border-gray-200 bg-white">
        <CardHeader className="py-3 px-4 border-b border-gray-100 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-700">오늘 주문 현황</CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchTodayOrders} disabled={ordersLoading} className="h-7 w-7 p-0">
            <RefreshCw className={`h-3.5 w-3.5 text-gray-400 ${ordersLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent className="p-3">
          {ordersLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
            </div>
          ) : todayOrders.length === 0 ? (
            <div className="text-center py-4 text-xs text-gray-400">
              <Clock className="h-5 w-5 mx-auto mb-1 opacity-40" />
              오늘 등록된 주문 없음 — 매일 09:00 KST 자동 실행 또는 &quot;지금 실행&quot; 버튼 사용
            </div>
          ) : (
            <div className="space-y-1.5">
              {todayOrders.map((order) => {
                const currency = order.symbol.match(/^\d{6}$/) ? '₩' : '$';
                const statusConfig = {
                  submitted: { icon: <Clock className="h-3.5 w-3.5 text-blue-400" />, label: '대기중', color: 'text-blue-600' },
                  filled:    { icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />, label: '체결', color: 'text-green-600' },
                  cancelled: { icon: <XCircle className="h-3.5 w-3.5 text-gray-400" />, label: '취소', color: 'text-gray-400' },
                  failed:    { icon: <XCircle className="h-3.5 w-3.5 text-red-400" />, label: '실패', color: 'text-red-500' },
                  pending:   { icon: <Clock className="h-3.5 w-3.5 text-gray-400" />, label: '대기', color: 'text-gray-400' },
                }[order.status] ?? { icon: null, label: order.status, color: 'text-gray-400' };

                return (
                  <div key={order.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-2">
                      {statusConfig.icon}
                      <span className="text-xs font-semibold text-gray-700">MA{order.ma_period}</span>
                      <span className="text-xs text-gray-500">
                        {currency}{Number(order.ma_price).toLocaleString(currency === '₩' ? 'ko-KR' : 'en-US', {
                          minimumFractionDigits: currency === '$' ? 2 : 0,
                          maximumFractionDigits: currency === '$' ? 2 : 0,
                        })} × {order.quantity}주
                      </span>
                    </div>
                    <span className={`text-[10px] font-medium ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 전략 설명 */}
      <Card className="border-gray-200 bg-white">
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">전략 원리</h4>
          <ul className="text-xs text-gray-500 space-y-1.5 list-disc list-inside">
            <li>매일 미장 개장 전 이동평균선 가격을 재계산합니다.</li>
            <li>전날 미체결 지정가 주문을 모두 취소하고, 최신 MA 가격으로 재주문합니다.</li>
            <li>가격이 MA선에 닿으면 주문이 체결됩니다.</li>
            <li>MA가 현재가 이상이면 (이미 위에 있으면) 해당 레벨 주문은 건너뜁니다.</li>
            <li>단기(MA3·MA5)는 빠른 추세선이라 기본 비활성화되어 있습니다.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
