export function CoinMark({ base, size = 36 }: { base: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-[#FF8A1F]/50 bg-gradient-to-br from-[#FF8A1F]/35 to-[#3A2414] font-semibold tracking-tight text-[#FFF4EA]"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.3) }}
    >
      {base.slice(0, 3)}
    </span>
  );
}
