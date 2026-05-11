import { Metadata } from 'next';
import AutoTradePageContent from './AutoTradePageContent';

export const metadata: Metadata = {
  title: '자동매매 - AllocationChecker',
  description: '증권사 API 연동 자동매매',
};

export default function AutoTradePage() {
  return <AutoTradePageContent />;
}
