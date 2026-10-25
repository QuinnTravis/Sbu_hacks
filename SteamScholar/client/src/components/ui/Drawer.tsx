import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}

/** Right-side drawer. Esc closes; focus moves in on open and back to the opener on close. */
export function Drawer({ open, title, onClose, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // Keep Tab inside the drawer while it is open.
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      (panel?.querySelector<HTMLElement>('[role="switch"]') ?? panel?.querySelector<HTMLElement>('button'))?.focus();
    });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-iron-950/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            className="rivet-panel absolute inset-y-0 right-0 flex w-full max-w-sm flex-col p-6"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="drawer-title" className="font-display text-2xl text-brass-500">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="rounded-md p-2 text-brass-300 hover:bg-iron-700 hover:text-cream-100 active:translate-y-[1px]"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
