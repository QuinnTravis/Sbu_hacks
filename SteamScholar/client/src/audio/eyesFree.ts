import { maintenanceNarration, PHRASES, questionNarration, reportNarration, stationNarration } from '../lib/narration';
import { STATION_COUNT, STATION_NAMES } from '../store/gameConfig';
import { useGameStore } from '../store/gameStore';
import { narrator } from './narrator';
import { listen, stopListening, type Unmatched } from './voiceInput';

/** After this many misheard or silent tries in a row, stop auto-listening until the player presses V. */
const MAX_REPROMPTS = 2;

let reprompts = 0;

function onUnmatched(reason: Unmatched) {
  if (!useGameStore.getState().settings.eyesFree) return;
  if (reprompts >= MAX_REPROMPTS) {
    reprompts = 0;
    narrator.speak(PHRASES.stillThere, undefined, { remember: false });
    return;
  }
  reprompts++;
  const tf = useGameStore.getState().current?.type === 'tf';
  narrator.speak(reason === 'silence' ? PHRASES.stillThere : PHRASES.notHeard(tf), () => listen(onUnmatched), { remember: false });
}

/** Speak, then listen for the reply. */
function prompt(text: string) {
  reprompts = 0;
  narrator.speak(text, () => listen(onUnmatched));
}

/** Re-read whatever the current moment is; used by the R key and when the mode is switched on. */
export function narrateCurrent(intro?: string) {
  const s = useGameStore.getState();
  const prefix = intro ? `${intro} ` : '';
  if (s.phase === 'playing' && s.current && !s.feedback) prompt(prefix + questionNarration(s.current, s.currentIsRequeue, s.currentIsReview));
  else if (s.phase === 'maintenance' && s.current) prompt(prefix + maintenanceNarration(s.current, s.feedback));
  else if (intro) narrator.speak(intro);
  else narrator.repeat(() => listen(onUnmatched));
}

export function listenForReply() {
  reprompts = 0;
  listen(onUnmatched);
}

/** Drives narration and auto-listening from game state while eyes-free mode is on. */
export function initEyesFree(): () => void {
  return useGameStore.subscribe((s, prev) => {
    if (s.settings.eyesFree !== prev.settings.eyesFree) {
      if (s.settings.eyesFree) narrateCurrent(PHRASES.eyesFreeOn);
      else {
        narrator.stop();
        stopListening();
      }
      return;
    }
    if (!s.settings.eyesFree) return;
    if (!s.settings.sound && prev.settings.sound) {
      narrator.stop();
      return;
    }

    if (s.phase === 'depot' || s.phase === 'loading') {
      if (prev.phase !== s.phase) {
        narrator.stop();
        stopListening();
      }
      return;
    }

    const newQuestion = s.current && (s.current !== prev.current || s.currentIsRequeue !== prev.currentIsRequeue);
    if (s.phase === 'playing' && newQuestion && !s.feedback) {
      prompt(questionNarration(s.current!, s.currentIsRequeue, s.currentIsReview));
    } else if (s.grading && !prev.grading) {
      stopListening();
      narrator.speak(PHRASES.checking, undefined, { remember: false });
    } else if (s.feedback && !prev.feedback) {
      stopListening();
      // A miss is narrated by the Maintenance Stop 600 ms later; a hit gets a quick confirmation,
      // plus the grader's sentence for free responses.
      const f = s.feedback;
      if (f.correct) {
        const lead = f.verdict === 'partial' ? 'Partly right.' : PHRASES.correct;
        narrator.speak(f.graderFeedback ? `${lead} ${f.graderFeedback}` : lead, undefined, { remember: false });
      }
    } else if (s.phase === 'maintenance' && prev.phase !== 'maintenance' && s.current) {
      prompt(maintenanceNarration(s.current, s.feedback));
    } else if (s.stopAtNextStation && !prev.stopAtNextStation && s.phase === 'playing') {
      narrator.speak(PHRASES.approaching(STATION_NAMES[s.stationIndex]));
    } else if (s.phase === 'station' && prev.phase !== 'station') {
      const leg = s.answered.filter((a) => a.stationIndex === s.stationIndex);
      const final = s.stationIndex === STATION_COUNT - 1;
      const text = stationNarration(STATION_NAMES[s.stationIndex], leg.filter((a) => a.correct).length, leg.length, final);
      if (final) narrator.speak(text);
      else prompt(text);
    } else if (s.phase === 'report' && prev.phase !== 'report' && s.report) {
      stopListening();
      narrator.speak(reportNarration(s.report));
    }
  });
}
