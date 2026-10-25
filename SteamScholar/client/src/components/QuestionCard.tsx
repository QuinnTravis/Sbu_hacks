import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Question } from '../lib/types';
import type { Feedback } from '../store/gameStore';
import { AnswerButton, type AnswerState } from './AnswerButton';
import { Card } from './ui/Card';

interface QuestionCardProps {
  question: Question;
  feedback: Feedback | null;
  isRequeue: boolean;
  onAnswer(optionId: string): void;
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

export function QuestionCard({ question, feedback, isRequeue, onAnswer }: QuestionCardProps) {
  const headingRef = useRef<HTMLLegendElement | null>(null);

  // Move focus to each new question so screen readers read it and Tab starts at the answers.
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
          {isRequeue && (
            <span className="small-caps-label inline-flex items-center gap-1 rounded border border-copper-500 px-2 py-0.5 text-ink-900">
              <RotateCcw className="h-3 w-3" aria-hidden="true" /> Second look
            </span>
          )}
        </div>
        <fieldset>
          <legend
            ref={headingRef}
            tabIndex={-1}
            className="float-left mb-4 w-full text-lg font-semibold leading-normal text-ink-900 outline-none md:text-[1.3rem]"
          >
            {question.prompt}
          </legend>
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
        </fieldset>
      </Card>
    </motion.div>
  );
}
