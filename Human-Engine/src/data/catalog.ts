import type { CosmeticSlot, Equipped, IndicatorId, Settings, Targets } from '../types';

// ─── Default targets ────────────────────────────────────────────────────────
// Starting points only. Everyone's needs differ; every target is editable or can be ignored.
export const DEFAULT_TARGETS: Targets = {
  sleepHours: 8,
  waterGlasses: 8,
  moveMinutes: 30,
  steps: 7000,
  meals: 3,
  breaths: 2,
};

export const TARGET_LIMITS: Record<keyof Targets, { min: number; max: number; step: number; unit: string; label: string }> = {
  sleepHours: { min: 4, max: 12, step: 0.5, unit: 'hours', label: 'Sleep' },
  waterGlasses: { min: 1, max: 20, step: 1, unit: 'glasses', label: 'Water' },
  moveMinutes: { min: 5, max: 240, step: 5, unit: 'minutes', label: 'Exercise' },
  steps: { min: 1000, max: 30000, step: 500, unit: 'steps', label: 'Steps' },
  meals: { min: 1, max: 6, step: 1, unit: 'meals', label: 'Nourishing meals' },
  breaths: { min: 1, max: 6, step: 1, unit: 'breaks', label: 'Breathing breaks' },
};

export const DEFAULT_SETTINGS: Settings = {
  targets: DEFAULT_TARGETS,
  ignored: [],
  motion: 'system',
};

export const DEFAULT_EQUIPPED: Equipped = { finish: 'iron', gauge: 'standard', steam: 'vapour' };

// ─── Indicators ─────────────────────────────────────────────────────────────
export const INDICATORS: Record<IndicatorId, { name: string; system: string; habit: string; blurb: string }> = {
  rest: {
    name: 'Rest',
    system: 'Maintenance Governor',
    habit: 'Sleep duration',
    blurb: 'Logged sleep powers the repair crew. Rested engines run smoother and shed their rust.',
  },
  cooling: {
    name: 'Cooling',
    system: 'Coolant Tower',
    habit: 'Water intake',
    blurb: 'Each glass of water you record tops up the coolant tower that keeps the works from overheating.',
  },
  motion: {
    name: 'Motion',
    system: 'Piston & Flywheel',
    habit: 'Exercise or steps',
    blurb: 'Exercise minutes or steps drive the pistons, whichever is further along. The more you move, the faster the flywheel turns.',
  },
  fuel: {
    name: 'Fuel',
    system: 'Firebox',
    habit: 'Nourishing meals',
    blurb: 'Nourishing meals stoke the firebox. A well-fed boiler glows warm and steady.',
  },
  equilibrium: {
    name: 'Equilibrium',
    system: 'Pressure Regulator',
    habit: 'Mood, stress & breathing',
    blurb: 'Your self-reported mood and stress set the main pressure dial. Breathing breaks vent excess pressure.',
  },
};

export const INDICATOR_ORDER: IndicatorId[] = ['rest', 'cooling', 'motion', 'fuel', 'equilibrium'];

// ─── Cosmetics ──────────────────────────────────────────────────────────────
export type Requirement =
  | { kind: 'none' }
  | { kind: 'level'; level: number }
  | { kind: 'achievement'; id: string };

export interface FinishPalette {
  hi: string; // specular highlight
  mid: string; // body
  lo: string; // shadow
  edge: string; // rim/trim
  rivet: string;
  pipe: [string, string, string]; // pipe gradient
  band: string; // boiler bands
}

export interface CosmeticItem {
  id: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  requirement: Requirement;
  swatch: string[];
}

export const FINISHES: Record<string, FinishPalette> = {
  iron: {
    hi: '#7d756b', mid: '#4a443d', lo: '#211e1b', edge: '#8a7a5c', rivet: '#9c8d72',
    pipe: ['#5a5249', '#3a352f', '#1d1a17'], band: '#6b5f4b',
  },
  copper: {
    hi: '#f2b48a', mid: '#b5653a', lo: '#4f2614', edge: '#e09a6a', rivet: '#f0c09a',
    pipe: ['#e8a072', '#a85a30', '#4a2210'], band: '#d48655',
  },
  brass: {
    hi: '#f6dc98', mid: '#bb8e3a', lo: '#4e3812', edge: '#e5c06a', rivet: '#f7e2a8',
    pipe: ['#ecc777', '#a77c2e', '#4a3510'], band: '#d6aa52',
  },
  gunmetal: {
    hi: '#9aa1a8', mid: '#3c4147', lo: '#121518', edge: '#d9b25c', rivet: '#e8c46c',
    pipe: ['#e2bb63', '#9b7a32', '#3e2f10'], band: '#c9a14e',
  },
  verdigris: {
    hi: '#a9d4c0', mid: '#4f8a76', lo: '#183a30', edge: '#c08a5a', rivet: '#d9a77a',
    pipe: ['#8fc2ad', '#467a67', '#173229'], band: '#b07c4e',
  },
};

export const COSMETICS: CosmeticItem[] = [
  { id: 'iron', slot: 'finish', name: 'Cast Iron Works', description: 'Honest, dark iron. Every engine starts here.', requirement: { kind: 'none' }, swatch: ['#7d756b', '#4a443d', '#211e1b'] },
  { id: 'copper', slot: 'finish', name: 'Polished Copper Pipes', description: 'Warm, hand-burnished copper across the boiler and pipework.', requirement: { kind: 'level', level: 2 }, swatch: ['#f2b48a', '#b5653a', '#4f2614'] },
  { id: 'brass', slot: 'finish', name: 'Brass Plating', description: 'Full brass cladding with gleaming bands and rivets.', requirement: { kind: 'level', level: 3 }, swatch: ['#f6dc98', '#bb8e3a', '#4e3812'] },
  { id: 'verdigris', slot: 'finish', name: 'Verdigris Patina', description: 'An aged sea-green patina earned by returning after time away.', requirement: { kind: 'achievement', id: 'back_at_throttle' }, swatch: ['#a9d4c0', '#4f8a76', '#183a30'] },
  { id: 'gunmetal', slot: 'finish', name: 'Gunmetal & Gilt', description: 'Blued gunmetal body with gilded trim. A master mechanic’s machine.', requirement: { kind: 'level', level: 5 }, swatch: ['#9aa1a8', '#3c4147', '#d9b25c'] },

  { id: 'standard', slot: 'gauge', name: 'Standard Dials', description: 'Cream faces and black needles. Reliable.', requirement: { kind: 'none' }, swatch: ['#efe3c8', '#2a2420'] },
  { id: 'chronometer', slot: 'gauge', name: 'Railway Chronometer Faces', description: 'Fine-ruled faces with crimson needles, for a steady hand.', requirement: { kind: 'achievement', id: 'steady_hand' }, swatch: ['#f4ead2', '#a3342a'] },
  { id: 'luminous', slot: 'gauge', name: 'Luminous Night Dials', description: 'Dark enamel with radium-green markings (no actual radium).', requirement: { kind: 'level', level: 4 }, swatch: ['#13201b', '#9fe3b4'] },

  { id: 'vapour', slot: 'steam', name: 'Plain Vapour', description: 'Soft white steam from the stack.', requirement: { kind: 'none' }, swatch: ['#e8e1d3', '#9b958a'] },
  { id: 'embers', slot: 'steam', name: 'Amber Embers', description: 'Glowing sparks drift up with the steam.', requirement: { kind: 'level', level: 4 }, swatch: ['#ffb347', '#e8681d'] },
  { id: 'aether', slot: 'steam', name: 'Aether Mist', description: 'A cool, shimmering mist for the well-hydrated engineer.', requirement: { kind: 'achievement', id: 'cooling_engineer' }, swatch: ['#bfe8f0', '#7fb6c9'] },
];

export const SLOT_LABELS: Record<CosmeticSlot, { title: string; hint: string }> = {
  finish: { title: 'Engine Finish', hint: 'Metal cladding for the boiler, frame and pipework' },
  gauge: { title: 'Gauge Faces', hint: 'Dial style on every pressure gauge' },
  steam: { title: 'Steam Effect', hint: 'What rises from the stack' },
};

export const GAUGE_STYLES: Record<string, { face: string; ink: string; needle: string; tick: string; glass: string }> = {
  standard: { face: '#efe3c8', ink: '#2a2420', needle: '#1e1a17', tick: '#4a3f33', glass: 'rgba(255,255,255,0.10)' },
  chronometer: { face: '#f6eedb', ink: '#3b2a22', needle: '#a3342a', tick: '#6b4c3a', glass: 'rgba(255,255,255,0.14)' },
  luminous: { face: '#14211c', ink: '#9fe3b4', needle: '#c9f7d4', tick: '#6fbf8a', glass: 'rgba(160,255,200,0.07)' },
};
