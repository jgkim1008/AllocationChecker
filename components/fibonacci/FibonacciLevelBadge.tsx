'use client';

import { Badge } from '@/components/ui/badge';
import type { FibonacciLevel } from '@/types/fibonacci';

interface FibonacciLevelBadgeProps {
  level: FibonacciLevel | null;
  distance?: number;
}

export function FibonacciLevelBadge({ level, distance }: FibonacciLevelBadgeProps) {
  if (level === null) {
    return (
      <Badge variant="outline" className="text-gray-400">
        -
      </Badge>
    );
  }

  const getLevelColor = (level: FibonacciLevel) => {
    switch (level) {
      case 0:
        return 'bg-red-100 text-red-700 border-red-200';
      case 0.14:
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 0.236:
        return 'bg-cyan-100 text-cyan-700 border-cyan-200';
      case 0.382:
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 0.5:
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 0.618:
        return 'bg-green-100 text-green-700 border-green-200';
      case 0.764:
        return 'bg-teal-100 text-teal-700 border-teal-200';
      case 0.854:
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 1:
        return 'bg-rose-100 text-rose-700 border-rose-200';
    }
  };

  const getLevelLabel = (level: FibonacciLevel) => {
    switch (level) {
      case 0:
        return '0%';
      case 0.14:
        return '14%';
      case 0.236:
        return '23.6%';
      case 0.382:
        return '38.2%';
      case 0.5:
        return '50%';
      case 0.618:
        return '61.8%';
      case 0.764:
        return '76.4%';
      case 0.854:
        return '85.4%';
      case 1:
        return '100%';
    }
  };

  return (
    <Badge
      variant="outline"
      className={`font-medium ${getLevelColor(level)}`}
      title={distance !== undefined ? `레벨과의 거리: ${distance.toFixed(2)}%` : undefined}
    >
      {getLevelLabel(level)}
    </Badge>
  );
}
