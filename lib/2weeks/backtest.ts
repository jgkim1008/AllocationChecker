/**
 * 2WEEKS 전략 백테스트 엔진
 *
 * 월초 배당 ETF + 월중순 배당 ETF 조합의 복리 재투자 시뮬레이션
 */

// 지수 연평균 수익률 (배당 재투자 기준, 역사적 평균)
const INDEX_RETURNS = {
  SP500: 10.5,      // S&P 500: 연평균 약 10.5%
  NASDAQ100: 14.0,  // 나스닥 100: 연평균 약 14%
};

export interface TwoWeeksBacktestParams {
  principal: number;           // 초기 투자금 (원)
  monthlyDeposit?: number;     // 월 추가 납입금 (원)
  earlyRatio: number;          // 월초 ETF 비율 (0-100)
  earlyYield: number;          // 월초 ETF 연 분배율 (%)
  midYield: number;            // 월중순 ETF 연 분배율 (%)
  reinvestRate: number;        // 재투자율 (0-100), 100이면 전액 재투자
  months: number;              // 시뮬레이션 기간 (개월)
  earlyGrowth?: number;        // 월초 ETF 연간 주가 성장률 (%)
  midGrowth?: number;          // 월중순 ETF 연간 주가 성장률 (%)
  taxRate?: number;            // 배당소득세율 (%, 미국 ETF용)
  sp500Return?: number;        // S&P 500 연수익률 (기본 10.5%)
  nasdaq100Return?: number;    // 나스닥 100 연수익률 (기본 14%)
}

export interface MonthlySnapshot {
  month: number;
  earlyValue: number;          // 월초 ETF 평가금액
  midValue: number;            // 월중순 ETF 평가금액
  totalValue: number;          // 총 평가금액
  earlyDividend: number;       // 월초 배당금
  midDividend: number;         // 월중순 배당금
  totalDividend: number;       // 월 총 배당금
  cumDividend: number;         // 누적 배당금
  cashBalance: number;         // 현금 잔고 (재투자 안 한 부분)
  cumDeposit: number;          // 누적 납입금 (원금 + 월 납입금)
  // 비교 지수
  sp500Value: number;          // S&P 500 동일 투자 시 가치
  nasdaq100Value: number;      // 나스닥 100 동일 투자 시 가치
}

export interface TwoWeeksBacktestResult {
  snapshots: MonthlySnapshot[];
  finalValue: number;          // 최종 평가금액
  totalDeposit: number;        // 총 납입금 (원금 + 월 납입금 합계)
  totalDividend: number;       // 총 누적 배당금
  totalReturn: number;         // 총 수익률 (%)
  cagr: number;                // 연평균 수익률 (%)
  avgMonthlyDividend: number;  // 평균 월 배당금
  lastMonthDividend: number;   // 마지막 달 배당금
  maxDrawdown: number;         // 최대 낙폭 (%)
  dividendYieldOnCost: number; // 원금 대비 배당수익률 (마지막 달 기준)
  // 비교 지수 결과
  sp500FinalValue: number;     // S&P 500 최종 가치
  sp500Return: number;         // S&P 500 총 수익률 (%)
  nasdaq100FinalValue: number; // 나스닥 100 최종 가치
  nasdaq100Return: number;     // 나스닥 100 총 수익률 (%)
}

export function runTwoWeeksBacktest(params: TwoWeeksBacktestParams): TwoWeeksBacktestResult {
  const {
    principal,
    monthlyDeposit = 0,
    earlyRatio,
    earlyYield,
    midYield,
    reinvestRate,
    months,
    earlyGrowth = 0,
    midGrowth = 0,
    taxRate = 0,
    sp500Return = INDEX_RETURNS.SP500,
    nasdaq100Return = INDEX_RETURNS.NASDAQ100,
  } = params;

  // 초기 투자금 분배
  let earlyValue = principal * (earlyRatio / 100);
  let midValue = principal * ((100 - earlyRatio) / 100);
  let cashBalance = 0;
  let cumDividend = 0;
  let cumDeposit = principal; // 누적 납입금

  // 월별 성장률 계산
  const earlyMonthlyGrowth = Math.pow(1 + earlyGrowth / 100, 1 / 12) - 1;
  const midMonthlyGrowth = Math.pow(1 + midGrowth / 100, 1 / 12) - 1;

  // 지수 월별 성장률
  const sp500MonthlyGrowth = Math.pow(1 + sp500Return / 100, 1 / 12) - 1;
  const nasdaq100MonthlyGrowth = Math.pow(1 + nasdaq100Return / 100, 1 / 12) - 1;

  const snapshots: MonthlySnapshot[] = [];
  let peakValue = principal;
  let maxDrawdown = 0;

  // 지수 투자 시뮬레이션 (동일 금액 투자)
  let sp500Value = principal;
  let nasdaq100Value = principal;

  for (let m = 1; m <= months; m++) {
    // 0. 월 납입금 추가 (월초에 납입)
    if (monthlyDeposit > 0) {
      const earlyDeposit = monthlyDeposit * (earlyRatio / 100);
      const midDeposit = monthlyDeposit * ((100 - earlyRatio) / 100);
      earlyValue += earlyDeposit;
      midValue += midDeposit;
      cumDeposit += monthlyDeposit;

      // 지수에도 동일 금액 납입
      sp500Value += monthlyDeposit;
      nasdaq100Value += monthlyDeposit;
    }

    // 1. 주가 성장 적용 (월초)
    earlyValue *= (1 + earlyMonthlyGrowth);
    midValue *= (1 + midMonthlyGrowth);

    // 지수 성장
    sp500Value *= (1 + sp500MonthlyGrowth);
    nasdaq100Value *= (1 + nasdaq100MonthlyGrowth);

    // 2. 배당금 계산 (세후)
    const earlyDividendGross = earlyValue * (earlyYield / 1200);
    const midDividendGross = midValue * (midYield / 1200);
    const earlyDividend = earlyDividendGross * (1 - taxRate / 100);
    const midDividend = midDividendGross * (1 - taxRate / 100);
    const totalDividend = earlyDividend + midDividend;
    cumDividend += totalDividend;

    // 3. 재투자
    const earlyReinvest = midDividend * (reinvestRate / 100);    // 월중순 배당 → 월초 ETF
    const midReinvest = earlyDividend * (reinvestRate / 100);    // 월초 배당 → 월중순 ETF
    const cashFromDividend = totalDividend * ((100 - reinvestRate) / 100);

    earlyValue += earlyReinvest;
    midValue += midReinvest;
    cashBalance += cashFromDividend;

    // 4. 총 평가금액
    const totalValue = earlyValue + midValue + cashBalance;

    // 5. MDD 계산
    if (totalValue > peakValue) peakValue = totalValue;
    const drawdown = peakValue > 0 ? (peakValue - totalValue) / peakValue : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    snapshots.push({
      month: m,
      earlyValue: Math.round(earlyValue),
      midValue: Math.round(midValue),
      totalValue: Math.round(totalValue),
      earlyDividend: Math.round(earlyDividend),
      midDividend: Math.round(midDividend),
      totalDividend: Math.round(totalDividend),
      cumDividend: Math.round(cumDividend),
      cumDeposit: Math.round(cumDeposit),
      sp500Value: Math.round(sp500Value),
      nasdaq100Value: Math.round(nasdaq100Value),
      cashBalance: Math.round(cashBalance),
    });
  }

  const last = snapshots[snapshots.length - 1];
  const finalValue = last?.totalValue ?? principal;
  const totalDeposit = cumDeposit;
  const totalReturn = ((finalValue - totalDeposit) / totalDeposit) * 100;
  const years = months / 12;
  // CAGR 계산 (적립식인 경우 단순 CAGR보다 XIRR이 정확하지만 간략히 계산)
  const cagr = years > 0
    ? (Math.pow(finalValue / totalDeposit, 1 / years) - 1) * 100
    : 0;
  const avgMonthlyDividend = cumDividend / months;
  const lastMonthDividend = last?.totalDividend ?? 0;
  const dividendYieldOnCost = (lastMonthDividend * 12 / totalDeposit) * 100;

  // 지수 최종 결과
  const sp500FinalValue = last?.sp500Value ?? principal;
  const nasdaq100FinalValue = last?.nasdaq100Value ?? principal;
  const sp500TotalReturn = ((sp500FinalValue - totalDeposit) / totalDeposit) * 100;
  const nasdaq100TotalReturn = ((nasdaq100FinalValue - totalDeposit) / totalDeposit) * 100;

  return {
    snapshots,
    finalValue: Math.round(finalValue),
    totalDeposit: Math.round(totalDeposit),
    totalDividend: Math.round(cumDividend),
    totalReturn: Math.round(totalReturn * 10) / 10,
    cagr: Math.round(cagr * 10) / 10,
    avgMonthlyDividend: Math.round(avgMonthlyDividend),
    lastMonthDividend: Math.round(lastMonthDividend),
    maxDrawdown: Math.round(maxDrawdown * 1000) / 10,
    dividendYieldOnCost: Math.round(dividendYieldOnCost * 10) / 10,
    // 지수 비교
    sp500FinalValue: Math.round(sp500FinalValue),
    sp500Return: Math.round(sp500TotalReturn * 10) / 10,
    nasdaq100FinalValue: Math.round(nasdaq100FinalValue),
    nasdaq100Return: Math.round(nasdaq100TotalReturn * 10) / 10,
  };
}

/**
 * 여러 시나리오 비교 백테스트
 */
export interface ScenarioParams {
  name: string;
  earlyYield: number;
  midYield: number;
  earlyGrowth?: number;
  midGrowth?: number;
}

export function compareScenarios(
  baseParams: Omit<TwoWeeksBacktestParams, 'earlyYield' | 'midYield' | 'earlyGrowth' | 'midGrowth'>,
  scenarios: ScenarioParams[]
): { name: string; result: TwoWeeksBacktestResult }[] {
  return scenarios.map(scenario => ({
    name: scenario.name,
    result: runTwoWeeksBacktest({
      ...baseParams,
      earlyYield: scenario.earlyYield,
      midYield: scenario.midYield,
      earlyGrowth: scenario.earlyGrowth ?? 0,
      midGrowth: scenario.midGrowth ?? 0,
    }),
  }));
}
