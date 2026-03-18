export interface ValueScoreInput {
  // 이익 창출력 / 저평가
  trailingPE?: number | null;
  priceToBook?: number | null;
  grossMargins?: number | null;
  earningsGrowth?: number | null;
  // 주주환원 의지
  dividendYield?: number | null;
  isQuarterlyDividend?: boolean;
  dividendStreak?: number;
  prevSharesOutstanding?: number | null;
  sharesOutstanding?: number | null;
  floatShares?: number | null;
  // 미래 성장 잠재력
  revenueGrowth?: number | null;
  returnOnEquity?: number | null;
  marketCap?: number | null;
  market?: 'US' | 'KR';
}

export interface ValueScoreResult {
  totalScore: number;
  grade: 'A' | 'B' | 'C' | 'D';
  breakdown: {
    scorePer: number;
    scorePbr: number;
    scoreProfitSustainability: number;
    scoreCrossListed: number;
    scoreDividendYield: number;
    scoreQuarterlyDividend: number;
    scoreDividendStreak: number;
    scoreBuybackActive: number;
    scoreBuybackRatio: number;
    scoreTreasuryRatio: number;
    scoreGrowthPotential: number;
    scoreManagement: number;
    scoreGlobalBrand: number;
  };
}

export function calculateValueScore(input: ValueScoreInput): ValueScoreResult {
  const b = {
    scorePer: 0,
    scorePbr: 0,
    scoreProfitSustainability: 0,
    scoreCrossListed: 5, // 기본값: S&P500/KOSPI200 구성 종목 = 단독 상장 간주
    scoreDividendYield: 0,
    scoreQuarterlyDividend: 0,
    scoreDividendStreak: 0,
    scoreBuybackActive: 0,
    scoreBuybackRatio: 0,
    scoreTreasuryRatio: 0,
    scoreGrowthPotential: 0,
    scoreManagement: 0,
    scoreGlobalBrand: 0,
  };

  // PER (20pt)
  const per = input.trailingPE;
  if (per != null && per > 0) {
    if (per < 5) b.scorePer = 20;
    else if (per < 8) b.scorePer = 15;
    else if (per < 10) b.scorePer = 10;
    else b.scorePer = 5;
  }

  // PBR (5pt)
  const pbr = input.priceToBook;
  if (pbr != null && pbr > 0) {
    if (pbr < 0.3) b.scorePbr = 5;
    else if (pbr < 0.6) b.scorePbr = 4;
    else if (pbr < 1.0) b.scorePbr = 3;
  }

  // 이익 지속성 (5pt)
  const gm = input.grossMargins;
  const eg = input.earningsGrowth;
  if (gm != null && eg != null && gm > 0.2 && eg > 0) {
    b.scoreProfitSustainability = 5;
  }

  // 배당수익률 (10pt)
  const dy = input.dividendYield;
  if (dy != null) {
    if (dy > 0.07) b.scoreDividendYield = 10;
    else if (dy > 0.05) b.scoreDividendYield = 7;
    else if (dy > 0.03) b.scoreDividendYield = 5;
    else if (dy > 0) b.scoreDividendYield = 2;
  }

  // 분기 배당 (5pt)
  if (input.isQuarterlyDividend) b.scoreQuarterlyDividend = 5;

  // 배당 연속 인상 연수 (5pt)
  const streak = input.dividendStreak ?? 0;
  if (streak >= 10) b.scoreDividendStreak = 5;
  else if (streak >= 5) b.scoreDividendStreak = 4;
  else if (streak >= 3) b.scoreDividendStreak = 3;

  // 자사주 매입/소각 (buybackActive 7pt, buybackRatio 8pt)
  const prevSO = input.prevSharesOutstanding;
  const currSO = input.sharesOutstanding;
  if (prevSO != null && currSO != null && prevSO > 0) {
    const changeRate = (prevSO - currSO) / prevSO;
    if (changeRate > 0) {
      b.scoreBuybackActive = 7;
      if (changeRate > 0.02) b.scoreBuybackRatio = 8;
      else if (changeRate > 0.015) b.scoreBuybackRatio = 5;
      else if (changeRate > 0.005) b.scoreBuybackRatio = 3;
    }
  }

  // 자사주 보유 비율 (5pt)
  const so = input.sharesOutstanding;
  const fs = input.floatShares;
  if (so != null && fs != null && so > 0) {
    const treasuryRatio = (so - fs) / so;
    if (treasuryRatio < 0.01) b.scoreTreasuryRatio = 5;
    else if (treasuryRatio < 0.02) b.scoreTreasuryRatio = 4;
    else if (treasuryRatio < 0.05) b.scoreTreasuryRatio = 2;
  }

  // 미래 성장 잠재력 (10pt)
  const rg = input.revenueGrowth;
  if (rg != null) {
    if (rg > 0.2) b.scoreGrowthPotential = 10;
    else if (rg > 0.1) b.scoreGrowthPotential = 7;
    else if (rg > 0) b.scoreGrowthPotential = 5;
    else b.scoreGrowthPotential = 3;
  }

  // 기업 경영 ROE (10pt)
  const roe = input.returnOnEquity;
  if (roe != null) {
    if (roe > 0.2) b.scoreManagement = 10;
    else if (roe > 0.1) b.scoreManagement = 5;
  }

  // 세계적 브랜드 (5pt) — 시총 기준
  const mc = input.marketCap;
  if (mc != null) {
    const isUS = input.market === 'US';
    if (isUS && mc > 50_000_000_000) b.scoreGlobalBrand = 5;
    else if (!isUS && mc > 10_000_000_000_000) b.scoreGlobalBrand = 5;
  }

  const totalScore =
    b.scorePer +
    b.scorePbr +
    b.scoreProfitSustainability +
    b.scoreCrossListed +
    b.scoreDividendYield +
    b.scoreQuarterlyDividend +
    b.scoreDividendStreak +
    b.scoreBuybackActive +
    b.scoreBuybackRatio +
    b.scoreTreasuryRatio +
    b.scoreGrowthPotential +
    b.scoreManagement +
    b.scoreGlobalBrand;

  let grade: 'A' | 'B' | 'C' | 'D' = 'D';
  if (totalScore > 80) grade = 'A';
  else if (totalScore >= 70) grade = 'B';
  else if (totalScore >= 50) grade = 'C';

  return { totalScore, grade, breakdown: b };
}
