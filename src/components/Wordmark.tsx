/** The split coin: two halves (terracotta + saffron) with a hairline gap. */
export function SplitCoin({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M15 2 A14 14 0 0 0 15 30 Z" fill="var(--primary)" />
      <path d="M17 2 A14 14 0 0 1 17 30 Z" fill="var(--accent)" />
    </svg>
  )
}

/** "split easy" — all lowercase Fraunces; the dot on the i is the split coin. */
export function Wordmark({ size = 1.5 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: `${size}rem` }} aria-label="Split Easy" role="img">
      <span aria-hidden="true">
        spl
        <span className="wordmark-i">
          ı<SplitCoin className="wordmark-coin" size={14} />
        </span>
        t easy
      </span>
    </span>
  )
}
