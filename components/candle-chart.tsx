"use client";

import { useEffect, useRef, useState } from "react";
import type { Candle } from "@/lib/types";
import { formatPrice, formatCompact } from "@/lib/format";
import { formatSofiaStamp } from "@/lib/time";

type Props = {
  candles: Candle[];
  ema9: (number | null)[];
  ema15: (number | null)[];
  ema21: (number | null)[];
  rsi: (number | null)[];
  macdLine: (number | null)[];
  macdSignal: (number | null)[];
  macdHist: (number | null)[];
  show: { e9: boolean; e15: boolean; e21: boolean };
};

type Tip = {
  x: number;
  y: number;
  candle: Candle;
  index: number;
};

const UP = "#3DDC97";
const DOWN = "#FF5C5C";
const GRID = "#3A2414";
const MUTED = "#C9A88E";

export function CandleChart(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef(props);
  useEffect(() => {
    dataRef.current = props;
  });
  const viewRef = useRef({ start: 0, count: 110, follow: true });
  const hoverRef = useRef<number | null>(null);
  const dragRef = useRef<{ x: number; start: number } | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const { candles, ema9, ema15, ema21, rsi, macdLine, macdSignal, macdHist, show } = dataRef.current;
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (candles.length < 2) {
        ctx.fillStyle = MUTED;
        ctx.font = "14px sans-serif";
        ctx.fillText("Candles are still loading from Bybit.", 16, 32);
        return;
      }

      const view = viewRef.current;
      view.count = Math.max(20, Math.min(view.count, candles.length));
      if (view.follow) view.start = Math.max(0, candles.length - view.count);
      view.start = Math.max(0, Math.min(view.start, candles.length - view.count));
      const slice = candles.slice(view.start, view.start + view.count);
      const axis = 72;
      const gap = 10;
      const rsiH = Math.max(64, height * 0.16);
      const macdH = Math.max(72, height * 0.18);
      const mainH = height - rsiH - macdH - gap * 2;
      const plotW = width - axis - 8;
      const xAt = (index: number) => (index + 0.5) * (plotW / slice.length);

      const range = (values: number[]) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const value of values) {
          if (!Number.isFinite(value)) continue;
          lo = Math.min(lo, value);
          hi = Math.max(hi, value);
        }
        if (!Number.isFinite(lo) || lo === hi) {
          const mid = Number.isFinite(lo) ? lo : 0;
          return { lo: mid - 1, hi: mid + 1 };
        }
        const pad = (hi - lo) * 0.08;
        return { lo: lo - pad, hi: hi + pad };
      };

      const priceValues: number[] = [];
      slice.forEach((candle, index) => {
        const absolute = view.start + index;
        priceValues.push(candle.h, candle.l);
        if (show.e9 && ema9[absolute] != null) priceValues.push(ema9[absolute] as number);
        if (show.e15 && ema15[absolute] != null) priceValues.push(ema15[absolute] as number);
        if (show.e21 && ema21[absolute] != null) priceValues.push(ema21[absolute] as number);
      });
      const price = range(priceValues);
      const yPrice = (value: number) => ((price.hi - value) / (price.hi - price.lo)) * mainH;

      const drawGrid = (top: number, paneH: number, ticks: number[]) => {
        ctx.save();
        ctx.strokeStyle = GRID;
        ctx.fillStyle = MUTED;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        for (const tick of ticks) {
          ctx.beginPath();
          ctx.moveTo(0, tick);
          ctx.lineTo(plotW, tick);
          ctx.stroke();
        }
        ctx.restore();
        void top;
        void paneH;
      };

      ctx.strokeStyle = GRID;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const y = (mainH / 4) * i;
        ctx.moveTo(0, y);
        ctx.lineTo(plotW, y);
      }
      ctx.stroke();

      const bodyW = Math.max(1.5, (plotW / slice.length) * 0.62);
      slice.forEach((candle, index) => {
        const x = xAt(index);
        const up = candle.c >= candle.o;
        ctx.strokeStyle = up ? UP : DOWN;
        ctx.fillStyle = up ? UP : DOWN;
        ctx.beginPath();
        ctx.moveTo(x, yPrice(candle.h));
        ctx.lineTo(x, yPrice(candle.l));
        ctx.stroke();
        const top = yPrice(Math.max(candle.o, candle.c));
        const bottom = yPrice(Math.min(candle.o, candle.c));
        ctx.fillRect(x - bodyW / 2, top, bodyW, Math.max(1, bottom - top));
      });

      const line = (series: (number | null)[], color: string) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        let started = false;
        slice.forEach((_, index) => {
          const value = series[view.start + index];
          if (value == null) {
            started = false;
            return;
          }
          const x = xAt(index);
          const y = yPrice(value);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.lineWidth = 1;
      };
      if (show.e21) line(ema21, "#FDBA74");
      if (show.e15) line(ema15, "#FFA94D");
      if (show.e9) line(ema9, "#FF8A1F");

      ctx.fillStyle = MUTED;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      for (let i = 0; i <= 4; i++) {
        const value = price.hi - ((price.hi - price.lo) * i) / 4;
        ctx.fillText(formatPrice(value), plotW + 8, (mainH / 4) * i + 4);
      }

      const rsiTop = mainH + gap;
      ctx.fillStyle = MUTED;
      ctx.fillText("RSI", 8, rsiTop + 14);
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      for (const level of [30, 50, 70]) {
        const y = rsiTop + ((100 - level) / 100) * rsiH;
        ctx.moveTo(0, y);
        ctx.lineTo(plotW, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = "#FF8A1F";
      ctx.lineWidth = 1.5;
      let rsiStarted = false;
      slice.forEach((_, index) => {
        const value = rsi[view.start + index];
        if (value == null) {
          rsiStarted = false;
          return;
        }
        const x = xAt(index);
        const y = rsiTop + ((100 - value) / 100) * rsiH;
        if (!rsiStarted) {
          ctx.moveTo(x, y);
          rsiStarted = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;

      const macdTop = rsiTop + rsiH + gap;
      ctx.fillStyle = MUTED;
      ctx.fillText("MACD", 8, macdTop + 14);
      const macdValues: number[] = [];
      slice.forEach((_, index) => {
        const absolute = view.start + index;
        for (const series of [macdLine, macdSignal, macdHist]) {
          const value = series[absolute];
          if (value != null) macdValues.push(value);
        }
      });
      const macdRange = range(macdValues.length ? macdValues : [0]);
      const yMacd = (value: number) => macdTop + ((macdRange.hi - value) / (macdRange.hi - macdRange.lo)) * macdH;
      const zero = yMacd(0);
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(0, zero);
      ctx.lineTo(plotW, zero);
      ctx.stroke();
      const histW = Math.max(1, (plotW / slice.length) * 0.55);
      slice.forEach((_, index) => {
        const value = macdHist[view.start + index];
        if (value == null) return;
        ctx.fillStyle = value >= 0 ? UP : DOWN;
        const y = yMacd(value);
        ctx.fillRect(xAt(index) - histW / 2, Math.min(y, zero), histW, Math.max(1, Math.abs(y - zero)));
      });
      const macdLineDraw = (series: (number | null)[], color: string) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        let started = false;
        slice.forEach((_, index) => {
          const value = series[view.start + index];
          if (value == null) {
            started = false;
            return;
          }
          const x = xAt(index);
          const y = yMacd(value);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.lineWidth = 1;
      };
      macdLineDraw(macdSignal, "#FDBA74");
      macdLineDraw(macdLine, "#FF8A1F");

      const hover = hoverRef.current;
      if (hover != null && hover >= view.start && hover < view.start + slice.length) {
        const local = hover - view.start;
        const x = xAt(local);
        ctx.strokeStyle = "#FFA94D";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.moveTo(0, yPrice(slice[local].c));
        ctx.lineTo(plotW, yPrice(slice[local].c));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#FF8A1F";
        ctx.fillRect(plotW, yPrice(slice[local].c) - 9, axis, 18);
        ctx.fillStyle = "#1A0E06";
        ctx.fillText(formatPrice(slice[local].c), plotW + 8, yPrice(slice[local].c) + 4);
      }
      drawGrid(0, mainH, []);
    };

    const indexFromEvent = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const plotW = rect.width - 80;
      const { candles } = dataRef.current;
      const view = viewRef.current;
      if (x < 0 || x > plotW || !candles.length) return null;
      const local = Math.min(view.count - 1, Math.max(0, Math.floor((x / plotW) * view.count)));
      return view.start + local;
    };

    const onMove = (event: PointerEvent) => {
      const index = indexFromEvent(event.clientX);
      hoverRef.current = index;
      if (dragRef.current) {
        const rect = canvas.getBoundingClientRect();
        const plotW = rect.width - 80;
        const shift = Math.round(((dragRef.current.x - event.clientX) / plotW) * viewRef.current.count);
        const next = dragRef.current.start + shift;
        const max = Math.max(0, dataRef.current.candles.length - viewRef.current.count);
        viewRef.current.start = Math.max(0, Math.min(max, next));
        viewRef.current.follow = viewRef.current.start >= max - 1;
        setFollow(viewRef.current.follow);
      }
      if (index != null) {
        const rect = wrap.getBoundingClientRect();
        setTip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          candle: dataRef.current.candles[index],
          index,
        });
      } else setTip(null);
      draw();
    };
    const onDown = (event: PointerEvent) => {
      dragRef.current = { x: event.clientX, start: viewRef.current.start };
    };
    const onUp = () => {
      dragRef.current = null;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const view = viewRef.current;
      const nextCount = Math.round(view.count * (event.deltaY > 0 ? 1.12 : 0.88));
      view.count = Math.max(20, Math.min(dataRef.current.candles.length, nextCount));
      if (view.follow) view.start = Math.max(0, dataRef.current.candles.length - view.count);
      draw();
    };
    const onDbl = () => {
      viewRef.current.follow = true;
      viewRef.current.count = Math.min(110, dataRef.current.candles.length);
      setFollow(true);
      draw();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDbl);
    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDbl);
    };
  }, [props.candles, props.show.e9, props.show.e15, props.show.e21]);

  const indicator = tip
    ? {
        ema9: props.ema9[tip.index],
        ema15: props.ema15[tip.index],
        ema21: props.ema21[tip.index],
        rsi: props.rsi[tip.index],
        line: props.macdLine[tip.index],
        signal: props.macdSignal[tip.index],
        hist: props.macdHist[tip.index],
      }
    : null;

  return (
    <div className="relative h-full">
      {!follow && (
        <button
          type="button"
          className="absolute top-2 right-20 z-10 rounded-full border border-[#FF8A1F] bg-[#140E0A]/90 px-3 py-1 text-xs text-[#FFA94D]"
          onClick={() => {
            viewRef.current.follow = true;
            setFollow(true);
          }}
        >
          Resume live edge
        </button>
      )}
      <div ref={wrapRef} className="h-full">
        <canvas ref={canvasRef} className="h-full w-full cursor-crosshair touch-none" />
      </div>
      {tip && indicator && (
        <div
          className="pointer-events-none absolute z-20 w-52 rounded-xl border border-[#3A2414] bg-[#140E0A]/95 p-3 text-xs shadow-lg"
          style={{ left: Math.min(tip.x + 12, 280), top: Math.max(8, tip.y - 20) }}
        >
          <div className="text-[#FFA94D]">{formatSofiaStamp(tip.candle.t)} Sofia</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 font-mono text-[#FFF4EA]">
            <span>O {formatPrice(tip.candle.o)}</span>
            <span>H {formatPrice(tip.candle.h)}</span>
            <span>L {formatPrice(tip.candle.l)}</span>
            <span>C {formatPrice(tip.candle.c)}</span>
          </div>
          <div className="mt-1 text-[#C9A88E]">Vol {formatCompact(tip.candle.v)}</div>
          <div className="mt-2 space-y-0.5 font-mono text-[#FDBA74]">
            <div>EMA 9 {formatPrice(indicator.ema9)}</div>
            <div>EMA 15 {formatPrice(indicator.ema15)}</div>
            <div>EMA 21 {formatPrice(indicator.ema21)}</div>
            <div className="text-[#FFA94D]">RSI {indicator.rsi == null ? "—" : indicator.rsi.toFixed(1)}</div>
            <div>
              MACD {indicator.line == null ? "—" : indicator.line.toFixed(4)} / {indicator.signal == null ? "—" : indicator.signal.toFixed(4)}
            </div>
            <div>Hist {indicator.hist == null ? "—" : indicator.hist.toFixed(4)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
