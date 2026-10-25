import type { Feedback } from '../store/gameStore';
import type { Question, RunReport } from './types';

/** Rewrite notation that text-to-speech reads badly ("O(n^2)" → "big O of n squared"). */
export function speakable(text: string): string {
  return text
    .replace(/\bO\(([^)]*)\)/g, (_, inner: string) => `big O of ${inner}`)
    .replace(/(\w)\s*\^\s*2\b|(\w)²/g, (_, a: string, b: string) => `${a ?? b} squared`)
    .replace(/(\w)\s*\^\s*3\b|(\w)³/g, (_, a: string, b: string) => `${a ?? b} cubed`)
    .replace(/(\w)\s*\^\s*(\w+)/g, '$1 to the $2')
    .replace(/\s*(->|→)\s*/g, ' to ')
    .replace(/\s*!=\s*/g, ' not equal to ')
    .replace(/\s*==\s*/g, ' equals ')
    .replace(/\s*≈\s*/g, ' about ')
    .replace(/(\w)_(\w)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function questionNarration(q: Question, isRequeue: boolean, isReview = false): string {
  const intro = isReview ? 'From your last journey. ' : isRequeue ? 'Second look. ' : '';
  if (q.type === 'tf') return speakable(`${intro}True or false. ${sentence(q.prompt)}`);
  if (q.type === 'short') return speakable(`${intro}Answer in your own words. ${sentence(q.prompt)}`);
  const options = q.options.map((o, i) => `${i + 1}: ${sentence(o.text)}`).join(' ');
  return speakable(`${intro}${sentence(q.prompt)} ${options}`);
}

export function maintenanceNarration(q: Question, feedback?: Feedback | null): string {
  const right = q.type === 'short' ? (q.answer ?? '') : (q.options.find((o) => o.id === q.correctOptionId)?.text ?? '');
  const source = q.source.page !== null ? ` From your notes, page ${q.source.page}.` : '';
  const grader = feedback?.graderFeedback
    ? `${sentence(feedback.graderFeedback)} `
    : feedback?.misconception
      ? `Likely mix-up: ${sentence(feedback.misconception)} `
      : '';
  const lead = q.type === 'short' ? 'The answer from your notes:' : 'The right answer is:';
  return speakable(`Not quite. ${grader}${lead} ${sentence(right)} ${sentence(q.explanation)}${source} Say continue when you're ready.`);
}

export function stationNarration(name: string, correct: number, answered: number, final: boolean): string {
  const score = `You answered ${correct} of ${answered} correctly.`;
  // The final line stays short: the report opens 2.5 s later and narrates the totals.
  return final ? `${name}. End of the line!` : `Arrived at ${name}. ${score} Say depart when you're ready.`;
}

function progressSentence(r: RunReport): string {
  if (!r.previous) return '';
  const delta = r.accuracy - r.previous.accuracy;
  const change = delta > 0 ? `up ${delta} points` : delta < 0 ? `down ${-delta} points` : 'the same';
  return ` That's ${change} from your last journey.`;
}

export function reportNarration(r: RunReport): string {
  const revisit = r.concepts.filter((c) => c.accuracy < 70).map((c) => c.concept);
  const tail = revisit.length ? `Topics to revisit: ${revisit.join(', ')}.` : 'Nothing to revisit. Full steam ahead!';
  return speakable(
    `Journey complete. You scored ${r.accuracy} percent, ${r.correctAnswers} of ${r.totalAnswers}.${progressSentence(r)} Best streak: ${r.bestStreak}. ${tail}`,
  );
}

export const PHRASES = {
  correct: 'Correct!',
  checking: 'Checking your answer.',
  eyesFreeOn: "Eyes-free mode on. I'll read each question aloud. Answer by saying one to four, true or false, or in your own words. Say repeat to hear it again.",
  notHeard: (tf: boolean) => (tf ? "Sorry, I didn't catch that. Say true or false." : "Sorry, I didn't catch that. Say one, two, three, or four."),
  stillThere: 'Still there? Say an answer, or press V to talk.',
  approaching: (name: string) => `Leg complete. Approaching ${name}.`,
} as const;
