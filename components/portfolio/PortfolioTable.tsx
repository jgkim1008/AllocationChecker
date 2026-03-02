'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, Pencil } from 'lucide-react';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

interface Props {
  holdings: PortfolioHoldingWithStock[];
  loading: boolean;
  onDelete: (id: string) => void;
  onEdit: (holding: PortfolioHoldingWithStock) => void;
}

export function PortfolioTable({ holdings, loading, onDelete, onEdit }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-base">보유 종목이 없습니다.</p>
        <p className="text-sm mt-1">종목 추가 버튼으로 포트폴리오를 구성하세요.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>종목명</TableHead>
          <TableHead>시장</TableHead>
          <TableHead className="text-right">보유 수량</TableHead>
          <TableHead className="text-right">평균 단가</TableHead>
          <TableHead className="text-right">주당 배당금</TableHead>
          <TableHead className="text-right">연간 예상 배당</TableHead>
          <TableHead className="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((holding) => {
          // 이름이 심볼과 다를 때만 이름 우선 표시
          const displayName =
            holding.stock.name && holding.stock.name !== holding.stock.symbol
              ? holding.stock.name
              : null;

          return (
            <TableRow key={holding.id}>
              <TableCell>
                <div>
                  <p className="font-semibold leading-tight">
                    {displayName ?? holding.stock.symbol}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {displayName ? holding.stock.symbol : null}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={holding.stock.market === 'US' ? 'default' : 'secondary'}>
                  {holding.stock.market}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {Number(holding.shares).toLocaleString()}주
              </TableCell>
              <TableCell className="text-right">
                {holding.average_cost
                  ? formatCurrency(Number(holding.average_cost), holding.stock.currency)
                  : '-'}
              </TableCell>
              <TableCell className="text-right">
                {holding.latestDividend
                  ? formatCurrency(holding.latestDividend.dividendAmount, holding.stock.currency)
                  : '-'}
              </TableCell>
              <TableCell className="text-right font-medium">
                {holding.estimatedAnnualDividend
                  ? formatCurrency(holding.estimatedAnnualDividend, holding.stock.currency)
                  : '-'}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(holding)}
                    className="h-8 w-8"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(holding.id)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
