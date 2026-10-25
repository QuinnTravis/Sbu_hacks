import type { HTMLAttributes } from 'react';

/** Cream card with faint paper grain, for readable learning content. */
export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`paper-card rounded-lg ${className}`} {...rest} />;
}
