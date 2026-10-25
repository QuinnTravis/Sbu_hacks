import { Check, X } from 'lucide-react';
import { audio } from '../audio/audioManager';

/** idle → (chosen) correct | incorrect; after a miss the right option is revealed; others dim. */
export type AnswerState = 'idle' | 'correct' | 'incorrect' | 'revealed' | 'dimmed';

interface AnswerButtonProps {
  keyHint: string;
  text: string;
  state: AnswerState;
  locked: boolean;
  onSelect(): void;
}

const styles: Record<AnswerState, string> = {
  idle: 'border-brass-500/70 bg-cream-100 hover:border-ink-900 hover:bg-cream-300 hover:shadow-md active:translate-y-[2px] active:shadow-none',
  correct: 'border-verdigris-500 bg-verdigris-500/20 shadow-[0_0_0_2px_var(--verdigris-500)]',
  incorrect: 'border-copper-500 bg-copper-500/15 shadow-[0_0_0_2px_var(--copper-500)]',
  revealed: 'border-verdigris-500 border-dashed bg-verdigris-500/10',
  dimmed: 'border-iron-700/30 bg-cream-100 opacity-60',
};

const status: Partial<Record<AnswerState, { label: string; srLabel: string }>> = {
  correct: { label: 'Correct', srLabel: 'your answer, correct' },
  incorrect: { label: 'Not quite', srLabel: 'your answer, not quite' },
  revealed: { label: 'Right answer', srLabel: 'the right answer' },
};

export function AnswerButton({ keyHint, text, state, locked, onSelect }: AnswerButtonProps) {
  const s = status[state];
  const isPositive = state === 'correct' || state === 'revealed';
  return (
    <button
      type="button"
      onClick={() => {
        if (locked) return;
        audio.click();
        onSelect();
      }}
      aria-disabled={locked}
      aria-label={`Option ${keyHint}: ${text}${s ? `, ${s.srLabel}` : ''}`}
      className={`flex min-h-14 w-full items-center gap-3 rounded-lg border-2 px-3 py-3 text-left text-lg leading-snug text-ink-900 transition-[transform,box-shadow,background-color,border-color] duration-100 ${styles[state]} ${
        locked ? 'cursor-default' : 'cursor-pointer'
      }`}
    >
      <kbd
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-sans text-sm font-bold ${
          isPositive ? 'bg-verdigris-500 text-iron-950' : state === 'incorrect' ? 'bg-copper-500 text-iron-950' : 'bg-ink-900 text-cream-100'
        }`}
        aria-hidden="true"
      >
        {state === 'correct' || state === 'revealed' ? <Check className="h-5 w-5" strokeWidth={3} /> : state === 'incorrect' ? <X className="h-5 w-5" strokeWidth={3} /> : keyHint}
      </kbd>
      <span className="flex-1">{text}</span>
      {s && (
        <span
          className={`small-caps-label shrink-0 rounded px-2 py-1 ${isPositive ? 'bg-verdigris-500/25 text-ink-900' : 'bg-copper-500/20 text-ink-900'}`}
          aria-hidden="true"
        >
          {s.label}
        </span>
      )}
    </button>
  );
}
