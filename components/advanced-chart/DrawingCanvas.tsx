'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { DrawingMode } from '@/app/(dashboard)/advanced-chart/page';

export interface Drawing {
  id: string;
  type: DrawingMode;
  points: Array<{ x: number; y: number; time?: string; price?: number }>;
  color: string;
  width: number;
  locked?: boolean;
}

interface HistoryData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DrawingCanvasProps {
  mainChart: IChartApi | null;
  candlestickSeries: ISeriesApi<'Candlestick'> | null;
  drawingMode: DrawingMode;
  magnetMode: 'weak' | 'strong' | null;
  data: HistoryData[];
  drawings: Drawing[];
  onDrawingsChange: (drawings: Drawing[]) => void;
  onSelectedDrawingChange?: (drawingId: string | null) => void;
}

export function DrawingCanvas({
  mainChart,
  candlestickSeries,
  drawingMode,
  magnetMode,
  data,
  drawings,
  onDrawingsChange,
  onSelectedDrawingChange,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [draggingDrawingId, setDraggingDrawingId] = useState<string | null>(null);
  const [isOverDrawing, setIsOverDrawing] = useState(false);

  const COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4'];
  const getNextColor = () => COLORS[drawings.length % COLORS.length];

  // 약한 자석: 근처 OHLC 값에 스냅
  const snapToOHLCWeak = (y: number): number => {
    if (!candlestickSeries) return y;

    const price = candlestickSeries.coordinateToPrice(y);
    if (price === null) return y;

    // 근처 거리 임계값 (포인트)
    const snapDistance = 20;
    let closestPrice: number | null = null;
    let closestDistance = Infinity;

    // 화면에 보이는 캔들들에서 OHLC 값 찾기
    data.forEach(candle => {
      [candle.open, candle.high, candle.low, candle.close].forEach(candlePrice => {
        const candleY = candlestickSeries.priceToCoordinate(candlePrice as any);
        if (candleY === null) return;

        const distance = Math.abs(candleY - y);
        if (distance < closestDistance && distance <= snapDistance) {
          closestDistance = distance;
          closestPrice = candlePrice;
        }
      });
    });

    return closestPrice !== null ? candlestickSeries.priceToCoordinate(closestPrice as any) ?? y : y;
  };

  // 점과 직선 사이의 거리 계산 (픽셀)
  const distanceToLine = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Drawing hit test (클릭 감지 범위: 10px)
  const getDrawingAtPoint = (x: number, y: number): string | null => {
    if (!candlestickSeries || !mainChart) return null;

    const hitThreshold = 10;

    for (let i = drawings.length - 1; i >= 0; i--) {
      const drawing = drawings[i];
      if (drawing.locked) continue;

      if (drawing.type === 'hline') {
        const price = drawing.points[0].price;
        const drawY = candlestickSeries.priceToCoordinate(price as any);
        if (drawY !== null && Math.abs(y - drawY) <= hitThreshold) {
          return drawing.id;
        }
      } else if (drawing.type === 'trendline' || drawing.type === 'rect' || drawing.type === 'fibonacci') {
        if (drawing.points.length < 2) continue;

        const p1 = drawing.points[0];
        const p2 = drawing.points[1];

        const x1 = mainChart.timeScale().timeToCoordinate(p1.time as any) ?? p1.x;
        const y1 = p1.price !== undefined ? (candlestickSeries.priceToCoordinate(p1.price as any) ?? p1.y) : p1.y;
        const x2 = mainChart.timeScale().timeToCoordinate(p2.time as any) ?? p2.x;
        const y2 = p2.price !== undefined ? (candlestickSeries.priceToCoordinate(p2.price as any) ?? p2.y) : p2.y;

        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

        const dist = distanceToLine(x, y, x1, y1, x2, y2);
        if (dist <= hitThreshold) {
          return drawing.id;
        }
      }
    }

    return null;
  };

  // 전역 mousemove로 drawing 위 hover 감지 (canvas pointer-events: none 상태에서도 동작)
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current || drawingMode || draggingDrawingId) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
        setIsOverDrawing(false);
        return;
      }

      const hitId = getDrawingAtPoint(x, y);
      setIsOverDrawing(!!hitId);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    return () => document.removeEventListener('mousemove', handleGlobalMouseMove);
  }, [drawings, drawingMode, mainChart, candlestickSeries, draggingDrawingId]);

  // 강한 자석: 모든 High/Low에 스냅
  const snapToHighLowStrong = (y: number): number => {
    if (!candlestickSeries || data.length === 0) {
      return y;
    }

    const price = candlestickSeries.coordinateToPrice(y);
    if (price === null) {
      return y;
    }

    let closestPrice: number | null = null;
    let closestDistance = Infinity;

    // 모든 High/Low에서 가장 가까운 것 찾기
    data.forEach(candle => {
      [candle.high, candle.low].forEach(candlePrice => {
        const candleY = candlestickSeries.priceToCoordinate(candlePrice as any);
        if (candleY === null) return;

        const distance = Math.abs(candleY - y);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPrice = candlePrice;
        }
      });
    });

    const snappedY = closestPrice !== null ? candlestickSeries.priceToCoordinate(closestPrice as any) ?? y : y;
    return snappedY;
  };

  // 키보드 이벤트 감시
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setIsCtrlPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setIsCtrlPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Canvas에 그리기들을 렌더링
  const redrawCanvas = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !mainChart || !candlestickSeries) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    drawings.forEach(drawing => {
      const isSelected = selectedDrawingId === drawing.id;
      const isDragging = draggingDrawingId === drawing.id;

      ctx.strokeStyle = isDragging ? '#ffff00' : isSelected ? '#00ffff' : drawing.color;
      ctx.lineWidth = isDragging || isSelected ? 3 : drawing.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (drawing.type === 'hline') {
        const price = drawing.points[0].price;
        if (price === undefined) return;
        const y = candlestickSeries.priceToCoordinate(price);
        if (y === null) return;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(ctx.canvas.width, y);
        ctx.stroke();
        ctx.fillStyle = drawing.color;
        ctx.font = '11px sans-serif';
        ctx.fillText(`${price?.toFixed(2) || ''}`, 5, y - 5);
      } else if (drawing.type === 'trendline' || drawing.type === 'rect') {
        if (drawing.points.length < 2 || !mainChart) return;
        const p1 = drawing.points[0];
        const p2 = drawing.points[1];
        const x1 = p1.time ? (mainChart.timeScale().timeToCoordinate(p1.time as any) ?? p1.x) : p1.x;
        const y1 = p1.price !== undefined ? (candlestickSeries?.priceToCoordinate(p1.price as any) ?? p1.y) : p1.y;
        const x2 = p2.time ? (mainChart.timeScale().timeToCoordinate(p2.time as any) ?? p2.x) : p2.x;
        const y2 = p2.price !== undefined ? (candlestickSeries?.priceToCoordinate(p2.price as any) ?? p2.y) : p2.y;
        if (x1 === null || y1 === null || x2 === null || y2 === null) return;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (drawing.type === 'rect') ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      } else if (drawing.type === 'fibonacci') {
        if (drawing.points.length < 2 || !mainChart) return;
        const p1 = drawing.points[0];
        const p2 = drawing.points[1];
        const y1Coord = p1.price !== undefined ? (candlestickSeries?.priceToCoordinate(p1.price as any) ?? p1.y) : p1.y;
        const y2Coord = p2.price !== undefined ? (candlestickSeries?.priceToCoordinate(p2.price as any) ?? p2.y) : p2.y;
        if (y1Coord === null || y2Coord === null) return;
        const canvasW = ctx.canvas.width;
        const highY = Math.max(y1Coord, y2Coord);
        const lowY = Math.min(y1Coord, y2Coord);
        const range = highY - lowY;
        const FIB_LEVELS = [
          { level: 0, label: '0%' }, { level: 0.236, label: '23.6%' }, { level: 0.382, label: '38.2%' },
          { level: 0.5, label: '50%' }, { level: 0.618, label: '61.8%' }, { level: 0.786, label: '78.6%' },
          { level: 1, label: '100%' },
        ];
        ctx.save();
        FIB_LEVELS.forEach(({ level, label }) => {
          const y = highY - range * level;
          ctx.strokeStyle = drawing.color;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = isDragging || isSelected ? 2 : 1;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvasW, y);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = drawing.color;
          ctx.font = 'bold 10px sans-serif';
          const price = p1.price !== undefined && p2.price !== undefined
            ? Math.max(p1.price, p2.price) - (Math.abs(p1.price - p2.price)) * level : null;
          const priceStr = price !== null ? ` (${price.toFixed(2)})` : '';
          ctx.fillText(`${label}${priceStr}`, canvasW - 100, y - 3);
        });
        ctx.restore();
      }
    });
  }, [mainChart, candlestickSeries, drawings, selectedDrawingId, draggingDrawingId]);

  // Canvas 초기화 및 리사이즈
  useEffect(() => {
    if (!canvasRef.current || !mainChart) return;

    const resizeCanvas = () => {
      const container = canvasRef.current?.parentElement;
      if (!container || !canvasRef.current) return;

      const rect = container.getBoundingClientRect();
      canvasRef.current.width = rect.width;
      canvasRef.current.height = rect.height;

      redrawCanvas();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => window.removeEventListener('resize', resizeCanvas);
  }, [mainChart, redrawCanvas]);

  // 차트 스크롤/줌 시 canvas 다시 그리기
  useEffect(() => {
    if (!mainChart) return;

    const unsubscribe = mainChart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      redrawCanvas();
    }) as (() => void) | undefined;

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [mainChart, redrawCanvas]);

  // 선택된 drawing 변경 시 콜백
  useEffect(() => {
    onSelectedDrawingChange?.(selectedDrawingId);
  }, [selectedDrawingId, onSelectedDrawingChange]);

  // 마우스 이벤트
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 드로잉 모드가 없으면 기존 drawing 선택/드래그
    if (!drawingMode) {
      const hitDrawingId = getDrawingAtPoint(x, y);
      if (hitDrawingId) {
        e.stopPropagation();
        setSelectedDrawingId(hitDrawingId);
        setDraggingDrawingId(hitDrawingId);
        setStartPoint({ x, y });
      }
      // 아무것도 선택되지 않으면 차트 스크롤이 작동하도록 전파
      return;
    }

    // 그리기 모드 활성화: 이벤트 전파 차단
    e.stopPropagation();

    // 드로잉 모드 활성화 상태: 새 drawing 생성
    if (!mainChart || !candlestickSeries) return;

    let snapY = y;

    // 자석 모드 적용
    if (isCtrlPressed) {
      snapY = snapToHighLowStrong(y);
    } else if (magnetMode === 'weak') {
      snapY = snapToOHLCWeak(y);
    } else if (magnetMode === 'strong') {
      snapY = snapToHighLowStrong(y);
    }

    setStartPoint({ x, y: snapY });
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint) return;

    e.stopPropagation();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    // 기존 drawing 드래그 중
    if (draggingDrawingId) {
      const deltaX = x - startPoint.x;
      const deltaY = y - startPoint.y;

      const updatedDrawing = drawings.find(d => d.id === draggingDrawingId);
      if (!updatedDrawing || !mainChart || !candlestickSeries) return;

      const newPoints = updatedDrawing.points.map(p => {
        const currentPrice = candlestickSeries.coordinateToPrice(p.y) ?? (p.price ?? 0);
        const newPrice = candlestickSeries.coordinateToPrice(p.y + deltaY) ?? currentPrice;
        const priceChange = (newPrice as number) - (currentPrice as number);

        return {
          ...p,
          y: p.y + deltaY,
          price: (p.price ?? 0) + priceChange,
          x: p.x + deltaX,
          time: p.time ? mainChart.timeScale().coordinateToTime(mainChart.timeScale().timeToCoordinate(p.time as any)! + deltaX) as any : p.time
        };
      });

      const newDrawings = drawings.map(d => d.id === draggingDrawingId ? { ...d, points: newPoints } : d);
      onDrawingsChange(newDrawings);

      setStartPoint({ x, y });
      redrawCanvas();
      return;
    }

    // 새 drawing 미리보기
    if (!drawingMode) return;
    if (!mainChart || !candlestickSeries) return;

    let snapY = y;

    // 자석 모드 적용
    if (isCtrlPressed) {
      snapY = snapToHighLowStrong(y);
    } else if (magnetMode === 'weak') {
      snapY = snapToOHLCWeak(y);
    } else if (magnetMode === 'strong') {
      snapY = snapToHighLowStrong(y);
    }

    // 임시 렌더링 (미리보기)
    redrawCanvas();

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const color = getNextColor();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    if (drawingMode === 'hline') {
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, startPoint.y);
      ctx.lineTo(ctx.canvas.width, startPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (drawingMode === 'trendline') {
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(x, snapY);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (drawingMode === 'rect') {
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(startPoint.x, startPoint.y, x - startPoint.x, snapY - startPoint.y);
      ctx.setLineDash([]);
    } else if (drawingMode === 'fibonacci') {
      const highY = Math.max(startPoint.y, snapY);
      const lowY  = Math.min(startPoint.y, snapY);
      const range = highY - lowY;
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const labels = ['0%', '23.6%', '38.2%', '50%', '61.8%', '78.6%', '100%'];

      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.5;
      levels.forEach((level, i) => {
        const levelY = highY - range * level;
        ctx.beginPath();
        ctx.moveTo(0, levelY);
        ctx.lineTo(ctx.canvas.width, levelY);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(labels[i], ctx.canvas.width - 50, levelY - 3);
        ctx.globalAlpha = 0.5;
      });
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 드래그 중인 drawing 완료
    if (draggingDrawingId) {
      e.stopPropagation();
      setIsDrawing(false);
      setStartPoint(null);
      setDraggingDrawingId(null);
      redrawCanvas();
      return;
    }

    if (!isDrawing || !startPoint || !drawingMode || !candlestickSeries) return;

    e.stopPropagation();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    // 자석 모드 적용 (Ctrl이 눌렸으면 강력한 스냅, 아니면 설정된 모드 사용)
    if (isCtrlPressed) {
      y = snapToHighLowStrong(y);
    } else if (magnetMode === 'weak') {
      y = snapToOHLCWeak(y);
    } else if (magnetMode === 'strong') {
      y = snapToHighLowStrong(y);
    }

    // 최소 거리 확인 (실수 클릭 방지)
    const minDistance = 10;
    const distance = Math.hypot(x - startPoint.x, y - startPoint.y);
    if (distance < minDistance && drawingMode !== 'hline') {
      setIsDrawing(false);
      setStartPoint(null);
      return;
    }

    // 새 그리기 생성
    const points: Drawing['points'] = [];

    if (drawingMode === 'hline') {
      const price = candlestickSeries.coordinateToPrice(startPoint.y);
      points.push({ x: 0, y: startPoint.y, price: price ?? 0 });
    } else {
      if (!mainChart) return;
      const time1 = mainChart.timeScale().coordinateToTime(startPoint.x);
      const time2 = mainChart.timeScale().coordinateToTime(x);
      const price1 = candlestickSeries.coordinateToPrice(startPoint.y);
      const price2 = candlestickSeries.coordinateToPrice(y);
      points.push({
        x: startPoint.x,
        y: startPoint.y,
        time: time1 as any,
        price: price1 ?? 0
      });
      points.push({
        x,
        y,
        time: time2 as any,
        price: price2 ?? 0
      });
    }

    const newDrawing: Drawing = {
      id: `drawing-${Date.now()}`,
      type: drawingMode,
      points,
      color: getNextColor(),
      width: 2,
    };

    onDrawingsChange([...drawings, newDrawing]);

    setIsDrawing(false);
    setStartPoint(null);
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsDrawing(false);
        setStartPoint(null);
        setDraggingDrawingId(null);
        redrawCanvas();
      }}
      className={`absolute inset-0 z-10 ${drawingMode ? 'cursor-crosshair' : isOverDrawing || draggingDrawingId ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ pointerEvents: (drawingMode !== null || isOverDrawing || !!draggingDrawingId) ? 'auto' : 'none' }}
    />
  );
}
