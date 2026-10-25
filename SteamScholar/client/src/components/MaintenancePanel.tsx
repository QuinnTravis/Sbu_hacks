import { motion } from 'framer-motion';
import { BookOpen, Lightbulb, Wrench } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Question } from '../lib/types';
import type { Feedback } from '../store/gameStore';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface MaintenancePanelProps {
  question: Question;
  feedback: Feedback | null;
  onDismiss(): void;
}

/** Supportive explanation after a miss: right answer, why, and where it is in the notes. */
export function MaintenancePanel({ question, feedback, onDismiss }: MaintenancePanelProps) {
  const rightAnswer =
    question.type === 'short' ? question.answer : question.options.find((o) => o.id === question.correctOptionId)?.text;
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Focus the action without scrolling the header out of the (short) bottom panel.
  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="maintenance-title"
      aria-describedby="maintenance-why"
    >
      <Card className="flex flex-col border-t-4 border-brass-500 p-4 md:p-5">
        {/* On mobile the header flattens so the button can sit after the explanation. */}
        <div className="contents md:mb-3 md:flex md:items-center md:justify-between md:gap-3">
          <h2 id="maintenance-title" className="mb-3 flex items-center gap-2 text-xl font-bold text-ink-900 md:mb-0">
            <Wrench className="h-6 w-6 text-copper-500" aria-hidden="true" />
            Maintenance Stop
          </h2>
          <Button ref={buttonRef} onClick={onDismiss} className="order-last mt-4 self-end md:order-none md:mt-0 md:self-auto">
            Back on track
          </Button>
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-ink-900 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-3">
            <div>
              <dt className="small-caps-label text-ink-900/80">The right answer</dt>
              <dd className={`font-semibold leading-snug ${(rightAnswer?.length ?? 0) > 60 ? 'text-base' : 'text-lg'}`}>
                {rightAnswer}
              </dd>
            </div>

            {question.source.page !== null && (
              <div>
                <dt className="small-caps-label text-ink-900/80">From your notes</dt>
                <dd className="inline-flex items-center gap-1.5 font-medium">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  {question.source.label}
                </dd>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {feedback?.response && (
              <div>
                <dt className="small-caps-label text-ink-900/80">You said</dt>
                <dd>
                  <q>{feedback.response}</q>
                  {feedback.graderFeedback && <span className="text-ink-900/90"> · {feedback.graderFeedback}</span>}
                </dd>
              </div>
            )}
            {feedback?.misconception && question.type !== 'short' && (
              <div>
                <dt className="small-caps-label text-ink-900/80">Likely mix-up</dt>
                <dd className="flex items-start gap-1.5">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-copper-500" aria-hidden="true" />
                  {feedback.misconception}
                </dd>
              </div>
            )}
            <div>
              <dt className="small-caps-label text-ink-900/80">Why</dt>
              <dd id="maintenance-why" className="text-base leading-relaxed">
                {question.explanation}
              </dd>
            </div>
          </div>
        </dl>
        <p className="mt-3 text-sm text-ink-900/80">No worries. This one will come back around shortly.</p>
      </Card>
    </motion.div>
  );
}
