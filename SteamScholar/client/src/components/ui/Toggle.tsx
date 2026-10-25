import { useId } from 'react';
import { audio } from '../../audio/audioManager';

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange(checked: boolean): void;
}

/** Accessible switch: role="switch", state as text as well as position. */
export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="block font-semibold text-cream-100">
          {label}
        </label>
        {description && <p className="text-sm text-brass-300">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => {
          audio.click();
          onChange(!checked);
        }}
        className={`group relative inline-flex h-8 w-[4.5rem] shrink-0 items-center rounded-full border-2 transition-colors active:translate-y-[1px] ${
          checked ? 'border-amber-500 bg-amber-500/25' : 'border-brass-500 bg-iron-950 hover:border-brass-300'
        }`}
      >
        <span
          className={`absolute text-[0.65rem] font-bold uppercase tracking-wider ${
            checked ? 'left-2 text-amber-500' : 'right-2 text-brass-300'
          }`}
          aria-hidden="true"
        >
          {checked ? 'On' : 'Off'}
        </span>
        <span
          className={`absolute h-6 w-6 rounded-full shadow transition-[left] duration-150 ${
            checked ? 'left-[calc(100%-1.6rem)] bg-amber-500' : 'left-0.5 bg-brass-500'
          }`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
