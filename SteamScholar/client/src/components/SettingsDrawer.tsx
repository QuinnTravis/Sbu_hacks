import { Mic, Settings as SettingsIcon, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useState } from 'react';
import { testMicrophone, voiceSupported } from '../audio/voiceInput';
import { useGameStore } from '../store/gameStore';
import { Drawer } from './ui/Drawer';
import { Toggle } from './ui/Toggle';

const KEYS: [string, string][] = [
  ['1 – 4', 'Answer a multiple-choice question'],
  ['T / F', 'Answer true or false'],
  ['Enter / Space', 'Continue, Back on track, Depart'],
  ['V', 'Speak your answer (or say continue / depart)'],
  ['R', 'Repeat what was just read aloud'],
  ['Esc', 'Close this drawer'],
];

export function SettingsDrawer() {
  const open = useGameStore((s) => s.settingsOpen);
  const settings = useGameStore((s) => s.settings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const setOpen = useGameStore((s) => s.setSettingsOpen);
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <Drawer open={open} title="Settings" onClose={close}>
      <div className="divide-y divide-iron-700">
        <Toggle
          label="Sound"
          description="Whistle, chug and feedback sounds"
          checked={settings.sound}
          onChange={(sound) => updateSettings({ sound })}
        />
        <Toggle
          label="Eyes-free mode"
          description="Reads everything aloud and listens for spoken answers"
          checked={settings.eyesFree}
          onChange={(eyesFree) => updateSettings({ eyesFree })}
        />
        <Toggle
          label="Reduce motion"
          description="No camera shake, fewer particles, instant gauges"
          checked={settings.reduceMotion}
          onChange={(reduceMotion) => updateSettings({ reduceMotion })}
        />
      </div>
      <MicTest />
      <h3 className="small-caps-label mt-8 mb-3 text-brass-300">Keyboard</h3>
      <dl className="space-y-2 text-sm">
        {KEYS.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4">
            <dt>
              <kbd className="rounded border border-brass-500 px-1.5 py-0.5 font-sans text-xs font-semibold text-cream-100">{k}</kbd>
            </dt>
            <dd className="text-right text-cream-300">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-auto pt-6 text-xs text-cream-300">Settings are saved on this device.</p>
    </Drawer>
  );
}

/** One-utterance microphone check, so voice problems surface before the demo, not during it. */
function MicTest() {
  const [state, setState] = useState<{ status: 'idle' | 'listening' | 'ok' | 'error'; text: string }>({ status: 'idle', text: '' });
  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={state.status === 'listening'}
        onClick={async () => {
          setState({ status: 'listening', text: '' });
          const r = await testMicrophone();
          setState(r.ok ? { status: 'ok', text: r.heard } : { status: 'error', text: r.reason });
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-md border-2 border-brass-500 px-3 py-1.5 font-semibold text-cream-100 hover:border-brass-300 hover:bg-iron-700 active:translate-y-[1px] disabled:opacity-60"
      >
        <Mic className="h-4 w-4" aria-hidden="true" />
        {state.status === 'listening' ? 'Listening… say "two"' : 'Test microphone'}
      </button>
      <p role="status" className="mt-2 min-h-5 text-sm">
        {state.status === 'ok' && (
          <span className="text-cream-100">
            Heard: <q>{state.text}</q>. Voice answers are ready.
          </span>
        )}
        {state.status === 'error' && <span className="text-cream-100">{state.text}</span>}
        {state.status === 'idle' && !voiceSupported && <span className="text-cream-300">Voice input needs Chrome, Edge or Safari.</span>}
      </p>
    </div>
  );
}

/** Sound toggle + settings button, used in the HUD and on the Depot/Report corners. */
export function CornerControls({ className = '' }: { className?: string }) {
  const sound = useGameStore((s) => s.settings.sound);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const setOpen = useGameStore((s) => s.setSettingsOpen);
  const btn =
    'flex h-10 w-10 items-center justify-center rounded-md border border-brass-500/70 bg-iron-900/85 text-brass-300 hover:border-brass-300 hover:text-cream-100 active:translate-y-[1px]';
  return (
    <div className={`flex gap-2 ${className}`}>
      <button
        type="button"
        className={btn}
        aria-pressed={!sound}
        aria-label={sound ? 'Mute sound' : 'Unmute sound'}
        onClick={() => updateSettings({ sound: !sound })}
      >
        {sound ? <Volume2 className="h-5 w-5" aria-hidden="true" /> : <VolumeX className="h-5 w-5" aria-hidden="true" />}
      </button>
      <button type="button" className={btn} aria-label="Open settings" onClick={() => setOpen(true)}>
        <SettingsIcon className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
