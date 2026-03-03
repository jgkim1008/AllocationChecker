import { PasswordGate } from '@/components/PasswordGate';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <PasswordGate>{children}</PasswordGate>;
}
