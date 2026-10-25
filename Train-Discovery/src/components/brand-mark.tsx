/** The Gaze compass: steel hairline ring and ticks, brass north needle. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="brand-compass"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="var(--steel)" strokeLinecap="round">
        <circle cx="16" cy="16" r="11.5" strokeWidth="1.2" />
        <path d="M16 2.5v2.6M16 26.9v2.6M2.5 16h2.6M26.9 16h2.6" strokeWidth="1.4" />
      </g>
      <path d="M22.4 9.6 17.3 17.3 14.7 14.7z" fill="var(--brass)" />
      <path d="M9.6 22.4 17.3 17.3 14.7 14.7z" fill="var(--steel)" />
      <circle cx="16" cy="16" r="1.4" fill="var(--ink)" />
    </svg>
  );
}
