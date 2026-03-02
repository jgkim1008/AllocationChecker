import { DividendCalendar } from '@/components/calendar/DividendCalendar';

export const metadata = {
  title: '배당 캘린더 | AllocationChecker',
};

export default function CalendarPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">배당 캘린더</h1>
        <p className="text-muted-foreground mt-1">포트폴리오 보유 종목의 배당락일을 확인하세요.</p>
      </div>

      <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-600" />
          <span>미국 주식</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-600" />
          <span>한국 주식</span>
        </div>
      </div>

      <div className="bg-card text-card-foreground rounded-lg border border-border p-4">
        <DividendCalendar />
      </div>
    </div>
  );
}
