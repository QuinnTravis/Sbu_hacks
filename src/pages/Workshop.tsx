import { useState } from 'react';
import { Check, Eye, Lock } from 'lucide-react';
import Engine from '../components/engine/Engine';
import { Bar } from '../components/ui';
import { COSMETICS, SLOT_LABELS, type CosmeticItem } from '../data/catalog';
import { ACHIEVEMENTS, requirementText, xpForLevel } from '../lib/progression';
import { useStore } from '../state/store';
import type { CosmeticSlot, Equipped } from '../types';

const SLOTS: CosmeticSlot[] = ['finish', 'gauge', 'steam'];

export default function Workshop() {
  const { state, condition, progress, reducedMotion, act, notify } = useStore();
  const [preview, setPreview] = useState<CosmeticItem | null>(null);
  const shown: Equipped = preview ? { ...state.equipped, [preview.slot]: preview.id } : state.equipped;
  const unlockedCount = COSMETICS.filter((c) => progress.unlocked.has(c.id)).length;

  const choose = (item: CosmeticItem) => {
    if (progress.unlocked.has(item.id)) {
      act({ type: 'equip', slot: item.slot, id: item.id }, { silent: true });
      setPreview(null);
      if (state.equipped[item.slot] !== item.id) notify({ kind: 'info', title: `Fitted: ${item.name}`, body: 'Saved to your engine.' });
    } else {
      setPreview(item);
    }
  };

  const reqProgress = (item: CosmeticItem): { frac: number; text: string } | null => {
    const r = item.requirement;
    if (r.kind === 'level') {
      const need = xpForLevel(r.level);
      return { frac: Math.min(1, progress.xp / need), text: `${Math.max(0, need - progress.xp)} XP to go` };
    }
    if (r.kind === 'achievement') {
      const a = ACHIEVEMENTS.find((x) => x.id === r.id);
      if (!a) return null;
      const p = progress.achievementProgress[a.id] ?? 0;
      return { frac: p / a.goal, text: `${p} of ${a.goal}` };
    }
    return null;
  };

  return (
    <div className="stack">
      <div className="workshop">
        <div className="preview-sticky">
          <section className="plate rivets" aria-labelledby="pv-h">
            <div className="plate-head">
              <div>
                <div className="eyebrow">Workshop</div>
                <h2 id="pv-h">Fit out your engine</h2>
              </div>
              <span className="small muted">
                {unlockedCount} of {COSMETICS.length} parts unlocked
              </span>
            </div>
            <div className="preview-frame">
              <Engine condition={condition} equipped={shown} reducedMotion={reducedMotion} compact />
            </div>
            <div className="row" style={{ marginTop: 12, minHeight: 38 }}>
              {preview ? (
                <>
                  <Eye size={18} color="var(--brass)" aria-hidden="true" />
                  <span className="small" style={{ flex: 1, minWidth: 180 }}>
                    Previewing <b>{preview.name}</b>. Locked: {requirementText(preview).toLowerCase()} to fit it.
                  </span>
                  <button className="btn sm ghost" onClick={() => setPreview(null)}>
                    End preview
                  </button>
                </>
              ) : (
                <span className="small muted">Fitted parts apply everywhere straight away and are saved. Select a locked part to preview it.</span>
              )}
            </div>
          </section>
        </div>

        <div className="stack">
          {SLOTS.map((slot) => (
            <section key={slot} className="plate rivets" aria-labelledby={`slot-${slot}`}>
              <div className="plate-head">
                <div>
                  <div className="eyebrow">{SLOT_LABELS[slot].hint}</div>
                  <h3 id={`slot-${slot}`}>{SLOT_LABELS[slot].title}</h3>
                </div>
              </div>
              <div className="items">
                {COSMETICS.filter((c) => c.slot === slot).map((item) => {
                  const unlocked = progress.unlocked.has(item.id);
                  const equipped = state.equipped[slot] === item.id;
                  const previewing = preview?.id === item.id;
                  const rp = unlocked ? null : reqProgress(item);
                  return (
                    <button
                      key={item.id}
                      className={`item${unlocked ? '' : ' locked'}`}
                      aria-pressed={equipped || previewing}
                      onClick={() => choose(item)}
                      aria-label={`${item.name}. ${equipped ? 'Fitted.' : unlocked ? 'Unlocked, select to fit.' : `Locked. ${requirementText(item)}. Select to preview.`}`}
                    >
                      <span className="swatch" style={{ background: `linear-gradient(135deg, ${item.swatch.join(', ')})` }}>
                        {!unlocked && (
                          <span className="lock">
                            <Lock />
                          </span>
                        )}
                      </span>
                      <span>
                        <span className="nm">{item.name}</span>
                        <br />
                        <span className="ds">{item.description}</span>
                        {!unlocked && (
                          <>
                            <br />
                            <span className="req">
                              <Lock aria-hidden="true" /> {requirementText(item)}
                              {rp && <span className="muted">· {rp.text}</span>}
                            </span>
                            {rp && <Bar value={rp.frac} label={`Progress toward unlocking ${item.name}`} className="" />}
                          </>
                        )}
                      </span>
                      <span>
                        {equipped ? (
                          <span className="badge-eq">
                            <Check size={14} style={{ verticalAlign: -2 }} /> Fitted
                          </span>
                        ) : unlocked ? (
                          <span className="small" style={{ color: 'var(--brass-hi)' }}>Fit</span>
                        ) : previewing ? (
                          <span className="small muted">Previewing</span>
                        ) : (
                          <span className="small muted">Preview</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <section className="plate rivets" aria-labelledby="med-h">
        <div className="plate-head">
          <div>
            <div className="eyebrow">Commendations</div>
            <h2 id="med-h">Achievements</h2>
          </div>
          <span className="small muted">
            {progress.earned.size} of {ACHIEVEMENTS.length} earned · each worth 25 XP
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
                  {!got && a.goal > 1 && <Bar value={p / a.goal} label={`${a.name} progress: ${p} of ${a.goal}`} />}
                  {got && <span style={{ color: 'var(--ok)', marginTop: 2 }}>Earned</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Medal({ earned }: { earned: boolean }) {
  return (
    <svg className="m" viewBox="0 0 44 44" aria-hidden="true">
      <path d="M14 2 L22 14 L30 2 Z" fill={earned ? '#8a2f22' : '#3a2e24'} />
      <circle cx={22} cy={26} r={15} fill={earned ? '#c99a4b' : '#2c241c'} stroke={earned ? '#ffe3a0' : '#4a3d2e'} strokeWidth={1.5} />
      <circle cx={22} cy={26} r={10.5} fill="none" stroke={earned ? '#7a5a26' : '#4a3d2e'} strokeDasharray="2 2" />
      {earned ? <path d="M17 26.5 l3.5 3.5 l7 -7.5" fill="none" stroke="#2a1d0e" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /> : <circle cx={22} cy={26} r={2.5} fill="#4a3d2e" />}
    </svg>
  );
}
