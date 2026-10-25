import { motion } from 'framer-motion';
import { Check, History, LoaderCircle, MessageSquareText, RotateCcw, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Question } from '../lib/types';
import type { Feedback } from '../store/gameStore';
import { AnswerButton, type AnswerState } from './AnswerButton';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface QuestionCardProps {
  question: Question;
  feedback: Feedback | null;
  isRequeue: boolean;
  isReview: boolean;
  grading: boolean;
  onAnswer(optionId: string): void;
  onSubmitFree(text: string): void;
}

/** Keyboard hint per option: 1-4 for MCQ, T/F for true/false. */
export function keyHintFor(question: Question, index: number) {
  return question.type === 'tf' ? (question.options[index].id === 'true' ? 'T' : 'F') : String(index + 1);
}

function stateFor(optionId: string, question: Question, feedback: Feedback | null): AnswerState {
  if (!feedback) return 'idle';
  if (optionId === feedback.chosenOptionId) return feedback.correct ? 'correct' : 'incorrect';
  if (!feedback.correct && optionId === question.correctOptionId) return 'revealed';
  return 'dimmed';
}

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

const VERDICT_STYLE = {
  correct: { label: 'Correct', icon: Check, cls: 'border-verdigris-500 bg-verdigris-500/20' },
  partial: { label: 'Partly right', icon: Check, cls: 'border-verdigris-500 border-dashed bg-verdigris-500/10' },
  incorrect: { label: 'Not quite', icon: X, cls: 'border-copper-500 bg-copper-500/15' },
} as const;

/** Answer in your own words: typed here, or spoken with V (the transcript is submitted directly). */
function FreeResponse({ question, feedback, grading, onSubmit, labelId }: {
  question: Question;
  feedback: Feedback | null;
  grading: boolean;
  onSubmit(text: string): void;
  labelId: string;
}) {
  const [text, setText] = useState('');
  const locked = grading || Boolean(feedback);

  useEffect(() => setText(''), [question.id]);

  if (feedback?.verdict) {
    const v = VERDICT_STYLE[feedback.verdict];
    return (
      <div className={`rounded-lg border-2 p-3 text-ink-900 ${v.cls}`}>
        <p className="flex items-center gap-2 font-semibold">
          <v.icon className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
          <span className="small-caps-label">{v.label}</span>
        </p>
        <p className="mt-1">{feedback.graderFeedback}</p>
        <p className="mt-1 text-sm text-ink-900/80">
          You said: <q>{feedback.response}</q>
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!locked && text.trim()) onSubmit(text);
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={locked}
        maxLength={300}
        aria-labelledby={labelId}
        aria-describedby={`${labelId}-hint`}
        placeholder="Type your answer, or press V and say it"
        className="min-h-12 flex-1 rounded-lg border-2 border-brass-500/70 bg-cream-100 px-3 text-lg text-ink-900 placeholder:text-ink-900/60 hover:border-ink-900 focus:border-ink-900 disabled:opacity-60"
      />
      <Button type="submit" size="lg" disabled={locked || !text.trim()}>
        {grading ? (
          <>
            <LoaderCircle className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" /> Checking…
          </>
        ) : (
          'Submit'
        )}
      </Button>
      <p id={`${labelId}-hint`} className="sr-only">
        Answer in your own words. Press Enter to submit.
      </p>
    </form>
  );
}

export function QuestionCard({ question, feedback, isRequeue, isReview, grading, onAnswer, onSubmitFree }: QuestionCardProps) {
  const headingRef = useRef<HTMLLegendElement | null>(null);
  const legendId = useId();

  // Move focus to each new question so screen readers read it and Tab starts at the answers.
  // (Free-response too: focusing the input would make V type a letter instead of starting voice.)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [question.id, isRequeue]);

  return (
    <motion.div
      key={`${question.id}-${isRequeue}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <Card className="p-4 md:p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="small-caps-label rounded bg-ink-900 px-2 py-1 text-cream-100">{question.concept}</span>
          <span className="small-caps-label rounded border border-ink-900/40 px-2 py-0.5 text-ink-900">
            {DIFFICULTY_LABEL[question.difficulty]}
          </span>
          {question.type === 'short' && (
            <span className="small-caps-label inline-flex items-center gap-1 rounded border border-ink-900/40 px-2 py-0.5 text-ink-900">
              <MessageSquareText className="h-3 w-3" aria-hidden="true" /> Your own words
            </span>
          )}
          {isReview && (
            <span className="small-caps-label inline-flex items-center gap-1 rounded border border-copper-500 px-2 py-0.5 text-ink-900">
              <History className="h-3 w-3" aria-hidden="true" /> From last journey
            </span>
          )}
          {isRequeue && (
            <span className="small-caps-label inline-flex items-center gap-1 rounded border border-copper-500 px-2 py-0.5 text-ink-900">
              <RotateCcw className="h-3 w-3" aria-hidden="true" /> Second look
            </span>
          )}
        </div>
        <fieldset>
          <legend
            id={legendId}
            ref={headingRef}
            tabIndex={-1}
            className="float-left mb-4 w-full text-lg font-semibold leading-normal text-ink-900 outline-none md:text-[1.3rem]"
          >
            {question.prompt}
          </legend>
          {question.type === 'short' ? (
            <div className="clear-left">
              <FreeResponse question={question} feedback={feedback} grading={grading} onSubmit={onSubmitFree} labelId={legendId} />
            </div>
          ) : (
            <div className={`clear-left grid gap-3 ${question.type === 'tf' ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
              {question.options.map((opt, i) => (
                <AnswerButton
                  key={opt.id}
                  keyHint={keyHintFor(question, i)}
                  text={opt.text}
                  state={stateFor(opt.id, question, feedback)}
                  locked={Boolean(feedback)}
                  onSelect={() => onAnswer(opt.id)}
                />
              ))}
            </div>
          )}
        </fieldset>
      </Card>
    </motion.div>
  );
}
