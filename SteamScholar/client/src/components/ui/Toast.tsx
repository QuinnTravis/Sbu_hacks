import { AnimatePresence, motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  id: number;
  show(message: string): void;
}

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set, get) => ({
  message: null,
  id: 0,
  show(message) {
    clearTimeout(hideTimer);
    set({ message, id: get().id + 1 });
    hideTimer = setTimeout(() => set({ message: null }), 4000);
  },
}));

export const toast = (message: string) => useToast.getState().show(message);

export function Toaster() {
  const { message, id } = useToast();
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <AnimatePresence>
        {message && (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="rivet-panel flex items-center gap-2 rounded-md px-4 py-3 text-sm text-cream-100"
          >
            <Info className="h-4 w-4 shrink-0 text-brass-300" aria-hidden="true" />
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
