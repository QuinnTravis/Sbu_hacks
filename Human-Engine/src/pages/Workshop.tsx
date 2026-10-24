import { useState } from 'react';
import Engine from '../components/engine/Engine';
import { COSMETICS, SLOT_LABELS, type CosmeticItem } from '../data/catalog';
import { ACHIEVEMENTS, requirementText, xpForLevel } from '../lib/progression';
import { useStore } from '../state/store';
import type { CosmeticSlot, Equipped } from '../types';

const SLOTS: { slot: CosmeticSlot; prefix: string }[] = [
  { slot: 'finish', prefix: 'F' },
  { slot: 'gauge', prefix: 'G' },
  { slot: 'steam', prefix: 'S' },
];

export default function Workshop() {
  const { state, condition, progress, reducedMotion, act, notify } = useStore();
  const [preview, setPreview] = useState<CosmeticItem | null>(null);
  const shown: Equipped = preview ? { ...state.equipped, [preview.slot]: preview.id } : state.equipped;
  const unlocked = COSMETICS.filter((c) => progress.unlocked.has(c.id)).length;

  const choose = (item: CosmeticItem) => {
    if (progress.unlocked.has(item.id)) {
      if (state.equipped[item.slot] !== item.id) notify({ kind: 'info', title: `Fitted: ${item.name}` });
      act({ type: 'equip', slot: item.slot, id: item.id }, { silent: true });
      setPreview(null);
    } else setPreview(item);
  };

  const remaining = (item: CosmeticItem): string | null => {
    const r = item.requirement;
    if (r.kind === 'level') return `${Math.max(0, xpForLevel(r.level) - progress.xp)} XP to go`;
    if (r.kind === 'achievement') {
      const a = ACHIEVEMENTS.find((x) => x.id === r.id);
      return a && a.goal > 1 ? `${progress.achievementProgress[a.id] ?? 0} of ${a.goal} so far` : null;
    }
    return null;
  };

  return (
    <>
      <div className="workshop">
        <div className="preview-sticky">
          <div className="sec-head">
            <h2>Workshop</h2>
            <span className="aside">
              {unlocked} of {COSMETICS.length} parts in stock
            </span>
          </div>
          <div className="sheet">
            <Engine condition={condition} equipped={shown} reducedMotion={reducedMotion} compact />
          </div>
          <p className="hint" style={{ marginTop: 14, minHeight: 40 }} aria-live="polite">
            {preview ? (
              <>
                Trying on <b style={{ color: 'var(--parchment)' }}>{preview.name}</b>. It isn’t in stock yet: {requirementText(preview).toLowerCase()}.{' '}
                <button className="linkish" onClick={() => setPreview(null)}>
                  Put it back
                </button>
              </>
            ) : (
              'Parts you fit appear across the app straight away and are saved. Choose a part that isn’t in stock yet to try it on.'
            )}
          </p>
        </div>

        <div>
          {SLOTS.map(({ slot, prefix }) => {
            const items = COSMETICS.filter((c) => c.slot === slot);
            return (
              <section key={slot} className="catalogue" aria-labelledby={`slot-${slot}`}>
                <div className="sec-head" style={{ marginBottom: 8 }}>
                  <h3 id={`slot-${slot}`}>{SLOT_LABELS[slot].title}</h3>
                  <span className="aside">{SLOT_LABELS[slot].hint}</span>
                </div>
                {items.map((item, i) => {
                  const have = progress.unlocked.has(item.id);
                  const fitted = state.equipped[slot] === item.id;
                  const trying = preview?.id === item.id;
                  const left = have ? null : remaining(item);
                  return (
                    <button
                      key={item.id}
                      className={`part${have ? '' : ' locked'}`}
                      aria-pressed={fitted || trying}
                      onClick={() => choose(item)}
                      aria-label={`${item.name}. ${fitted ? 'Fitted.' : have ? 'In stock. Choose to fit.' : `Not in stock: ${requirementText(item)}. Choose to try it on.`}`}
                    >
                      <span className="no">
                        {prefix}-{String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="sw" style={{ background: `linear-gradient(135deg, ${item.swatch.join(', ')})` }} />
                      <span>
                        <span className="nm">{item.name}</span>
                        <span className="ds">{item.description}</span>
                        {!have && (
                          <span className="req">
                            {requirementText(item)}
                            {left ? ` · ${left}` : ''}
                          </span>
                        )}
                      </span>
                      <span className={`st${fitted ? ' fitted' : ''}`}>{fitted ? 'Fitted' : have ? 'Fit' : trying ? 'Trying on' : 'Try on'}</span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>

      <section className="block" aria-labelledby="med-h" style={{ marginTop: 56 }}>
        <div className="sec-head">
          <h2 id="med-h">Commendations</h2>
          <span className="aside">
            {progress.earned.size} of {ACHIEVEMENTS.length} awarded · 25 XP each
          </span>
        </div>
        <div className="medals">
          {ACHIEVEMENTS.map((a) => {
            const got = progress.earned.has(a.id);
            const p = progress.achievementProgress[a.id] ?? 0;
            return (
              <div key={a.id} className={`medal${got ? '' : ' locked'}`}>
                <Medal earned={got} />
                <div>
                  <b>{a.name}</b>
                  <span>{a.description}</span>
                  <span className="prog">{got ? 'awarded' : a.goal > 1 ? `${p} of ${a.goal}` : 'not yet'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Medal({ earned }: { earned: boolean }) {
  const c = earned ? 'var(--brass)' : 'var(--faint)';
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true" fill="none" stroke={c} strokeWidth="1.2">
      <path d="M10 1.5 L15 9 L20 1.5" />
      <circle cx="15" cy="18" r="9.5" fill={earned ? 'rgba(181,154,97,0.14)' : 'none'} />
      <circle cx="15" cy="18" r="6.5" strokeDasharray="1.5 1.5" />
      {earned && <path d="M11.8 18.2 l2.2 2.2 l4.2 -4.6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
