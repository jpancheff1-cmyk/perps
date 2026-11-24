"use client";

import { useEffect, useRef } from "react";

type Logo = {
  x: number;
  y: number;
  size: number;
  angle: number;
  speed: number;
  rot: number;
  spin: number;
  zoom: boolean;
  phase: number;
};

export function CoinField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const circle = new Path2D();
    circle.arc(0, 0, 1, 0, Math.PI * 2);
    const arcs = new Path2D();
    arcs.arc(0, 0, 0.7, -1.2, 1.2);
    arcs.arc(0, 0, 0.7, Math.PI - 1.2, Math.PI + 1.2);
    const dollar = new Path2D();
    dollar.moveTo(0, -0.55);
    dollar.lineTo(0, 0.55);
    dollar.moveTo(0.22, -0.24);
    dollar.bezierCurveTo(0.22, -0.46, -0.28, -0.42, -0.2, -0.18);
    dollar.bezierCurveTo(-0.12, 0.02, 0.12, -0.02, 0.2, 0.18);
    dollar.bezierCurveTo(0.28, 0.42, -0.22, 0.46, -0.22, 0.24);

    const phoneQuery = window.matchMedia("(max-width: 767px)");
    let phone = phoneQuery.matches;
    let logos = makeLogos(phone);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();
    let lastPaint = 0;
    let running = !reduced;
    let scrollTimer = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(window.innerWidth * ratio);
      canvas!.height = Math.floor(window.innerHeight * ratio);
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function drawLogo(logo: Logo, width: number, height: number, dt: number) {
      const depth = (logo.size - 24) / 66;
      let scale = 1;
      if (!reduced && logo.zoom) {
        logo.phase += dt * 0.55;
        scale = 0.75 + (Math.sin(logo.phase) * 0.5 + 0.5) * 1.15;
      }
      const diameter = logo.size * scale;
      if (!reduced) {
        const pace = logo.speed * (logo.zoom ? 0.75 + scale * 0.45 : 1);
        logo.x += (Math.cos(logo.angle) * pace * dt) / width;
        logo.y += (Math.sin(logo.angle) * pace * dt) / height;
        logo.rot += logo.spin * dt;
        const padX = (diameter + 8) / width;
        const padY = (diameter + 8) / height;
        if (logo.x < -padX) logo.x = 1 + padX;
        if (logo.x > 1 + padX) logo.x = -padX;
        if (logo.y < -padY) logo.y = 1 + padY;
        if (logo.y > 1 + padY) logo.y = -padY;
      }
      const radius = diameter / 2;
      context!.save();
      context!.translate(logo.x * width, logo.y * height);
      context!.rotate(logo.rot);
      context!.scale(radius, radius);
      context!.globalAlpha = 0.38 + depth * 0.62;
      context!.fillStyle = "#2775CA";
      context!.fill(circle);
      context!.strokeStyle = "#ffffff";
      context!.lineCap = "round";
      context!.lineJoin = "round";
      context!.lineWidth = 0.16;
      context!.stroke(arcs);
      context!.lineWidth = 0.11;
      context!.stroke(dollar);
      context!.restore();
    }

    function paint(now: number) {
      if (phone && now - lastPaint < 32) {
        if (running) frame = window.requestAnimationFrame(paint);
        return;
      }
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      lastPaint = now;
      context!.clearRect(0, 0, width, height);
      const order = logos.slice().sort((a, b) => a.size - b.size);
      for (const logo of order) drawLogo(logo, width, height, reduced ? 0 : dt);
      if (running) frame = window.requestAnimationFrame(paint);
    }

    function onPhone() {
      const next = phoneQuery.matches;
      if (next === phone) return;
      phone = next;
      logos = makeLogos(phone);
    }

    function onScroll() {
      if (!phone || reduced || document.hidden) return;
      running = false;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        if (document.hidden || reduced) return;
        running = true;
        last = performance.now();
        lastPaint = 0;
        frame = window.requestAnimationFrame(paint);
      }, 180);
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
    phoneQuery.addEventListener("change", onPhone);
    window.addEventListener("scroll", onScroll, { passive: true });
    last = performance.now();
    frame = window.requestAnimationFrame(paint);
    return () => {
      running = false;
      window.clearTimeout(scrollTimer);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      phoneQuery.removeEventListener("change", onPhone);
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 opacity-35 md:opacity-55" />;
}

function makeLogos(phone: boolean): Logo[] {
  const count = phone ? 12 : 32;
  const span = phone ? 24 : 66;
  return Array.from({ length: count }, (_, index) => {
    const size = 24 + Math.random() * span;
    return {
      x: Math.random(),
      y: Math.random(),
      size,
      angle: Math.random() * Math.PI * 2,
      speed: (phone ? 12 : 26) + ((size - 24) / 66) * (phone ? 36 : 84),
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * (0.15 + size / 220),
      zoom: phone ? false : index % 8 === 0,
      phase: Math.random() * Math.PI * 2,
    };
  });
}
