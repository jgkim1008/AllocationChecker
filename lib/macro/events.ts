/**
 * 주목할 매크로 이벤트 캘린더
 * FOMC 일정은 연준이 1년+ 전에 공식 발표하는 확정 일정이라 정적으로 관리한다.
 * 출처: Federal Reserve Board — https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
 *       (2024-08-09 보도자료로 2025~2026 일정 확정 발표)
 */
export interface MacroEvent {
  date: string; // YYYY-MM-DD (회의 마지막 날 = 발표일 기준)
  label: string;
}

const FOMC_2026: MacroEvent[] = [
  { date: '2026-01-28', label: 'FOMC 회의 결과 발표 (1/27-28)' },
  { date: '2026-03-18', label: 'FOMC 회의 결과 발표 (3/17-18)' },
  { date: '2026-04-29', label: 'FOMC 회의 결과 발표 (4/28-29)' },
  { date: '2026-06-17', label: 'FOMC 회의 결과 발표 (6/16-17)' },
  { date: '2026-07-29', label: 'FOMC 회의 결과 발표 (7/28-29)' },
  { date: '2026-09-16', label: 'FOMC 회의 결과 발표 (9/15-16)' },
  { date: '2026-10-28', label: 'FOMC 회의 결과 발표 (10/27-28)' },
  { date: '2026-12-09', label: 'FOMC 회의 결과 발표 (12/8-9)' },
];

/**
 * 오늘 이후 다가오는 이벤트 N개 반환 (D-day 포함)
 */
export function getUpcomingEvents(limit = 3): (MacroEvent & { daysUntil: number })[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return FOMC_2026
    .map(e => {
      const d = new Date(e.date + 'T00:00:00');
      const daysUntil = Math.round((d.getTime() - today.getTime()) / 86400000);
      return { ...e, daysUntil };
    })
    .filter(e => e.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, limit);
}
