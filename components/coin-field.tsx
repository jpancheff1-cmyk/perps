"use client";

import { useEffect, useRef } from "react";

type Coin = {
  x: number;
  y: number;
  r: number;
  speed: number;
  rot: number;
  spin: number;
  alpha: number;
};

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
      r: 12 + Math.random() * 16,
      speed: 0.008 + Math.random() * 0.016,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.35,
      alpha: 0.08 + Math.random() * 0.1,
    }));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(window.innerWidth * ratio);
      canvas!.height = Math.floor(window.innerHeight * ratio);
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function drawCoin(coin: Coin, width: number, height: number) {
      const x = coin.x * width;
      const y = coin.y * height;
      context!.save();
      context!.translate(x, y);
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
      context!.font = `${Math.max(8, coin.r * 0.42)}px sans-serif`;
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
      context!.clearRect(0, 0, width, height);
      for (const coin of coins) {
        if (!reduced) {
          coin.y -= coin.speed * dt;
          coin.rot += coin.spin * dt;
          if (coin.y < -0.08) coin.y = 1.08;
        }
        drawCoin(coin, width, height);
      }
      if (!reduced) frame = window.requestAnimationFrame(paint);
    }

    resize();
    window.addEventListener("resize", resize);
    frame = window.requestAnimationFrame(paint);
    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0" />;
}
