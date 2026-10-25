type Listener = (message: string) => void;
let listener: Listener | null = null;

/** Registered by <LiveRegion />, the single aria-live="polite" region in the app. */
export function setAnnouncer(fn: Listener | null) {
  listener = fn;
}

export function announce(message: string) {
  listener?.(message);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True when a key event came from a control that already handles Enter/Space itself. */
export function isFromInteractive(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  return Boolean(target?.closest('button, a, input, textarea, select, [role="switch"]'));
}
