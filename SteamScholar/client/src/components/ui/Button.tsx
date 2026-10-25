import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { audio } from '../../audio/audioManager';

type Variant = 'primary' | 'secondary' | 'secondary-on-cream';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
  size?: 'md' | 'lg';
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-[transform,box-shadow,background-color,border-color,color] duration-100 ' +
  'active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 select-none';

const variants: Record<Variant, string> = {
  // The only interactive accent: amber.
  primary:
    'bg-amber-500 text-ink-900 shadow-[0_3px_0_#8a5a1c,0_6px_14px_rgb(0_0_0/0.35)] hover:brightness-110 ' +
    'active:shadow-[0_1px_0_#8a5a1c] disabled:hover:brightness-100 disabled:shadow-none',
  secondary:
    'border-2 border-brass-500 text-cream-100 bg-transparent shadow-[0_2px_0_rgb(0_0_0/0.4)] hover:border-brass-300 hover:bg-iron-700 ' +
    'active:shadow-none disabled:hover:border-brass-500 disabled:hover:bg-transparent',
  'secondary-on-cream':
    'border-2 border-ink-900/70 text-ink-900 bg-transparent shadow-[0_2px_0_rgb(43_33_24/0.25)] hover:border-ink-900 hover:bg-cream-300 ' +
    'active:shadow-none disabled:hover:bg-transparent',
};

const sizes = { md: 'min-h-11 px-4 py-2 text-base', lg: 'min-h-12 px-6 py-3 text-lg' };

/** Spec 5.4 states: default, hover, focus-visible (global ring), active (lever press), disabled. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, className = '', children, onClick, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      onClick={(e) => {
        audio.click();
        onClick?.(e);
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});
