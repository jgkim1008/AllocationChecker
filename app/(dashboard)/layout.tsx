import { DashboardNav } from '@/components/DashboardNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />
      <div className="pb-16 sm:pb-0">
        {children}
      </div>
    </div>
  );
}
