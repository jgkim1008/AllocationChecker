'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, RefreshCw, TrendingDown, Sparkles, Loader2, Clock, Pencil, X, FlaskConical } from 'lucide-react';
import { useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type SavedCredential = {
  id: string;
  brokerType: string;
  accountAlias: string;
};

type BacktestResult = {
  symbol: string;
  period: { from: string; to: string; tradingDays: number };
  strategy: { threshold1_pct: number; threshold2_pct: number; qty1: number; qty2: number; totalDailyQty: number };
  dca: { totalInvested: number; totalShares: number; avgCost: number; currentValue: number; totalReturn: number; cagr: number; mdd: number };
  simple: { totalInvested: number; totalShares: number; avgCost: number; currentValue: number; totalReturn: number; cagr: number; mdd: number };
  chartData: { date: string; dcaReturn: number; simpleReturn: number; dcaInvested: number; simpleInvested: number }[];
};

type DCASettings = {
  id: string;
  symbol: string;
  broker_type: string;
  broker_credential_id: string | null;
  market: string;
  daily_quantity: number;
  threshold1_pct: number;
  threshold2_pct: number;
  is_enabled: boolean;
  broker_credentials: { id: string; broker_type: string; account_alias: string } | null;
};

type DCAOrder = {
  id: string;
  symbol: string;
  order_type: string;
  order_quantity: number;
  order_price: number;
  status: string;
  filled_quantity: number;
  filled_price: number | null;
  reason: string;
  order_time: string;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  submitted: { label: '대기', color: 'bg-yellow-100 text-yellow-700' },
  partial: { label: '일부체결', color: 'bg-blue-100 text-blue-700' },
  filled: { label: '체결', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500' },
  expired: { label: '만료', color: 'bg-gray-100 text-gray-500' },
};

export default function DCAPanel() {
  const [settings, setSettings] = useState<DCASettings[]>([]);
  const [todayOrders, setTodayOrders] = useState<DCAOrder[]>([]);
  const [savedCredentials, setSavedCredentials] = useState<SavedCredential[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // 신규 설정 폼
  const [form, setForm] = useState({
    symbol: '418660',
    broker_credential_id: '',
    market: 'domestic',
    daily_quantity: '1',
    threshold1_pct: '-1',
    threshold2_pct: '-2',
    order_mode: 'threshold' as 'threshold' | 'loc_only',
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiReasoning, setAiReasoning] = useState('');
  const [backtesting, setBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const fetchCredentials = async () => {
    try {
      const res = await fetch('/api/broker/credentials');
      const data = await res.json();
      if (data.success) {
        const creds = data.data || [];
        setSavedCredentials(creds);
        // 계좌가 하나뿐이면 자동 선택
        if (creds.length === 1 && !form.broker_credential_id) {
          setForm(f => ({ ...f, broker_credential_id: creds[0].id }));
        }
      }
    } catch {}
  };

  const fetchSettings = async () => {
    setLoadingSettings(true);
    try {
      const res = await fetch('/api/auto-trade/dca/settings');
      const data = await res.json();
      if (data.success) setSettings(data.data);
    } finally {
      setLoadingSettings(false);
    }
  };

  const fetchTodayOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch('/api/auto-trade/dca');
      const data = await res.json();
      if (data.success) setTodayOrders(data.data.orders);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
    fetchSettings();
    fetchTodayOrders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnalyze = async () => {
    if (!form.symbol) return;
    setAnalyzing(true);
    setAiReasoning('');
    setBacktestResult(null);
    try {
      const res = await fetch(`/api/auto-trade/dca/analyze?symbol=${form.symbol}&market=${form.market}`);
      const data = await res.json();
      if (data.success) {
        const { threshold1_pct, threshold2_pct, reasoning } = data.data.recommendation;
        setForm(f => ({
          ...f,
          threshold1_pct: String(threshold1_pct),
          threshold2_pct: String(threshold2_pct),
        }));
        setAiReasoning(reasoning);
        // AI 추천 후 자동으로 백테스팅 실행
        await runBacktest(form.symbol, form.market, threshold1_pct, threshold2_pct, parseInt(form.daily_quantity));
      } else {
        setAiReasoning(`분석 실패: ${data.error}`);
      }
    } catch {
      setAiReasoning('AI 분석 중 오류가 발생했습니다.');
    } finally {
      setAnalyzing(false);
    }
  };

  const runBacktest = async (
    symbol: string,
    market: string,
    threshold1_pct: number,
    threshold2_pct: number,
    daily_quantity: number
  ) => {
    setBacktesting(true);
    try {
      const params = new URLSearchParams({
        symbol,
        market,
        threshold1_pct: String(threshold1_pct),
        threshold2_pct: String(threshold2_pct),
        daily_quantity: String(daily_quantity),
      });
      const res = await fetch(`/api/auto-trade/dca/backtest?${params}`);
      const data = await res.json();
      if (data.success) {
        setBacktestResult(data.data);
      }
    } catch {
      // 백테스팅 오류는 조용히 무시
    } finally {
      setBacktesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/auto-trade/dca/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          daily_quantity: parseFloat(form.daily_quantity),
          threshold1_pct: parseFloat(form.threshold1_pct),
          threshold2_pct: parseFloat(form.threshold2_pct),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMsg(editingId ? '수정 완료' : '저장 완료');
        setEditingId(null);
        setForm(f => ({ symbol: '', broker_credential_id: f.broker_credential_id, market: 'overseas', daily_quantity: '1', threshold1_pct: '-1', threshold2_pct: '-2', order_mode: 'threshold' }));
        fetchSettings();
      } else {
        setSaveMsg(data.error || '저장 실패');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (s: DCASettings) => {
    setEditingId(s.id);
    setForm({
      symbol: s.symbol,
      broker_credential_id: s.broker_credential_id || '',
      market: s.market,
      daily_quantity: String(s.daily_quantity),
      threshold1_pct: String(s.threshold1_pct),
      threshold2_pct: String(s.threshold2_pct),
      order_mode: ((s as any).order_mode ?? 'threshold') as 'threshold' | 'loc_only',
    });
    setAiReasoning('');
    setSaveMsg('');
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm({ symbol: '', broker_credential_id: form.broker_credential_id, market: 'overseas', daily_quantity: '1', threshold1_pct: '-1', threshold2_pct: '-2', order_mode: 'threshold' });
    setSaveMsg('');
  };

  const handleDelete = async (symbol: string) => {
    if (!confirm(`${symbol} DCA 설정을 삭제할까요?`)) return;
    await fetch(`/api/auto-trade/dca/settings?symbol=${symbol}`, { method: 'DELETE' });
    fetchSettings();
  };

  const handleToggle = async (setting: DCASettings) => {
    setTogglingId(setting.id);
    setToggleError(null);
    try {
      const res = await fetch('/api/auto-trade/dca/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: setting.symbol,
          broker_credential_id: setting.broker_credential_id,
          market: setting.market,
          daily_quantity: setting.daily_quantity,
          threshold1_pct: setting.threshold1_pct,
          threshold2_pct: setting.threshold2_pct,
          is_enabled: !setting.is_enabled,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setToggleError(data.error || '설정 변경에 실패했습니다.');
        return;
      }
      await fetchSettings();
    } catch {
      setToggleError('서버 오류가 발생했습니다.');
    } finally {
      setTogglingId(null);
    }
  };

  const getScheduleText = (market: string) => {
    if (market === 'domestic') {
      return '매일 09:05 지정가 · 15:20 LOC 폴백 자동 실행';
    }
    return '매일 10:30 지정가 · 04:30(서머)/05:30(겨울) LOC 폴백 자동 실행';
  };

  const handleRunMorning = async (market: string) => {
    const res = await fetch(`/api/auto-trade/dca/cron/morning?market=${market}`);
    const data = await res.json();
    alert(data.data?.results?.map((r: any) => `${r.symbol}: ${r.message}`).join('\n') || data.message);
    fetchTodayOrders();
  };

  const handleRunPreclose = async (market: string) => {
    const res = await fetch(`/api/auto-trade/dca/cron/preclose?market=${market}`);
    const data = await res.json();
    alert(data.data?.results?.map((r: any) => `${r.symbol}: ${r.message}`).join('\n') || data.message);
    fetchTodayOrders();
  };

  return (
    <div className="space-y-4">
      {/* 설정 추가/수정 */}
      <Card ref={formRef}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4 text-green-600" />
            {editingId ? 'DCA 전략 수정' : 'DCA 전략 설정'}
          </CardTitle>
          <CardDescription>
            {editingId ? '값을 수정한 후 저장을 누르세요.' : '전일 종가 기준 지정가 매수 + LOC 폴백'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">종목 코드</Label>
              <Input
                placeholder="예: SOXL"
                value={form.symbol}
                onChange={e => !editingId && setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                className="h-8 text-sm"
                readOnly={!!editingId}
              />
            </div>
            <div>
              <Label className="text-xs">시장</Label>
              <Select value={form.market} onValueChange={v => setForm(f => ({ ...f, market: v }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overseas">미국 (해외)</SelectItem>
                  <SelectItem value="domestic">국내</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">계좌</Label>
              <Select
                value={form.broker_credential_id}
                onValueChange={v => setForm(f => ({ ...f, broker_credential_id: v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="계좌 선택" />
                </SelectTrigger>
                <SelectContent>
                  {savedCredentials.length === 0 ? (
                    <SelectItem value="__none__" disabled>저장된 계좌 없음</SelectItem>
                  ) : (
                    savedCredentials.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.brokerType === 'kis' ? '한투' : '키움'}
                        {c.accountAlias !== 'default' ? ` · ${c.accountAlias}` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">일일 매수량 (주)</Label>
              <Input
                type="number"
                min="1"
                value={form.daily_quantity}
                onChange={e => setForm(f => ({ ...f, daily_quantity: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            {form.order_mode === 'threshold' && (
              <>
                <div>
                  <Label className="text-xs">1차 지정가 (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.threshold1_pct}
                    onChange={e => setForm(f => ({ ...f, threshold1_pct: e.target.value }))}
                    className="h-8 text-sm"
                    placeholder="-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">2차 지정가 (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.threshold2_pct}
                    onChange={e => setForm(f => ({ ...f, threshold2_pct: e.target.value }))}
                    className="h-8 text-sm"
                    placeholder="-2"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, order_mode: f.order_mode === 'loc_only' ? 'threshold' : 'loc_only' }))}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.order_mode === 'loc_only' ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${form.order_mode === 'loc_only' ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
            <Label className="text-xs text-gray-600 cursor-pointer" onClick={() => setForm(f => ({ ...f, order_mode: f.order_mode === 'loc_only' ? 'threshold' : 'loc_only' }))}>
              임계값 없이 LOC만
            </Label>
            {form.order_mode === 'loc_only' && (
              <span className="text-xs text-green-600 font-medium">매일 종가에 {form.daily_quantity}주 자동 매수</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handleAnalyze}
              disabled={analyzing || !form.symbol}
              className="h-8 border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {analyzing ? 'AI 분석 중...' : 'AI 추천'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runBacktest(form.symbol, form.market, parseFloat(form.threshold1_pct), parseFloat(form.threshold2_pct), parseInt(form.daily_quantity))}
              disabled={backtesting || !form.symbol}
              className="h-8 border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <FlaskConical className="h-3 w-3 mr-1" />
              {backtesting ? '시뮬레이션 중...' : '백테스팅'}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !form.symbol}
              className="h-8"
            >
              {editingId ? <Pencil className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              {saving ? '저장 중...' : editingId ? '수정 저장' : '추가'}
            </Button>
            {editingId && (
              <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-8 text-gray-500">
                <X className="h-3 w-3 mr-1" />취소
              </Button>
            )}
            {saveMsg && <span className="text-xs text-gray-500">{saveMsg}</span>}
          </div>
          {aiReasoning && (
            <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
              <p className="text-xs text-purple-700 leading-relaxed">
                <span className="font-medium">AI 분석: </span>{aiReasoning}
              </p>
            </div>
          )}

          {/* 백테스팅 섹션 */}
          {(backtesting || backtestResult) && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-700">3년 백테스팅 결과</span>
                {backtesting && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
              </div>

              {backtesting && !backtestResult && (
                <p className="text-xs text-gray-400">시뮬레이션 중...</p>
              )}

              {backtestResult && !backtesting && (
                <>
                  {/* 메트릭 비교 */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* DCA 전략 */}
                    <div className="rounded-md border border-blue-100 bg-blue-50 p-2 space-y-1">
                      <p className="text-xs font-medium text-blue-700">
                        DCA ({backtestResult.strategy.threshold1_pct}% / {backtestResult.strategy.threshold2_pct}%) + LOC
                      </p>
                      <div className="text-xs text-blue-600 space-y-0.5">
                        <div className="flex justify-between">
                          <span>수익률</span>
                          <span className={`font-medium ${backtestResult.dca.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {backtestResult.dca.totalReturn >= 0 ? '+' : ''}{backtestResult.dca.totalReturn.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>CAGR</span>
                          <span className={`font-medium ${backtestResult.dca.cagr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {backtestResult.dca.cagr >= 0 ? '+' : ''}{backtestResult.dca.cagr.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>MDD</span>
                          <span className="font-medium text-red-500">-{backtestResult.dca.mdd.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>평균단가</span>
                          <span className="font-medium">{backtestResult.dca.avgCost.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* 단순 LOC */}
                    <div className="rounded-md border border-gray-200 bg-white p-2 space-y-1">
                      <p className="text-xs font-medium text-gray-600">단순 LOC (매일 종가 매수)</p>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <div className="flex justify-between">
                          <span>수익률</span>
                          <span className={`font-medium ${backtestResult.simple.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {backtestResult.simple.totalReturn >= 0 ? '+' : ''}{backtestResult.simple.totalReturn.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>CAGR</span>
                          <span className={`font-medium ${backtestResult.simple.cagr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {backtestResult.simple.cagr >= 0 ? '+' : ''}{backtestResult.simple.cagr.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>MDD</span>
                          <span className="font-medium text-red-500">-{backtestResult.simple.mdd.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>평균단가</span>
                          <span className="font-medium">{backtestResult.simple.avgCost.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 포트폴리오 가치 차트 */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      포트폴리오 가치 ({backtestResult.period.from} ~ {backtestResult.period.to})
                    </p>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart
                        data={backtestResult.chartData.filter((_, i) => i % 5 === 0)}
                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 9 }}
                          tickFormatter={v => v.slice(2, 7)}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 9 }}
                          tickFormatter={v => `${v}%`}
                          width={42}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 10 }}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => `${Number(value).toFixed(2)}%`}
                          labelFormatter={l => String(l)}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => v === 'dcaReturn' ? 'DCA+LOC' : '단순 LOC'} />
                        <Line type="monotone" dataKey="dcaReturn" stroke="#3b82f6" dot={false} strokeWidth={1.5} name="dcaReturn" />
                        <Line type="monotone" dataKey="simpleReturn" stroke="#eab308" dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="simpleReturn" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 전략 해설 */}
                  <div className="rounded-md border border-amber-100 bg-amber-50 p-2.5 space-y-1.5">
                    <p className="text-xs font-medium text-amber-700">💡 단순 LOC가 더 유리할 수 있는 이유</p>
                    <p className="text-xs text-amber-600 leading-relaxed">
                      지정가 −{Math.abs(backtestResult.strategy.threshold1_pct)}%에 체결됐다는 건 그날 주가가 그만큼 빠졌다는 뜻입니다.
                      하락 추세가 이어진 날에는 종가가 지정가보다 더 내려가 LOC가 더 낮은 가격에 매수하게 됩니다.
                    </p>
                    <div className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-700 font-mono">
                      예) 전일종가 38,000 → 지정가 체결 37,620원 → 당일 종가 37,000원<br />
                      DCA: 37,620원 매수 &nbsp;|&nbsp; LOC: 37,000원 매수 (622원 유리)
                    </div>
                    <p className="text-xs text-amber-600 leading-relaxed">
                      DCA 지정가 전략은 <span className="font-medium">장중 저점 이후 반등하는 종목</span>이나
                      <span className="font-medium"> 변동성이 큰 종목</span>에서 효과가 두드러집니다.
                      ETF처럼 하락 시 당일 추가 하락이 잦은 종목은 단순 LOC가 평단 측면에서 유리할 수 있습니다.
                    </p>
                  </div>

                  {/* 레버리지/고변동성 ETF 해설 */}
                  <div className="rounded-md border border-blue-100 bg-blue-50 p-2.5 space-y-1.5">
                    <p className="text-xs font-medium text-blue-700">📌 레버리지·고변동성 ETF는 임계값 조정이 핵심</p>
                    <p className="text-xs text-blue-600 leading-relaxed">
                      QLD(나스닥 2배) 같은 레버리지 ETF는 장중 급락 후 당일 반등하는 패턴이 잦아 장중 저점 매수가 유리할 수 있습니다.
                      그러나 국내 상장 ETF는 <span className="font-medium">미국 야간 움직임이 갭으로 반영</span>되어 장 시작부터 이미 큰 폭 하락한 상태로 시작하는 경우가 많습니다.
                    </p>
                    <p className="text-xs text-blue-600 leading-relaxed">
                      이 경우 전일종가 기준 −{Math.abs(backtestResult.strategy.threshold1_pct)}% 지정가는 갭다운 이후 가격보다 높아 체결이 안 되거나,
                      갭다운 추세가 계속되어 LOC가 더 유리해집니다.
                    </p>
                    <div className="rounded bg-blue-100 px-2 py-1.5 text-xs text-blue-700 space-y-0.5">
                      <p className="font-medium">현재 임계값 {backtestResult.strategy.threshold1_pct}% / {backtestResult.strategy.threshold2_pct}% → 권장 조정</p>
                      <p>• 레버리지 ETF: <span className="font-medium">−2% / −4%</span> 또는 <span className="font-medium">−3% / −5%</span></p>
                      <p>• 개별 고변동성 종목: <span className="font-medium">−2% / −3%</span></p>
                      <p className="text-blue-500">→ 임계값을 넓히면 갭다운 후에도 체결 가능성이 높아지고, 더 낮은 가격에 매수할 수 있습니다.</p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">
                    * 백테스팅은 과거 데이터 기준 시뮬레이션이며 미래 수익을 보장하지 않습니다. 세금/수수료 미포함.
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 스케줄러 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-gray-500" />
            자동매매 스케줄러
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {toggleError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span>⚠️</span>
              <span>{toggleError}</span>
              <button onClick={() => setToggleError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
            </div>
          )}
          {settings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              위에서 종목을 추가하면 스케줄러가 여기에 표시됩니다
            </p>
          ) : (
            settings.map(s => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                  s.is_enabled ? 'border-emerald-300 bg-white' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{s.symbol}</span>
                    <span className="text-xs text-gray-400">{s.market === 'overseas' ? '미국' : '국내'}</span>
                    {s.broker_credentials && (
                      <span className="text-xs text-gray-400">
                        {s.broker_credentials.broker_type === 'kis' ? '한투' : '키움'}
                        {s.broker_credentials.account_alias !== 'default' ? ` · ${s.broker_credentials.account_alias}` : ''}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">일 {s.daily_quantity}주</span>
                    {(s as any).order_mode === 'loc_only'
                      ? <span className="text-xs text-green-600 font-medium">LOC 전용</span>
                      : <span className="text-xs text-red-500">{s.threshold1_pct}% / {s.threshold2_pct}%</span>
                    }
                    {s.is_enabled ? (
                      <Badge className="bg-emerald-500 text-white text-xs border-0">ON</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-400 text-xs">OFF</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.is_enabled ? getScheduleText(s.market) : '비활성 상태 — 자동 실행 안 됨'}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  <Button
                    size="sm"
                    variant={s.is_enabled ? 'destructive' : 'default'}
                    onClick={() => handleToggle(s)}
                    disabled={togglingId === s.id}
                    className={`h-7 text-xs ${!s.is_enabled ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : ''}`}
                  >
                    {togglingId === s.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : s.is_enabled ? '해제' : '활성화'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-blue-400 hover:text-blue-600"
                    onClick={() => handleEdit(s)}
                    disabled={!!togglingId}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDelete(s.symbol)}
                  >
                    <Trash2 className="h-3 w-3 text-gray-400" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 오늘 주문 현황 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">오늘 주문 현황</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRunMorning(settings[0]?.market || 'overseas')}>
                지정가 실행
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRunPreclose(settings[0]?.market || 'overseas')}>
                LOC 폴백
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchTodayOrders} disabled={loadingOrders}>
                <RefreshCw className={`h-3 w-3 ${loadingOrders ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {todayOrders.length === 0 ? (
            <p className="text-sm text-gray-500 p-4 text-center">오늘 DCA 주문 없음</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">종목</TableHead>
                  <TableHead className="text-xs">유형</TableHead>
                  <TableHead className="text-xs">주문가</TableHead>
                  <TableHead className="text-xs">수량</TableHead>
                  <TableHead className="text-xs">체결가</TableHead>
                  <TableHead className="text-xs">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todayOrders.map(o => {
                  const st = STATUS_LABEL[o.status] || { label: o.status, color: 'bg-gray-100 text-gray-500' };
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="text-sm font-medium">{o.symbol}</TableCell>
                      <TableCell className="text-xs">
                        {o.order_type === 'loc' ? (
                          <span className="text-blue-600">LOC</span>
                        ) : (
                          <span className="text-orange-600">{o.reason?.match(/([-\d.]+)%/)?.[0] || '지정가'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">${o.order_price.toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{o.order_quantity}</TableCell>
                      <TableCell className="text-xs">
                        {o.filled_price ? `$${o.filled_price.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
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
