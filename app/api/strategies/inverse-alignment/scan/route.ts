import { NextRequest, NextResponse } from 'next/server';
import { scanInverseAlignmentFromDB } from '@/lib/api/strategies/inverse-alignment';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 전수 조사 시 60초 이상 소요될 수 있음

export async function GET(request: NextRequest) {
  try {
    // 1. 공통 데이터(stocks) 기반으로 전수 조사 수행
    const validResults = await scanInverseAlignmentFromDB();

    // 2. 결과 반환 (싱크로율이 높은 순으로 정렬됨)
    return NextResponse.json({ 
      stocks: validResults,
      count: validResults.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[InverseAlignment Scan API Error]', error);
    return NextResponse.json({ error: 'Failed to scan strategy' }, { status: 500 });
  }
}

