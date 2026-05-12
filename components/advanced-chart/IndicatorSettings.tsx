'use client';

import { useRef, useState } from 'react';
import { X, Plus, HelpCircle, Check } from 'lucide-react';
import { Indicators, CustomMA } from '@/app/(dashboard)/advanced-chart/page';

interface IndicatorSettingsProps {
  indicators: Indicators;
  onIndicatorsChange: (next: Indicators) => void;
  onClose: () => void;
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────

function ColorSwatch({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="w-8 h-8 rounded-md cursor-pointer border border-[#3a3a5a] hover:border-gray-400 transition-colors"
        style={{ backgroundColor: color }}
        title="색상 변경"
      />
      <input
        ref={ref}
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="absolute opacity-0 pointer-events-none w-0 h-0 top-0 left-0"
      />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-[#3a3a5a]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// ─── MA 설정 패널 ─────────────────────────────────────────────────────

const FIXED_MAS = [
  { key: 'ma5' as const,   colorKey: 'ma5Color' as const,   period: 5,   label: '기간1' },
  { key: 'ma20' as const,  colorKey: 'ma20Color' as const,  period: 20,  label: '기간2' },
  { key: 'ma60' as const,  colorKey: 'ma60Color' as const,  period: 60,  label: '기간3' },
  { key: 'ma120' as const, colorKey: 'ma120Color' as const, period: 120, label: '기간4' },
];

const CUSTOM_MA_COLORS = ['#ec4899', '#06b6d4', '#f97316', '#a855f7', '#84cc16', '#fb923c'];

function MASettings({ indicators, onIndicatorsChange }: { indicators: Indicators; onIndicatorsChange: (n: Indicators) => void }) {
  const [addingPeriod, setAddingPeriod] = useState<number>(50);
  const [addingColor, setAddingColor] = useState(CUSTOM_MA_COLORS[0]);
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAddCustomMA = () => {
    if (addingPeriod < 1 || addingPeriod > 999) return;
    const exists = indicators.customMAs.some(m => m.period === addingPeriod);
    if (exists) return;
    onIndicatorsChange({
      ...indicators,
      customMAs: [...indicators.customMAs, {
        id: `custom-${Date.now()}`,
        period: addingPeriod,
        color: addingColor,
        enabled: true,
      }],
    });
    setAddingPeriod(50);
    setShowAddForm(false);
  };

  return (
    <div className="p-6">
      {/* 헤더 행 */}
      <div className="flex items-center gap-3 mb-4 text-xs text-[#6b7280] px-1">
        <span className="w-14">구분</span>
        <span className="w-8">색상</span>
        <span className="w-8 text-center">두께</span>
        <span className="flex-1 text-center">기준</span>
        <span className="w-16 text-center">기간</span>
        <span className="w-9 text-center">표시</span>
        <span className="w-4" />
      </div>

      {/* 고정 이평선 */}
      {FIXED_MAS.map(({ key, colorKey, period, label }) => (
        <div key={key} className="flex items-center gap-3 py-2 border-b border-[#2a2a3e]">
          <span className="w-14 text-sm text-[#9ca3af]">{label}</span>
          <ColorSwatch
            color={indicators[colorKey] || '#888'}
            onChange={(c) => onIndicatorsChange({ ...indicators, [colorKey]: c })}
          />
          <span className="w-8 text-center text-xs text-[#6b7280]">1px</span>
          <div className="flex-1 px-2 py-1 bg-[#1e1e30] rounded text-xs text-[#9ca3af] text-center">종가</div>
          <div className="w-16 px-2 py-1 bg-[#1e1e30] rounded text-sm text-[#c0c0d0] text-center">{period}</div>
          <Toggle
            checked={indicators[key]}
            onChange={(v) => onIndicatorsChange({ ...indicators, [key]: v })}
          />
          <div className="w-4" />
        </div>
      ))}

      {/* 커스텀 이평선 */}
      {indicators.customMAs.map((ma, idx) => (
        <div key={ma.id} className="flex items-center gap-3 py-2 border-b border-[#2a2a3e]">
          <span className="w-14 text-sm text-[#9ca3af]">기간{FIXED_MAS.length + idx + 1}</span>
          <ColorSwatch
            color={ma.color}
            onChange={(c) => onIndicatorsChange({
              ...indicators,
              customMAs: indicators.customMAs.map(m => m.id === ma.id ? { ...m, color: c } : m),
            })}
          />
          <span className="w-8 text-center text-xs text-[#6b7280]">1px</span>
          <div className="flex-1 px-2 py-1 bg-[#1e1e30] rounded text-xs text-[#9ca3af] text-center">종가</div>
          <input
            type="number"
            value={ma.period}
            min={1}
            max={999}
            onChange={(e) => {
              const p = Math.max(1, Math.min(999, parseInt(e.target.value) || 1));
              onIndicatorsChange({
                ...indicators,
                customMAs: indicators.customMAs.map(m => m.id === ma.id ? { ...m, period: p } : m),
              });
            }}
            className="w-16 px-2 py-1 bg-[#1e1e30] rounded text-sm text-[#c0c0d0] text-center focus:outline-none focus:ring-1 focus:ring-blue-500 border border-transparent focus:border-blue-500"
          />
          <Toggle
            checked={ma.enabled}
            onChange={(v) => onIndicatorsChange({
              ...indicators,
              customMAs: indicators.customMAs.map(m => m.id === ma.id ? { ...m, enabled: v } : m),
            })}
          />
          <button
            onClick={() => onIndicatorsChange({
              ...indicators,
              customMAs: indicators.customMAs.filter(m => m.id !== ma.id),
            })}
            className="w-4 text-[#4a4a6a] hover:text-gray-300 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      {/* 기간 추가 */}
      {showAddForm ? (
        <div className="mt-4 p-4 bg-[#1e1e30] rounded-lg border border-[#2a2a3e] space-y-3">
          <div className="flex items-center gap-3">
            <ColorSwatch color={addingColor} onChange={setAddingColor} />
            <span className="text-xs text-[#6b7280]">색상</span>
            <div className="flex gap-1.5 ml-2">
              {CUSTOM_MA_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setAddingColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${addingColor === c ? 'border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#9ca3af] w-10">기간</span>
            <input
              type="number"
              value={addingPeriod}
              min={1}
              max={999}
              onChange={(e) => setAddingPeriod(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
              className="w-24 px-3 py-1.5 bg-[#12121e] rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 border border-[#3a3a5a]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddCustomMA}
              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded transition-colors"
            >
              추가
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="flex-1 py-1.5 bg-[#2a2a3e] hover:bg-[#3a3a5a] text-[#9ca3af] text-sm rounded transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-4 flex items-center gap-2 text-sm text-[#6b7280] hover:text-white transition-colors group"
        >
          <div className="w-6 h-6 rounded-full bg-[#2a2a3e] group-hover:bg-blue-600 flex items-center justify-center transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </div>
          기간 추가
        </button>
      )}
    </div>
  );
}

// ─── 볼린저 밴드 설정 ────────────────────────────────────────────────

function BBSettings({ indicators, onIndicatorsChange }: { indicators: Indicators; onIndicatorsChange: (n: Indicators) => void }) {
  return (
    <div className="p-6 space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#9ca3af] w-28">이동평균 기간</span>
          <div className="flex-1 px-3 py-2 bg-[#1e1e30] rounded border border-[#2a2a3e] text-sm text-[#6b7280]">20</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#9ca3af] w-28">표준편차</span>
          <div className="flex-1 px-3 py-2 bg-[#1e1e30] rounded border border-[#2a2a3e] text-sm text-[#6b7280]">2</div>
        </div>
      </div>
      <div className="border-t border-[#2a2a3e] pt-4 space-y-3">
        {[
          { label: '상한선', color: '#8b5cf6' },
          { label: '중간선', color: '#c084fc' },
          { label: '하한선', color: '#8b5cf6' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-sm text-[#9ca3af] flex-1">{label}</span>
            <div className="w-8 h-8 rounded-md border border-[#3a3a5a]" style={{ backgroundColor: color }} />
            <span className="text-xs text-[#6b7280] w-8 text-center">1px</span>
            <Toggle
              checked={indicators.bollingerBands}
              onChange={(v) => onIndicatorsChange({ ...indicators, bollingerBands: v })}
            />
          </div>
        ))}
      </div>
      <div className="text-xs text-[#4a4a6a] mt-2">* 색상 편집은 준비 중입니다</div>
    </div>
  );
}

// ─── RSI 설정 ────────────────────────────────────────────────────────

function RSISettings({ indicators, onIndicatorsChange }: { indicators: Indicators; onIndicatorsChange: (n: Indicators) => void }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#9ca3af] w-28">기간</span>
        <div className="flex-1 px-3 py-2 bg-[#1e1e30] rounded border border-[#2a2a3e] text-sm text-[#6b7280]">14</div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#9ca3af] flex-1">RSI 선</span>
        <div className="w-8 h-8 rounded-md border border-[#3a3a5a]" style={{ backgroundColor: '#f43f5e' }} />
        <span className="text-xs text-[#6b7280] w-8 text-center">2px</span>
        <Toggle
          checked={indicators.rsi}
          onChange={(v) => onIndicatorsChange({ ...indicators, rsi: v })}
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#9ca3af] flex-1">과매수선 (70)</span>
        <div className="w-8 h-8 rounded-md border border-[#3a3a5a]" style={{ backgroundColor: '#d1d5db' }} />
        <span className="text-xs text-[#6b7280] w-8 text-center">1px</span>
        <Toggle checked={true} onChange={() => {}} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#9ca3af] flex-1">과매도선 (30)</span>
        <div className="w-8 h-8 rounded-md border border-[#3a3a5a]" style={{ backgroundColor: '#d1d5db' }} />
        <span className="text-xs text-[#6b7280] w-8 text-center">1px</span>
        <Toggle checked={true} onChange={() => {}} />
      </div>
    </div>
  );
}

// ─── MACD 설정 ───────────────────────────────────────────────────────

function MACDSettings({ indicators, onIndicatorsChange }: { indicators: Indicators; onIndicatorsChange: (n: Indicators) => void }) {
  return (
    <div className="p-6 space-y-4">
      <div className="space-y-3">
        {[
          { label: '단기', value: '12' },
          { label: '장기', value: '26' },
          { label: '시그널', value: '9' },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-sm text-[#9ca3af] w-28">{label}</span>
            <div className="flex-1 px-3 py-2 bg-[#1e1e30] rounded border border-[#2a2a3e] text-sm text-[#6b7280]">{value}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#2a2a3e] pt-4 space-y-3">
        {[
          { label: 'MACD 선', color: '#06b6d4' },
          { label: '시그널 선', color: '#f59e0b' },
          { label: '히스토그램', color: '#6b7280' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-sm text-[#9ca3af] flex-1">{label}</span>
            <div className="w-8 h-8 rounded-md border border-[#3a3a5a]" style={{ backgroundColor: color }} />
            <span className="text-xs text-[#6b7280] w-8 text-center">2px</span>
            <Toggle
              checked={indicators.macd}
              onChange={(v) => onIndicatorsChange({ ...indicators, macd: v })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 거래량 설정 ─────────────────────────────────────────────────────

function VolumeSettings({ indicators, onIndicatorsChange }: { indicators: Indicators; onIndicatorsChange: (n: Indicators) => void }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#9ca3af] flex-1">거래량 막대</span>
        <div className="w-8 h-8 rounded-md border border-[#3a3a5a]" style={{ backgroundColor: 'rgba(99,102,241,0.5)' }} />
        <span className="text-xs text-[#6b7280] w-8" />
        <Toggle
          checked={indicators.volume}
          onChange={(v) => onIndicatorsChange({ ...indicators, volume: v })}
        />
      </div>
    </div>
  );
}

// ─── 일목균형표 설정 ─────────────────────────────────────────────────

function IchimokuSettings({ indicators, onIndicatorsChange }: { indicators: Indicators; onIndicatorsChange: (n: Indicators) => void }) {
  const lines: { colorKey: keyof Indicators; defaultColor: string; label: string; desc: string }[] = [
    { colorKey: 'ichimokuTenkanColor',  defaultColor: '#ef4444', label: '전환선',    desc: '9일 고저 중간선 (단기 추세)' },
    { colorKey: 'ichimokuKijunColor',   defaultColor: '#3b82f6', label: '기준선',    desc: '26일 고저 중간선 (중기 추세)' },
    { colorKey: 'ichimokuSenkouAColor', defaultColor: '#22c55e', label: '선행스팬 A', desc: '(전환+기준)/2, 26봉 선행' },
    { colorKey: 'ichimokuSenkouBColor', defaultColor: '#f97316', label: '선행스팬 B', desc: '52일 고저 중간선, 26봉 선행' },
    { colorKey: 'ichimokuChikouColor',  defaultColor: '#a855f7', label: '후행스팬',   desc: '종가를 26봉 뒤에 표시' },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* 마스터 토글 */}
      <div className="flex items-center gap-3 pb-3 border-b border-[#2a2a3e]">
        <span className="text-sm text-[#9ca3af] flex-1 font-medium">일목균형표 표시</span>
        <Toggle
          checked={indicators.ichimoku}
          onChange={(v) => onIndicatorsChange({ ...indicators, ichimoku: v })}
        />
      </div>

      {/* 개별 선 색상 */}
      <div className="space-y-3">
        <p className="text-xs text-[#4a4a6a] uppercase tracking-wider">선 색상</p>
        {lines.map(({ colorKey, defaultColor, label, desc }) => (
          <div key={colorKey} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-sm text-[#9ca3af]">{label}</span>
              <p className="text-[10px] text-[#4a4a6a] mt-0.5 truncate">{desc}</p>
            </div>
            <ColorSwatch
              color={(indicators[colorKey] as string | undefined) ?? defaultColor}
              onChange={(c) => onIndicatorsChange({ ...indicators, [colorKey]: c })}
            />
          </div>
        ))}
      </div>

      {/* 구름대 안내 */}
      <div className="p-3 bg-[#1a1a2a] rounded-lg border border-[#2a2a3e] space-y-1">
        <p className="text-xs text-[#6b7280] font-medium">구름대 (쿠모)</p>
        <p className="text-[11px] text-[#4a4a6a]">선행A &gt; B → 상승 구름 <span className="text-green-500">●</span></p>
        <p className="text-[11px] text-[#4a4a6a]">선행A &lt; B → 하락 구름 <span className="text-red-500">●</span></p>
        <p className="text-[11px] text-[#4a4a6a] mt-1">구름대 색상은 자동으로 결정됩니다</p>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────

type IndicatorId = 'ma' | 'bb' | 'rsi' | 'macd' | 'volume' | 'ichimoku';

const INDICATOR_LIST: { id: IndicatorId; label: string; desc: string }[] = [
  { id: 'ma',       label: '이동평균선',   desc: '지난 n일 동안 주가 평균값을 이은 선' },
  { id: 'bb',       label: '볼린저 밴드',  desc: '주가 변동성의 추이를 파악할 수 있는 밴드 모양의 지표' },
  { id: 'rsi',      label: 'RSI',         desc: '상대강도지수 — 과매수/과매도 구간을 파악하는 지표 (기간 14)' },
  { id: 'macd',     label: 'MACD',        desc: '이동평균 수렴발산지수 (12, 26, 9)' },
  { id: 'volume',   label: '거래량',       desc: '일별 거래량 막대 차트' },
  { id: 'ichimoku', label: '일목균형표',   desc: '전환선·기준선·선행스팬A/B·후행스팬 + 구름대' },
];

function isIndicatorActive(id: IndicatorId, indicators: Indicators): boolean {
  switch (id) {
    case 'ma':       return indicators.ma5 || indicators.ma20 || indicators.ma60 || indicators.ma120 || indicators.customMAs.some(m => m.enabled);
    case 'bb':       return indicators.bollingerBands;
    case 'rsi':      return indicators.rsi;
    case 'macd':     return indicators.macd;
    case 'volume':   return indicators.volume;
    case 'ichimoku': return indicators.ichimoku;
  }
}

export function IndicatorSettings({ indicators, onIndicatorsChange, onClose }: IndicatorSettingsProps) {
  const [selected, setSelected] = useState<IndicatorId>('ma');

  const renderSettings = () => {
    switch (selected) {
      case 'ma':       return <MASettings indicators={indicators} onIndicatorsChange={onIndicatorsChange} />;
      case 'bb':       return <BBSettings indicators={indicators} onIndicatorsChange={onIndicatorsChange} />;
      case 'rsi':      return <RSISettings indicators={indicators} onIndicatorsChange={onIndicatorsChange} />;
      case 'macd':     return <MACDSettings indicators={indicators} onIndicatorsChange={onIndicatorsChange} />;
      case 'volume':   return <VolumeSettings indicators={indicators} onIndicatorsChange={onIndicatorsChange} />;
      case 'ichimoku': return <IchimokuSettings indicators={indicators} onIndicatorsChange={onIndicatorsChange} />;
    }
  };

  const selectedMeta = INDICATOR_LIST.find(i => i.id === selected)!;

  return (
    <>
      {/* 반투명 배경 */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      {/* 패널 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto flex rounded-xl overflow-hidden shadow-2xl border border-[#2a2a40]"
          style={{ width: 820, height: 560, background: '#12121e' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 좌측 사이드바 */}
          <div className="w-60 flex-shrink-0 flex flex-col border-r border-[#2a2a40]" style={{ background: '#1a1a2a' }}>
            <div className="px-5 py-4 border-b border-[#2a2a40]">
              <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">상단 지표</span>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {INDICATOR_LIST.map(({ id, label }) => {
                const active = isIndicatorActive(id, indicators);
                const isSelected = selected === id;
                return (
                  <button
                    key={id}
                    onClick={() => setSelected(id)}
                    className={`w-full flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors text-left ${
                      isSelected
                        ? 'bg-[#2a2a3e] text-white'
                        : 'text-[#9ca3af] hover:bg-[#1e1e30] hover:text-white'
                    }`}
                  >
                    {label}
                    {active ? (
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-[#3a3a5a] flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 우측 설정 패널 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 우측 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a40]">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white">{selectedMeta.label}</span>
                <HelpCircle className="w-4 h-4 text-[#4a4a6a]" />
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[#2a2a3e] text-[#6b7280] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-[#6b7280] px-6 pt-2 pb-0">{selectedMeta.desc}</div>

            {/* 설정 내용 */}
            <div className="flex-1 overflow-y-auto">
              {renderSettings()}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
