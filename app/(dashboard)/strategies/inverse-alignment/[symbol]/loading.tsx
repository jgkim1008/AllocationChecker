import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
      <p className="mt-6 text-gray-500 font-bold">전략 데이터 정밀 분석 중...</p>
    </div>
  );
}
