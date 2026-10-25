import type { HTMLAttributes } from 'react';

/** Iron panel with a thin riveted brass border. */
export function Panel({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rivet-panel rounded-lg ${className}`} {...rest} />;
}
