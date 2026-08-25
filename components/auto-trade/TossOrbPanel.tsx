'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Loader2, RefreshCw, Square } from 'lucide-react';
import type { TossOrbWorkerState } from '@/app/api/toss-orb/state/route';

const SYMBOL = '122630';
const POLL_MS = 5000;
const STALE_MS = 90_000; // 이만큼 업데이트가 없으면 "응답 없음" 경고 (장중 기준)

const STATUS_LABEL: Record<TossOrbWorkerState['status'], string> = {
  stopped: '정지됨',
  waiting: '대기 중',
  watching: '감시 중',
  in_position: '포지션 보유',
  error: '오류',
};

const STATUS_COLOR: Record<TossOrbWorkerState['status'], string> = {
  stopped: 'bg-gray-100 text-gray-600',
  waiting: 'bg-blue-50 text-blue-700',
  watching: 'bg-amber-50 text-amber-700',
  in_position: 'bg-green-50 text-green-700',
  error: 'bg-red-50 text-red-700',
};

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  return `${hr}시간 전`;
}

export function TossOrbPanel() {
  const [state, setState] = useState<TossOrbWorkerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/toss-orb/state?symbol=${SYMBOL}`);
      const data = await res.json();
      if (data.success) {
        setState(data.state);
        setError(null);
      } else {
        setError(data.error ?? '상태 조회 실패');
      }
    } catch {
      setError('상태 조회 실패 (네트워크)');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, POLL_MS);
    return () => clearInterval(id);
  }, [fetchState]);

  const handleStop = async () => {
    if (!confirm('워커를 정지할까요? 맥에서 다시 실행하기 전까지는 감시가 멈춥니다.')) return;
    setStopping(true);
    try {
      await fetch('/api/toss-orb/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: SYMBOL }),
      });
      await fetchState();
    } finally {
      setStopping(false);
    }
  };

  const isStale = state && state.status !== 'stopped' && Date.now() - new Date(state.updated_at).getTime() > STALE_MS;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-black text-gray-900">토스 ORB 워커</h2>
          <p className="text-sm text-gray-500 mt-1">종목 {SYMBOL} · 페이퍼 트레이딩 (실주문 없음) · 맥 상주 프로세스</p>
        </div>
        <button
          onClick={fetchState}
          className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
          aria-label="새로고침"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">{error}</div>
      ) : !state ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <Ban className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">아직 워커가 상태를 보고한 적이 없습니다.</p>
          <p className="text-xs text-gray-400 mt-1">맥에서 <code className="bg-gray-100 px-1.5 py-0.5 rounded">python3 python/toss_orb_watch.py --symbol {SYMBOL}</code> 를 실행해주세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {isStale && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {timeAgo(state.updated_at)}째 업데이트가 없습니다 — 맥에서 프로세스가 죽었을 수 있습니다.
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${STATUS_COLOR[state.status]}`}>
                {STATUS_LABEL[state.status]}
              </span>
              <span className="text-xs text-gray-400">{timeAgo(state.updated_at)} 업데이트</span>
            </div>

            {state.last_event && (
              <p className="text-sm text-gray-600 mb-4">{state.last_event}</p>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-gray-400 mb-1">박스 고가</div>
                <div className="font-bold tabular-nums">{state.box_high?.toLocaleString() ?? '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">박스 저가</div>
                <div className="font-bold tabular-nums">{state.box_low?.toLocaleString() ?? '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">현재가</div>
                <div className="font-bold tabular-nums">{state.last_price?.toLocaleString() ?? '-'}</div>
              </div>
            </div>

            {state.status === 'in_position' && state.position_entry != null && (
              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-xs text-gray-400 mb-1">진입가</div>
                  <div className="font-bold tabular-nums">{state.position_entry.toLocaleString()}</div>
                  <div className="text-[11px] text-gray-400">{state.position_entry_time}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">손절가</div>
                  <div className="font-bold tabular-nums text-red-500">{state.position_stop?.toLocaleString() ?? '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">평가손익</div>
                  {state.last_price != null ? (
                    <div className={`font-bold tabular-nums ${state.last_price >= state.position_entry ? 'text-emerald-600' : 'text-red-500'}`}>
                      {((state.last_price / state.position_entry - 1) * 100).toFixed(2)}%
                    </div>
                  ) : (
                    <div className="font-bold text-gray-300">-</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleStop}
            disabled={stopping || state.status === 'stopped'}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            {state.status === 'stopped' ? '이미 정지됨' : '워커 정지'}
          </button>
          <p className="text-xs text-gray-400 text-center">
            정지는 감시 루프만 멈춥니다. 다시 시작하려면 맥에서 스크립트를 직접 재실행해야 합니다.
          </p>
        </div>
      )}
    </div>
  );
}
