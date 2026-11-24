"use client";

import { useEffect, useRef } from "react";

type Coin = { x: number; y: number; r: number; speed: number; rot: number; spin: number; alpha: number };
type Particle = { x: number; y: number; r: number; vx: number; vy: number; tint: string };
type Candle = { o: number; h: number; l: number; c: number; up: boolean };

export function CoinField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const coins: Coin[] = Array.from({ length: 30 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 14 + Math.random() * 18,
      speed: 0.012 + Math.random() * 0.02,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.4,
      alpha: 0.55 + Math.random() * 0.3,
    }));
    const particles: Particle[] = Array.from({ length: 36 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 8 + Math.random() * 28,
      vx: (Math.random() - 0.5) * 0.015,
      vy: -0.004 - Math.random() * 0.012,
      tint: Math.random() > 0.5 ? "34, 211, 238" : "168, 85, 247",
    }));
    const candles: Candle[] = [];
    let price = 100;
    function pushCandle() {
      const open = price;
      const close = open + (Math.random() - 0.48) * 6;
      candles.push({
        o: open,
        h: Math.max(open, close) + Math.random() * 2.4,
        l: Math.min(open, close) - Math.random() * 2.4,
        c: close,
        up: close >= open,
      });
      price = close;
      if (candles.length > 90) candles.shift();
    }
    for (let i = 0; i < 70; i += 1) pushCandle();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const slot = 18;
    let frame = 0;
    let last = performance.now();
    let scrollPx = 0;
    let gridShift = 0;
    let running = !reduced;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(window.innerWidth * ratio);
      canvas!.height = Math.floor(window.innerHeight * ratio);
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function drawGrid(width: number, height: number, drift: number) {
      const horizon = height * 0.62;
      const vanishX = width * 0.5 + Math.sin(drift * 0.05) * 24;
      context!.beginPath();
      context!.strokeStyle = "rgba(148, 163, 255, 0.16)";
      context!.lineWidth = 1;
      for (let i = 0; i < 8; i += 1) {
        const y = height - (height - horizon) * (i / 8) ** 1.6;
        context!.moveTo(0, y);
        context!.lineTo(width, y);
      }
      for (let i = -6; i <= 6; i += 1) {
        const foot = width * 0.5 + i * (width / 8) + ((drift * 12) % (width / 8));
        context!.moveTo(vanishX, horizon);
        context!.lineTo(foot, height);
      }
      context!.stroke();
    }

    function candleX(index: number, width: number) {
      const base = width - (candles.length - 1) * slot - 28;
      return base + index * slot - scrollPx;
    }

    function drawCandles(width: number, height: number) {
      const base = height * 0.58;
      const scale = height * 0.012;
      context!.lineWidth = 1.25;
      for (let i = 0; i < candles.length; i += 1) {
        const candle = candles[i];
        const x = candleX(i, width);
        if (x < -slot || x > width + slot) continue;
        const yHigh = base - candle.h * scale;
        const yLow = base - candle.l * scale;
        const yOpen = base - candle.o * scale;
        const yClose = base - candle.c * scale;
        context!.strokeStyle = candle.up ? "rgba(45, 212, 191, 0.85)" : "rgba(236, 72, 153, 0.8)";
        context!.fillStyle = candle.up ? "rgba(20, 184, 166, 0.55)" : "rgba(168, 85, 247, 0.45)";
        context!.beginPath();
        context!.moveTo(x, yHigh);
        context!.lineTo(x, yLow);
        context!.stroke();
        const top = Math.min(yOpen, yClose);
        const body = Math.max(2, Math.abs(yClose - yOpen));
        context!.fillRect(x - 4, top, 8, body);
      }
    }

    function drawLine(width: number, height: number) {
      const base = height * 0.46;
      const scale = height * 0.011;
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < candles.length; i += 1) {
        points.push({ x: candleX(i, width), y: base - candles[i].c * scale });
      }
      const visible = points.filter((point) => point.x > -20 && point.x < width + 20);
      if (visible.length < 2) return;
      const stroke = context!.createLinearGradient(0, 0, width, 0);
      stroke.addColorStop(0, "rgba(34, 211, 238, 0.15)");
      stroke.addColorStop(0.45, "rgba(34, 211, 238, 0.95)");
      stroke.addColorStop(1, "rgba(168, 85, 247, 0.95)");
      const fill = context!.createLinearGradient(0, base - 80, 0, height * 0.78);
      fill.addColorStop(0, "rgba(34, 211, 238, 0.28)");
      fill.addColorStop(1, "rgba(168, 85, 247, 0)");
      context!.beginPath();
      visible.forEach((point, index) => (index === 0 ? context!.moveTo(point.x, point.y) : context!.lineTo(point.x, point.y)));
      context!.strokeStyle = stroke;
      context!.lineWidth = 2.5;
      context!.stroke();
      context!.lineTo(visible[visible.length - 1].x, height * 0.78);
      context!.lineTo(visible[0].x, height * 0.78);
      context!.closePath();
      context!.fillStyle = fill;
      context!.fill();
    }

    function drawParticles(width: number, height: number, dt: number) {
      for (const particle of particles) {
        if (!reduced) {
          particle.x += particle.vx * dt * 40;
          particle.y += particle.vy * dt * 40;
          if (particle.y < -0.05) particle.y = 1.05;
          if (particle.x < -0.05) particle.x = 1.05;
          if (particle.x > 1.05) particle.x = -0.05;
        }
        const gradient = context!.createRadialGradient(particle.x * width, particle.y * height, 0, particle.x * width, particle.y * height, particle.r);
        gradient.addColorStop(0, `rgba(${particle.tint}, 0.45)`);
        gradient.addColorStop(1, `rgba(${particle.tint}, 0)`);
        context!.fillStyle = gradient;
        context!.beginPath();
        context!.arc(particle.x * width, particle.y * height, particle.r, 0, Math.PI * 2);
        context!.fill();
      }
    }

    function drawCoin(coin: Coin, width: number, height: number) {
      context!.save();
      context!.translate(coin.x * width, coin.y * height);
      context!.rotate(coin.rot);
      context!.globalAlpha = coin.alpha;
      context!.beginPath();
      context!.ellipse(0, 0, coin.r, coin.r * 0.92, 0, 0, Math.PI * 2);
      context!.fillStyle = "#243056";
      context!.fill();
      context!.lineWidth = 2;
      context!.strokeStyle = "#7dd3fc";
      context!.stroke();
      context!.fillStyle = "#e0f2fe";
      context!.font = `${Math.max(9, coin.r * 0.42)}px sans-serif`;
      context!.textAlign = "center";
      context!.textBaseline = "middle";
      context!.fillText("$", 0, 1);
      context!.restore();
    }

    function paint(now: number) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) {
        scrollPx += 22 * dt;
        gridShift += 10 * dt;
        while (scrollPx >= slot) {
          scrollPx -= slot;
          pushCandle();
          candles.shift();
        }
        for (const coin of coins) {
          coin.y -= coin.speed * dt;
          coin.rot += coin.spin * dt;
          if (coin.y < -0.08) coin.y = 1.08;
        }
      }
      context!.clearRect(0, 0, width, height);
      drawGrid(width, height, reduced ? 40 : gridShift);
      drawCandles(width, height);
      drawLine(width, height);
      drawParticles(width, height, reduced ? 0 : dt);
      for (const coin of coins) drawCoin(coin, width, height);
      if (running) frame = window.requestAnimationFrame(paint);
    }

    function onVisibility() {
      if (reduced) return;
      if (document.hidden) {
        running = false;
        window.cancelAnimationFrame(frame);
        return;
      }
      running = true;
      last = performance.now();
      frame = window.requestAnimationFrame(paint);
    }

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    last = performance.now();
    frame = window.requestAnimationFrame(paint);
    return () => {
      running = false;
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 opacity-45" />;
}
