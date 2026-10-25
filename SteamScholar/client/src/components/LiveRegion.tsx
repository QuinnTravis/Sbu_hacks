import { useEffect, useState } from 'react';
import { setAnnouncer } from '../lib/a11y';

/** The single polite live region that announces "Correct" / "Not quite, see the explanation". */
export function LiveRegion() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    setAnnouncer((m) => {
      // Clear first so repeating the same message is still announced.
      setMessage('');
      requestAnimationFrame(() => setMessage(m));
    });
    return () => setAnnouncer(null);
  }, []);
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
