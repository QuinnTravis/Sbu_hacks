import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  Flame,
  Gauge,
  Compass,
  Volume2,
  VolumeX,
  RotateCcw,
  Camera,
  Award,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Wrench,
  ChevronRight,
  Train,
  Sliders,
  Plus,
  Play
} from 'lucide-react';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type Category =
  | 'Thermodynamics'
  | 'Industrial History'
  | 'Mechanical Engineering'
  | 'Physics & Metallurgy'
  | 'Railway Operations';

type DeckId = 'all' | 'thermodynamics' | 'history' | 'engineering' | 'custom';

type CameraMode = 'chase' | 'piston' | 'cabin' | 'orbit';

interface Question {
  id: string;
  category: Category;
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: number;
  explanation: string;
}

interface Checkpoint {
  name: string;
  distanceMiles: number;
  description: string;
}

interface TelemetryState {
  speedMph: number;
  targetSpeedMph: number;
  pressurePsi: number;
  targetPressurePsi: number;
  fireboxTempF: number;
  distanceTraveledMiles: number;
  totalRouteMiles: number;
  burstTimer: number;
  whistleTimer: number;
  nextSignalGreen: boolean;
  approachingStation: boolean;
}

// ============================================================================
// BUILT-IN EDUCATIONAL CONTENT & ROUTE DATA
// ============================================================================

const CHECKPOINTS: Checkpoint[] = [
  { name: 'Ironbridge Foundry', distanceMiles: 0, description: 'Birthplace of cast-iron smelting' },
  { name: 'Coalbrookdale Junction', distanceMiles: 2.5, description: 'Coke-blast furnace district' },
  { name: 'Trevithick Colliery', distanceMiles: 5.0, description: 'High-pressure boiler testing grounds' },
  { name: 'Brunel Viaduct', distanceMiles: 7.5, description: 'Broad-gauge masonry valley crossing' },
  { name: 'Babbage Analytical Works', distanceMiles: 10.0, description: 'Precision gear & difference engine foundry' },
  { name: 'Grand Central Terminus', distanceMiles: 12.5, description: 'Imperial Exhibition Steam Concourse' },
];

const BUILT_IN_QUESTIONS: Question[] = [
  {
    id: 'q1',
    category: 'Thermodynamics',
    prompt: 'Why did James Watt’s separate condenser dramatically improve the efficiency of early steam engines?',
    choices: [
      'It kept the main cylinder hot instead of cooling it down on every single stroke',
      'It replaced water steam with pressurized coal gas inside the piston',
      'It eliminated the need for a boiler by burning coal directly in the cylinder',
      'It allowed the engine to operate below atmospheric freezing temperatures'
    ],
    correctIndex: 0,
    explanation: 'Newcomen engines sprayed cold water directly into the steam cylinder to condense steam, wasting over 75% of fuel reheating the cylinder walls. Watt routed steam to a separate chamber for condensation, keeping the main working cylinder perpetually hot.'
  },
  {
    id: 'q2',
    category: 'Mechanical Engineering',
    prompt: 'What is the primary mechanical function of the "fire-tube" boiler design perfected on George Stephenson’s Rocket (1829)?',
    choices: [
      'To pump liquid coal slurry directly through the driving wheels',
      'To pass hot combustion gases through dozens of brass tubes surrounded by water, vastly increasing heating surface area',
      'To store compressed air in the tender for braking on steep downhill grades',
      'To cool down the smokestack so sparks would not ignite wooden bridges'
    ],
    correctIndex: 1,
    explanation: 'A multi-tubular fire-tube boiler splits hot exhaust gases from the firebox through 25+ small tubes running through the water barrel. This multiplied the heat-transfer surface area and enabled sustained high-speed steam production.'
  },
  {
    id: 'q3',
    category: 'Railway Operations',
    prompt: 'In a steam locomotive, why is exhausted steam from the cylinders vented upward through a "blastpipe" inside the smokestack?',
    choices: [
      'To create a loud chugging sound solely to warn pedestrians on the tracks',
      'To condense all the water back into the tender without losing a drop',
      'To create a partial vacuum (draft) that pulls fresh oxygen through the firebox coal bed',
      'To push downward on the front wheels for extra weight on icy rails'
    ],
    correctIndex: 2,
    explanation: 'As puffs of exhaust steam shoot up the narrow smokestack, they entrain surrounding air and create an induced draft. The faster the locomotive works, the stronger the draft pulling oxygen through the burning coal, automatically scaling heat output with demand.'
  },
  {
    id: 'q4',
    category: 'Physics & Metallurgy',
    prompt: 'Why are steel railway wheels shaped with a slight conical taper rather than being perfectly flat cylinders?',
    choices: [
      'Conical wheels save 40% of the iron needed during foundry casting',
      'They allow the solid axle wheelset to self-center on straight track and naturally steer around curves',
      'Flat wheels would melt from friction within the first mile of travel',
      'They prevent rainwater from touching the wooden sleepers underneath'
    ],
    correctIndex: 1,
    explanation: 'Because both wheels are rigidly fixed to a single solid axle, when the train enters a curve, the wheelset shifts slightly outward. The outer wheel rides on a larger diameter cone section than the inner wheel, covering more distance per rotation without slipping.'
  },
  {
    id: 'q5',
    category: 'Industrial History',
    prompt: 'What breakthrough did Abraham Darby achieve at Coalbrookdale in 1709 that launched the Iron Age of industry?',
    choices: [
      'Smelting iron ore in a blast furnace using purified coal (coke) instead of scarce timber charcoal',
      'Inventing the electric arc furnace powered by hydroelectric waterwheels',
      'Discovering how to weave cotton threads using magnetic induction',
      'Importing pre-refined titanium rails from South America'
    ],
    correctIndex: 0,
    explanation: 'Britain was rapidly running out of forests for charcoal. Raw coal contained sulfur that made iron brittle, but by roasting coal into low-impurity "coke," Darby could build taller, hotter blast furnaces and mass-produce affordable cast iron.'
  },
  {
    id: 'q6',
    category: 'Mechanical Engineering',
    prompt: 'Why are the crank pins on the left and right driving wheels of a two-cylinder steam locomotive offset by 90 degrees ("quartered")?',
    choices: [
      'So the engineer only has to oil one side of the train per week',
      'To ensure that when one piston is at a "dead center" turning point with zero leverage, the opposite piston is at maximum leverage',
      'To make the locomotive lean into sharp mountain turns at high speed',
      'To prevent both headlights from flickering at the same time'
    ],
    correctIndex: 1,
    explanation: 'At the extreme front or back of a piston stroke (dead center), pushing on the connecting rod cannot rotate the wheel. Quartering guarantees that at least one cylinder always has strong rotational torque to start the heavy train from any standstill position.'
  },
  {
    id: 'q7',
    category: 'Thermodynamics',
    prompt: 'What happens to the boiling point of water inside a sealed locomotive boiler as steam pressure rises to 180 PSI?',
    choices: [
      'The boiling point drops to room temperature (68°F / 20°C)',
      'The boiling point remains fixed at exactly 212°F (100°C) regardless of pressure',
      'The boiling point rises significantly (to roughly 380°F / 193°C), storing far more thermal energy per pound of steam',
      'The water freezes into high-density pressure ice at the bottom of the barrel'
    ],
    correctIndex: 2,
    explanation: 'According to the vapor-pressure curve of water, higher pressure suppresses phase change until a much higher temperature is reached. High-pressure, high-temperature steam carries greater enthalpy and expands with far greater force against the pistons.'
  },
  {
    id: 'q8',
    category: 'Physics & Metallurgy',
    prompt: 'What did Henry Bessemer’s 1856 converter process accomplish for railway construction?',
    choices: [
      'It blew air through molten pig iron to burn off excess carbon, cutting the cost and time of making strong malleable steel by over 80%',
      'It coated wooden rails in liquid copper so they would never rot',
      'It used liquid nitrogen to freeze brittle cast iron into diamond-hard wheels',
      'It replaced metal rails entirely with vulcanized rubber troughs'
    ],
    correctIndex: 0,
    explanation: 'Before Bessemer, wrought iron rails wore out in months under heavy engines and steel was an expensive luxury reserved for cutlery. Blowing oxygen through molten iron oxidized silicon and carbon exothermically, enabling mass-produced steel rails that lasted 15+ years.'
  },
  {
    id: 'q9',
    category: 'Railway Operations',
    prompt: 'Why do engineers leave a small expansion gap (or use carefully anchored thermal stress) between sections of steel track?',
    choices: [
      'To give insects and small wildlife a safe crossing path under the rails',
      'To allow the wheels to make a rhythmic clicking sound so passengers can count miles',
      'To prevent thermal expansion on hot summer days from buckling the track into dangerous "sun kinks"',
      'To drain oil drippings from the locomotive axle boxes'
    ],
    correctIndex: 2,
    explanation: 'Steel expands linearly with temperature (ΔL = α·L·ΔT). Without expansion joints on jointed track—or massive concrete clamping forces on modern continuous welded rail—compressive thermal forces will violently warp the entire track sideways.'
  },
  {
    id: 'q10',
    category: 'Mechanical Engineering',
    prompt: 'What is the purpose of the crescent-shaped counterweights cast directly into a steam locomotive’s driving wheels?',
    choices: [
      'To balance the heavy reciprocating mass of the crank pins, connecting rods, and pistons, reducing violent "hammer blow" on the rails',
      'To store spare coal inside the hollow spokes of the wheels',
      'To act as fan blades that cool down the wooden sleepers as the train passes',
      'To make the wheels heavier on top than on the bottom'
    ],
    correctIndex: 0,
    explanation: 'The heavy steel rods and pistons slam back and forth several times per second at speed. Counterweights positioned opposite the crank pin offset these inertial forces so the wheels do not pound and fracture the steel rails below.'
  },
  {
    id: 'q11',
    category: 'Thermodynamics',
    prompt: 'Why do steam locomotive drivers "cut off" the steam admission early in the piston stroke once the train is cruising at high speed?',
    choices: [
      'Because the boiler runs completely out of water every two minutes',
      'To allow the trapped high-pressure steam to expand adiabatically for the rest of the stroke, extracting maximum work from less fuel and water',
      'To let cold outside air rush into the cylinder and push the piston backward',
      'Because the pistons stop moving once the wheels reach 30 MPH'
    ],
    correctIndex: 1,
    explanation: 'Using the Stephenson or Walschaerts valve gear, closing the intake valve at 25% of the stroke lets the expansive force of the already-admitted steam do the remaining 75% of the work—dramatically boosting thermodynamic efficiency.'
  },
  {
    id: 'q12',
    category: 'Industrial History',
    prompt: 'How did the rise of intercity steam railways in the 1840s transform how society measured time?',
    choices: [
      'Towns abandoned clocks altogether and relied strictly on factory whistles',
      'Railways forced the replacement of dozens of local solar times with unified "Railway Time" (Standard Time Zones) synchronized via telegraph',
      'Clocks were changed to run on a 10-hour metric decimal day across Great Britain',
      'Trains only ran at night so engineers could navigate by the North Star'
    ],
    correctIndex: 1,
    explanation: 'Previously, Bristol was 11 minutes behind London based on local solar noon. High-speed single-track rail schedules and telegraph signaling required every station along the line to share an exact, standardized clock to prevent head-on collisions.'
  }
];

// ============================================================================
// PROCEDURAL WEB AUDIO SYNTHESIZER (CHUG, STEAM HISS, BRASS WHISTLE)
// ============================================================================

class SteamAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private noiseBuffer: AudioBuffer | null = null;
  private lastChugPhase: number = 0;

  constructor() {
    // AudioContext initialized lazily on first user interaction
  }

  private ensureContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.createWhiteNoiseBuffer();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createWhiteNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  // Triggered four times per driving wheel revolution (4 exhaust beats per cycle)
  public updateWheelPhase(wheelAngleRad: number, speedMph: number) {
    if (this.isMuted || speedMph < 1.5) return;
    const phase = Math.floor((wheelAngleRad / (Math.PI / 2)) % 4);
    if (phase !== this.lastChugPhase) {
      this.lastChugPhase = phase;
      this.triggerChug(speedMph, phase === 0);
    }
  }

  private triggerChug(speedMph: number, accented: boolean) {
    if (!this.ctx || !this.noiseBuffer || this.isMuted) return;
    const now = this.ctx.currentTime;

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(accented ? 220 : 175, now);
    filter.Q.setValueAtTime(2.2, now);

    const gain = this.ctx.createGain();
    const peakGain = Math.min(0.11, 0.03 + (speedMph / 75) * 0.08) * (accented ? 1.25 : 0.9);
    const duration = Math.max(0.06, 0.18 - (speedMph / 85) * 0.1);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(now);
    source.stop(now + duration + 0.02);
  }

  // Celebratory brass chord steam whistle + cylinder burst on correct answer
  public playSuccessWhistleAndSteam() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // 3-chime brass steam whistle (G#4, B4, D#5 with slight detune)
    const freqs = [415.3, 493.88, 622.25];
    freqs.forEach((f, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(f * 0.97, now);
      osc.frequency.exponentialRampToValueAtTime(f, now + 0.08);
      osc.frequency.setValueAtTime(f, now + 0.55);
      osc.frequency.exponentialRampToValueAtTime(f * 0.96, now + 0.85);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.055, now + 0.07);
      gain.gain.setValueAtTime(0.05, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.9);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.95);
    });

    // High-pressure cylinder steam burst hiss
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(900, now);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.001, now);
      nGain.gain.linearRampToValueAtTime(0.12, now + 0.05);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      noise.connect(hp);
      hp.connect(nGain);
      nGain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.9);
    }
  }

  // Pressure vent hiss + dull clank on incorrect answer
  public playPressureVentError() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(650, now);
      bp.frequency.exponentialRampToValueAtTime(220, now + 0.55);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      noise.connect(bp);
      bp.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.65);
    }

    // Low iron clank
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.25);

    oGain.gain.setValueAtTime(0.07, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(oGain);
    oGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public dispose() {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

// ============================================================================
// BRASS PRESSURE GAUGE SVG COMPONENT
// ============================================================================

interface BrassGaugeProps {
  pressurePsi: number;
  speedMph: number;
  fireboxTempF: number;
}

const BrassTelemetryCluster: React.FC<BrassGaugeProps> = ({
  pressurePsi,
  speedMph,
  fireboxTempF
}) => {
  // Map 0..220 PSI to -130deg..+130deg
  const clampedPsi = Math.max(0, Math.min(220, pressurePsi));
  const needleAngle = -130 + (clampedPsi / 220) * 260;

  // Map 0..75 MPH to -120deg..+120deg
  const clampedSpeed = Math.max(0, Math.min(75, speedMph));
  const speedAngle = -120 + (clampedSpeed / 75) * 240;

  return (
    <div className="flex items-center gap-3 bg-[#181614]/95 border-2 border-[#8c6d1f] px-3.5 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.85)] relative">
      {/* Decorative Corner Rivets */}
      <span className="w-1.5 h-1.5 rounded-full bg-[#c59b27] absolute top-1 left-1" />
      <span className="w-1.5 h-1.5 rounded-full bg-[#c59b27] absolute top-1 right-1" />
      <span className="w-1.5 h-1.5 rounded-full bg-[#c59b27] absolute bottom-1 left-1" />
      <span className="w-1.5 h-1.5 rounded-full bg-[#c59b27] absolute bottom-1 right-1" />

      {/* Steam Pressure Dial */}
      <div className="flex items-center gap-2.5">
        <svg width="68" height="68" viewBox="0 0 100 100" className="shrink-0">
          <defs>
            <radialGradient id="brassRim" cx="50%" cy="50%" r="50%">
              <stop offset="75%" stopColor="#f4eedc" />
              <stop offset="90%" stopColor="#c59b27" />
              <stop offset="100%" stopColor="#5c430e" />
            </radialGradient>
          </defs>
          {/* Outer Brass Bezel */}
          <circle cx="50" cy="50" r="47" fill="url(#brassRim)" stroke="#3d2c08" strokeWidth="2.5" />
          <circle cx="50" cy="50" r="40" fill="#f4eedc" stroke="#8c6d1f" strokeWidth="1.5" />

          {/* Red Danger Zone Arc (175-220 PSI) */}
          <path
            d="M 76 26 A 35 35 0 0 1 78 74"
            fill="none"
            stroke="#9e2a2b"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Scale Ticks */}
          {[-130, -97.5, -65, -32.5, 0, 32.5, 65, 97.5, 130].map((deg, i) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            const x1 = 50 + Math.cos(rad) * 31;
            const y1 = 50 + Math.sin(rad) * 31;
            const x2 = 50 + Math.cos(rad) * 38;
            const y2 = 50 + Math.sin(rad) * 38;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={i >= 7 ? '#9e2a2b' : '#22201e'}
                strokeWidth={i % 2 === 0 ? '2.2' : '1.2'}
              />
            );
          })}

          <text x="50" y="35" textAnchor="middle" fontSize="8" fontFamily="monospace" fontWeight="bold" fill="#22201e">
            STEAM
          </text>
          <text x="50" y="75" textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#7c2d12">
            PSI
          </text>

          {/* Animated Needle */}
          <g transform={`rotate(${needleAngle} 50 50)`} style={{ transition: 'transform 120ms ease-out' }}>
            <polygon points="48.2,58 51.8,58 50,16" fill="#9e2a2b" />
            <circle cx="50" cy="50" r="5.5" fill="#3d2c08" stroke="#c59b27" strokeWidth="1.5" />
          </g>
        </svg>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#c59b27] font-mono">
            Boiler Pressure
          </div>
          <div className="text-xl font-mono font-bold text-[#f4eedc] leading-tight">
            {Math.round(pressurePsi)} <span className="text-xs font-normal text-[#c59b27]">PSI</span>
          </div>
          <div className="text-[10px] font-mono text-[#a89f8d]">
            {pressurePsi > 165 ? 'HIGH OUTPUT' : pressurePsi > 110 ? 'NOMINAL DRAFT' : 'LOW STEAM'}
          </div>
        </div>
      </div>

      <div className="h-11 w-[1px] bg-[#8c6d1f]/50" />

      {/* Speedometer Dial */}
      <div className="flex items-center gap-2.5">
        <svg width="68" height="68" viewBox="0 0 100 100" className="shrink-0">
          <circle cx="50" cy="50" r="47" fill="url(#brassRim)" stroke="#3d2c08" strokeWidth="2.5" />
          <circle cx="50" cy="50" r="40" fill="#1e1c1a" stroke="#8c6d1f" strokeWidth="1.5" />

          {[-120, -80, -40, 0, 40, 80, 120].map((deg, i) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            const x1 = 50 + Math.cos(rad) * 31;
            const y1 = 50 + Math.sin(rad) * 31;
            const x2 = 50 + Math.cos(rad) * 38;
            const y2 = 50 + Math.sin(rad) * 38;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#f4eedc"
                strokeWidth="1.8"
              />
            );
          })}

          <text x="50" y="35" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#c59b27">
            VELOCITY
          </text>
          <text x="50" y="75" textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#f4eedc">
            MPH
          </text>

          <g transform={`rotate(${speedAngle} 50 50)`} style={{ transition: 'transform 120ms ease-out' }}>
            <polygon points="48.2,58 51.8,58 50,17" fill="#c59b27" />
            <circle cx="50" cy="50" r="5.5" fill="#b87333" stroke="#f4eedc" strokeWidth="1.2" />
          </g>
        </svg>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#c59b27] font-mono">
            Track Velocity
          </div>
          <div className="text-xl font-mono font-bold text-[#f4eedc] leading-tight">
            {speedMph.toFixed(1)} <span className="text-xs font-normal text-[#c59b27]">MPH</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono text-[#e07a5f]">
            <Flame className="w-3 h-3 text-[#e07a5f] inline" />
            <span>{Math.round(fireboxTempF)}°F FIREBOX</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================

export default function App() {
  // --------------------------------------------------------------------------
  // GAMEPLAY STATE (React UI State)
  // --------------------------------------------------------------------------
  const [selectedDeck, setSelectedDeck] = useState<DeckId>('all');
  const [customQuestions, setCustomQuestions] = useState<Question[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [eliminatedChoices, setEliminatedChoices] = useState<number[]>([]);
  const [feedbackState, setFeedbackState] = useState<{
    status: 'idle' | 'correct' | 'incorrect';
    explanation: string | null;
  }>({ status: 'idle', explanation: null });

  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isMinimizedHud, setIsMinimizedHud] = useState<boolean>(false);

  // Journey Statistics
  const [stats, setStats] = useState({
    questionsAnswered: 0,
    firstTryCorrect: 0,
    totalWrongAttempts: 0,
    peakSpeedMph: 28.0,
    pressureSamples: [135],
    startTimeMs: Date.now(),
    completedTimeSec: 0,
  });

  const [hasArrived, setHasArrived] = useState(false);

  // Live HUD Telemetry Snapshot synced from the physics loop
  const [hudTelemetry, setHudTelemetry] = useState({
    speedMph: 26.0,
    pressurePsi: 135,
    fireboxTempF: 1850,
    distanceMiles: 0,
    totalRouteMiles: 12.5,
    currentCheckpointIdx: 0,
  });

  // Custom question creator form state
  const [newQPrompt, setNewQPrompt] = useState('');
  const [newQChoices, setNewQChoices] = useState<[string, string, string, string]>(['', '', '', '']);
  const [newQCorrect, setNewQCorrect] = useState(0);
  const [newQExplanation, setNewQExplanation] = useState('');

  // --------------------------------------------------------------------------
  // REFS FOR THREE.JS ENGINE & AUDIO SYNTH
  // --------------------------------------------------------------------------
  const mountRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<SteamAudioEngine | null>(null);
  const cameraModeRef = useRef<CameraMode>('chase');
  const orbitAnglesRef = useRef<{ theta: number; phi: number; isDragging: boolean; lastX: number; lastY: number }>({
    theta: 0.45,
    phi: 0.32,
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  const telemetryRef = useRef<TelemetryState>({
    speedMph: 26.0,
    targetSpeedMph: 28.0,
    pressurePsi: 135,
    targetPressurePsi: 135,
    fireboxTempF: 1850,
    distanceTraveledMiles: 0,
    totalRouteMiles: 12.5,
    burstTimer: 0,
    whistleTimer: 0,
    nextSignalGreen: true,
    approachingStation: false,
  });

  // Keep camera mode ref in sync
  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  // Initialize Audio Engine
  useEffect(() => {
    audioRef.current = new SteamAudioEngine();
    return () => {
      audioRef.current?.dispose();
    };
  }, []);

  // Filter active question deck
  const activeQuestions = useMemo(() => {
    const pool = [...BUILT_IN_QUESTIONS, ...customQuestions];
    if (selectedDeck === 'all') return pool;
    if (selectedDeck === 'thermodynamics') {
      return pool.filter((q) => q.category === 'Thermodynamics' || q.category === 'Physics & Metallurgy');
    }
    if (selectedDeck === 'history') {
      return pool.filter((q) => q.category === 'Industrial History' || q.category === 'Railway Operations');
    }
    if (selectedDeck === 'engineering') {
      return pool.filter((q) => q.category === 'Mechanical Engineering');
    }
    if (selectedDeck === 'custom') {
      return customQuestions.length > 0 ? customQuestions : pool;
    }
    return pool;
  }, [selectedDeck, customQuestions]);

  const currentQuestion = activeQuestions[questionIndex % activeQuestions.length];

  // ==========================================================================
  // THREE.JS PROCEDURAL 3D WORLD & LOCOMOTIVE ENGINE
  // ==========================================================================
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. SCENE, CAMERA, RENDERER
    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x28211c);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(0x28211c, 0.0115);

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      260
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. GOLDEN-HOUR INDUSTRIAL LIGHTING
    const hemiLight = new THREE.HemisphereLight(0xf2c17d, 0x26211d, 0.75);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffb86c, 1.85);
    sunLight.position.set(-38, 42, -25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 140;
    const d = 38;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Glowing setting sun disk on horizon
    const sunGeo = new THREE.SphereGeometry(9, 24, 24);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffae52, fog: false });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(-110, 34, -170);
    scene.add(sunMesh);

    // 3. SHARED PROCEDURAL INDUSTRIAL MATERIALS
    const materials = {
      boilerIron: new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.42, metalness: 0.78 }),
      smokeboxCharcoal: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.55, metalness: 0.65 }),
      agedBrass: new THREE.MeshStandardMaterial({ color: 0xd4a838, roughness: 0.25, metalness: 0.92 }),
      copperPipe: new THREE.MeshStandardMaterial({ color: 0xc87533, roughness: 0.3, metalness: 0.88 }),
      crimsonPaint: new THREE.MeshStandardMaterial({ color: 0x7a1c1c, roughness: 0.45, metalness: 0.35 }),
      forgedSteel: new THREE.MeshStandardMaterial({ color: 0xb8bfc6, roughness: 0.28, metalness: 0.9 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x45494e, roughness: 0.4, metalness: 0.85 }),
      weatheredOak: new THREE.MeshStandardMaterial({ color: 0x4a321f, roughness: 0.88, metalness: 0.05 }),
      ballastGravel: new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.95, metalness: 0.05 }),
      earthGround: new THREE.MeshStandardMaterial({ color: 0x2d3224, roughness: 0.95, flatShading: true }),
      hillGrass: new THREE.MeshStandardMaterial({ color: 0x38422b, roughness: 0.9, flatShading: true }),
      pineFoliage: new THREE.MeshStandardMaterial({ color: 0x233624, roughness: 0.85, flatShading: true }),
      slateRock: new THREE.MeshStandardMaterial({ color: 0x4d4a47, roughness: 0.85, flatShading: true }),
      brickWall: new THREE.MeshStandardMaterial({ color: 0x6e3528, roughness: 0.85, flatShading: true }),
      slateRoof: new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.75, flatShading: true }),
      coalChunk: new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.35, metalness: 0.4, flatShading: true }),
      headlampGlow: new THREE.MeshBasicMaterial({ color: 0xfff3c4 }),
      fireboxGlow: new THREE.MeshBasicMaterial({ color: 0xff6b1a }),
      signalRed: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
      signalGreen: new THREE.MeshBasicMaterial({ color: 0x2aff6b }),
    };

    // 4. BUILD THE VINTAGE 4-4-0 STEAM LOCOMOTIVE & COAL TENDER
    const trainGroup = new THREE.Group();
    scene.add(trainGroup);

    // Main Chassis Frame
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 9.4), materials.crimsonPaint);
    frameMesh.position.set(0, 0.95, 0.2);
    frameMesh.castShadow = true;
    frameMesh.receiveShadow = true;
    trainGroup.add(frameMesh);

    // Steel Running Boards (Left & Right Walkways)
    [-1, 1].forEach((side) => {
      const walkway = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 8.6), materials.boilerIron);
      walkway.position.set(side * 1.02, 1.25, 0.2);
      walkway.castShadow = true;
      trainGroup.add(walkway);

      // Brass trim along walkway edge
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 8.62), materials.agedBrass);
      trim.position.set(side * 1.23, 1.25, 0.2);
      trainGroup.add(trim);
    });

    // Front Red Buffer Beam & Cowcatcher (Pilot)
    const bufferBeam = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.42, 0.35), materials.crimsonPaint);
    bufferBeam.position.set(0, 0.95, -4.5);
    bufferBeam.castShadow = true;
    trainGroup.add(bufferBeam);

    const cowcatcherGroup = new THREE.Group();
    cowcatcherGroup.position.set(0, 0.52, -4.7);
    const plowBase = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 0.9), materials.smokeboxCharcoal);
    plowBase.rotation.x = 0.25;
    cowcatcherGroup.add(plowBase);
    for (let i = -5; i <= 5; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.15, 6), materials.smokeboxCharcoal);
      bar.position.set(i * 0.19, 0.22, -0.35 + Math.abs(i) * 0.06);
      bar.rotation.x = -0.68;
      cowcatcherGroup.add(bar);
    }
    trainGroup.add(cowcatcherGroup);

    // Cylindrical Boiler Barrel
    const boilerBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.96, 0.96, 5.2, 24),
      materials.boilerIron
    );
    boilerBarrel.rotation.x = Math.PI / 2;
    boilerBarrel.position.set(0, 2.22, -0.7);
    boilerBarrel.castShadow = true;
    boilerBarrel.receiveShadow = true;
    trainGroup.add(boilerBarrel);

    // Polished Brass Boiler Bands
    [-2.8, -1.7, -0.6, 0.5, 1.6].forEach((zPos) => {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.97, 0.03, 10, 28),
        materials.agedBrass
      );
      band.position.set(0, 2.22, zPos);
      trainGroup.add(band);
    });

    // Front Smokebox + Riveted Conical Smokebox Door
    const smokebox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.99, 0.99, 1.35, 24),
      materials.smokeboxCharcoal
    );
    smokebox.rotation.x = Math.PI / 2;
    smokebox.position.set(0, 2.22, -3.65);
    smokebox.castShadow = true;
    trainGroup.add(smokebox);

    const smokeboxDoor = new THREE.Mesh(
      new THREE.SphereGeometry(0.92, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.35),
      materials.smokeboxCharcoal
    );
    smokeboxDoor.rotation.x = -Math.PI / 2;
    smokeboxDoor.position.set(0, 2.22, -3.72);
    trainGroup.add(smokeboxDoor);

    const doorHingeWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), materials.agedBrass);
    doorHingeWheel.rotation.x = Math.PI / 2;
    doorHingeWheel.position.set(0, 2.22, -4.38);
    trainGroup.add(doorHingeWheel);

    // Tall Flared Smokestack (Chimney) with Copper Cap
    const chimneyBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.35, 16), materials.smokeboxCharcoal);
    chimneyBase.position.set(0, 3.25, -3.65);
    trainGroup.add(chimneyBase);

    const chimneyFlue = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 1.35, 16), materials.smokeboxCharcoal);
    chimneyFlue.position.set(0, 3.95, -3.65);
    chimneyFlue.castShadow = true;
    trainGroup.add(chimneyFlue);

    const chimneyCrown = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.065, 10, 20), materials.copperPipe);
    chimneyCrown.rotation.x = Math.PI / 2;
    chimneyCrown.position.set(0, 4.62, -3.65);
    trainGroup.add(chimneyCrown);

    // Polished Brass Steam Dome & Sand Dome
    const steamDomeGroup = new THREE.Group();
    steamDomeGroup.position.set(0, 3.15, -0.4);
    const domeCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.55, 20), materials.agedBrass);
    const domeTop = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 14), materials.agedBrass);
    domeTop.position.y = 0.27;
    steamDomeGroup.add(domeCyl, domeTop);
    trainGroup.add(steamDomeGroup);

    const sandDomeGroup = new THREE.Group();
    sandDomeGroup.position.set(0, 3.12, -2.1);
    const sCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.45, 18), materials.boilerIron);
    const sTop = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 12), materials.agedBrass);
    sTop.position.y = 0.22;
    sandDomeGroup.add(sCyl, sTop);
    trainGroup.add(sandDomeGroup);

    // Brass Steam Whistle on Cab Roof
    const whistleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.38, 12), materials.agedBrass);
    whistleMesh.position.set(0.35, 3.55, 1.45);
    trainGroup.add(whistleMesh);

    // Copper External Steam Delivery Pipes along Boiler
    [-1, 1].forEach((side) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 4.9, 10), materials.copperPipe);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(side * 0.99, 2.15, -0.5);
      trainGroup.add(pipe);

      const handrail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 5.1, 8), materials.agedBrass);
      handrail.rotation.x = Math.PI / 2;
      handrail.position.set(side * 0.95, 2.68, -0.6);
      trainGroup.add(handrail);
    });

    // Vintage Box Headlamp + Spotlight Beam
    const headlampBox = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.56, 0.48), materials.agedBrass);
    headlampBox.position.set(0, 3.05, -4.42);
    trainGroup.add(headlampBox);

    const headlampLens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), materials.headlampGlow);
    headlampLens.position.set(0, 3.05, -4.67);
    headlampLens.rotation.y = Math.PI;
    trainGroup.add(headlampLens);

    const headlampSpot = new THREE.SpotLight(0xffdf9e, 3.8, 55, Math.PI / 5, 0.45, 1.2);
    headlampSpot.position.set(0, 3.05, -4.65);
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0.4, -28);
    trainGroup.add(spotTarget);
    headlampSpot.target = spotTarget;
    trainGroup.add(headlampSpot);

    // Engineer's Cabin (Cab) with Arched Windows & Glowing Firebox
    const cabGroup = new THREE.Group();
    cabGroup.position.set(0, 2.35, 2.75);

    const cabFront = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.15, 0.14), materials.boilerIron);
    cabFront.position.set(0, 0.15, -0.95);
    cabGroup.add(cabFront);

    [-1, 1].forEach((side) => {
      const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 2.1), materials.crimsonPaint);
      sidePanel.position.set(side * 1.15, -0.35, 0.05);
      sidePanel.castShadow = true;
      cabGroup.add(sidePanel);

      const pillarRear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.45), materials.boilerIron);
      pillarRear.position.set(side * 1.15, 0.72, 0.85);
      cabGroup.add(pillarRear);

      const brassWindowFrame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.68, 0.92), materials.agedBrass);
      brassWindowFrame.position.set(side * 1.15, 0.68, 0.05);
      cabGroup.add(brassWindowFrame);
    });

    // Arched Cab Roof
    const cabRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(1.38, 1.38, 2.45, 16, 1, false, -Math.PI * 0.32, Math.PI * 0.64),
      materials.smokeboxCharcoal
    );
    cabRoof.rotation.x = Math.PI / 2;
    cabRoof.position.set(0, 0.25, 0.12);
    cabRoof.castShadow = true;
    cabGroup.add(cabRoof);

    // Glowing Firebox Door & Warm PointLight inside Cab
    const fireboxDoor = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), materials.fireboxGlow);
    fireboxDoor.position.set(0, -0.35, -0.82);
    cabGroup.add(fireboxDoor);

    const fireboxLight = new THREE.PointLight(0xff5e14, 2.4, 6.5);
    fireboxLight.position.set(0, -0.1, -0.3);
    cabGroup.add(fireboxLight);

    trainGroup.add(cabGroup);

    // 5. COAL TENDER CAR + PROCEDURAL COAL PILE
    const tenderGroup = new THREE.Group();
    tenderGroup.position.set(0, 0, 6.55);

    const tenderFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 4.2), materials.smokeboxCharcoal);
    tenderFrame.position.y = 0.92;
    tenderFrame.castShadow = true;
    tenderGroup.add(tenderFrame);

    const tenderBody = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.38, 4.0), materials.crimsonPaint);
    tenderBody.position.y = 1.78;
    tenderBody.castShadow = true;
    tenderBody.receiveShadow = true;
    tenderGroup.add(tenderBody);

    const tenderTrim = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.08, 4.08), materials.agedBrass);
    tenderTrim.position.y = 2.48;
    tenderGroup.add(tenderTrim);

    // Procedural Heap of Coal Chunks
    const coalGeo = new THREE.DodecahedronGeometry(0.28, 0);
    for (let i = 0; i < 38; i++) {
      const chunk = new THREE.Mesh(coalGeo, materials.coalChunk);
      const rx = (Math.random() - 0.5) * 1.75;
      const rz = (Math.random() - 0.5) * 3.3;
      const centerBoost = (1 - Math.abs(rx)) * 0.35;
      chunk.position.set(rx, 2.42 + centerBoost + Math.random() * 0.22, rz);
      chunk.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      chunk.scale.set(0.8 + Math.random() * 0.7, 0.6 + Math.random() * 0.5, 0.8 + Math.random() * 0.7);
      tenderGroup.add(chunk);
    }

    // Iron Coupler Link between Locomotive and Tender
    const coupler = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 1.3), materials.darkSteel);
    coupler.position.set(0, 0.92, 4.2);
    trainGroup.add(coupler);

    trainGroup.add(tenderGroup);

    // 6. WHEELS, CRANK PINS, PISTONS & ANIMATED CONNECTING RODS
    const DRIVE_RADIUS = 0.85;
    const SMALL_RADIUS = 0.44;
    const CRANK_RADIUS = 0.34;
    const Z_REAR_DRIVE = 2.05;
    const Z_FRONT_DRIVE = -0.15;
    const Z_CYLINDER = -3.45;

    const drivingWheels: { group: THREE.Group; side: number; z: number }[] = [];
    const smallWheels: THREE.Group[] = [];

    const createSpokedWheel = (radius: number, numSpokes: number, hasCounterweight: boolean, side: number) => {
      const wGroup = new THREE.Group();

      // Steel Tire Rim
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.068, 10, 28),
        materials.forgedSteel
      );
      rim.rotation.y = Math.PI / 2;
      wGroup.add(rim);

      // Inner Painted Rim
      const innerRim = new THREE.Mesh(
        new THREE.CylinderGeometry(radius - 0.05, radius - 0.05, 0.1, 24, 1, true),
        materials.crimsonPaint
      );
      innerRim.rotation.z = Math.PI / 2;
      wGroup.add(innerRim);

      // Central Boss Hub
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.26, radius * 0.26, 0.18, 16),
        materials.boilerIron
      );
      hub.rotation.z = Math.PI / 2;
      wGroup.add(hub);

      const brassCap = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.14, radius * 0.14, 0.22, 12),
        materials.agedBrass
      );
      brassCap.rotation.z = Math.PI / 2;
      wGroup.add(brassCap);

      // Radial Spokes
      for (let s = 0; s < numSpokes; s++) {
        const angle = (s / numSpokes) * Math.PI * 2;
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, radius * 1.85, 0.045),
          materials.crimsonPaint
        );
        spoke.rotation.x = angle;
        wGroup.add(spoke);
      }

      // Crescent Counterweight & Crank Pin Boss for Large Driving Wheels
      if (hasCounterweight) {
        const cw = new THREE.Mesh(
          new THREE.CylinderGeometry(
            radius * 0.9,
            radius * 0.9,
            0.12,
            16,
            1,
            false,
            Math.PI * 0.72,
            Math.PI * 0.56
          ),
          materials.boilerIron
        );
        cw.rotation.z = Math.PI / 2;
        wGroup.add(cw);

        // Crank pin positioned opposite the counterweight (quartering handled in kinematics)
        const crankBoss = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 0.24, 14),
          materials.forgedSteel
        );
        crankBoss.rotation.z = Math.PI / 2;
        crankBoss.position.set(side * 0.1, 0, CRANK_RADIUS);
        wGroup.add(crankBoss);
      }

      return wGroup;
    };

    // Create 4 Large Driving Wheels (2 per side)
    [-1, 1].forEach((side) => {
      [Z_FRONT_DRIVE, Z_REAR_DRIVE].forEach((zPos) => {
        const dw = createSpokedWheel(DRIVE_RADIUS, 14, true, side);
        dw.position.set(side * 1.02, DRIVE_RADIUS, zPos);
        trainGroup.add(dw);
        drivingWheels.push({ group: dw, side, z: zPos });
      });
    });

    // Solid Axles between Driving Wheels
    [Z_FRONT_DRIVE, Z_REAR_DRIVE].forEach((zPos) => {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.04, 12), materials.darkSteel);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, DRIVE_RADIUS, zPos);
      trainGroup.add(axle);
    });

    // Leading Bogie Truck Wheels (4 small front wheels) & Tender Wheels (6 small wheels)
    const smallWheelZPositions = [-3.05, -4.15, 5.15, 6.55, 7.95];
    smallWheelZPositions.forEach((zPos) => {
      [-1, 1].forEach((side) => {
        const sw = createSpokedWheel(SMALL_RADIUS, 8, false, side);
        sw.position.set(side * 0.98, SMALL_RADIUS, zPos);
        trainGroup.add(sw);
        smallWheels.push(sw);
      });
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.96, 10), materials.darkSteel);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, SMALL_RADIUS, zPos);
      trainGroup.add(axle);
    });

    // Steam Cylinders, Crosshead Guides, Pistons, Coupling Rods & Main Connecting Rods
    interface SideMechanism {
      side: number;
      phaseOffset: number; // Left & Right quartered by 90 degrees (PI/2)
      couplingRod: THREE.Mesh;
      pistonCrosshead: THREE.Group;
      mainRod: THREE.Mesh;
    }

    const mechanisms: SideMechanism[] = [];
    const MAIN_ROD_LENGTH = 2.65;

    [-1, 1].forEach((side) => {
      // Heavy External Steam Cylinder Housing
      const cylHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 1.25, 18),
        materials.boilerIron
      );
      cylHousing.rotation.x = Math.PI / 2;
      cylHousing.position.set(side * 1.18, DRIVE_RADIUS, Z_CYLINDER);
      cylHousing.castShadow = true;
      trainGroup.add(cylHousing);

      // Brass Cylinder End Caps
      [-0.63, 0.63].forEach((dz) => {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.05, 18), materials.agedBrass);
        cap.rotation.x = Math.PI / 2;
        cap.position.set(side * 1.18, DRIVE_RADIUS, Z_CYLINDER + dz);
        trainGroup.add(cap);
      });

      // Horizontal Slide Bars (Crosshead Guide Rails)
      [-0.14, 0.14].forEach((dy) => {
        const guideBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.55), materials.forgedSteel);
        guideBar.position.set(side * 1.18, DRIVE_RADIUS + dy, -2.25);
        trainGroup.add(guideBar);
      });

      // Reciprocating Piston Rod + Crosshead Block
      const crossheadGroup = new THREE.Group();
      const crossBlock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.26), materials.darkSteel);
      const pistonShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.35, 10), materials.forgedSteel);
      pistonShaft.rotation.x = Math.PI / 2;
      pistonShaft.position.z = -0.68;
      crossheadGroup.add(crossBlock, pistonShaft);
      crossheadGroup.position.set(side * 1.18, DRIVE_RADIUS, -2.2);
      trainGroup.add(crossheadGroup);

      // Horizontal Coupling Rod linking Front & Rear Driving Wheel Crank Pins
      const couplingDist = Z_REAR_DRIVE - Z_FRONT_DRIVE;
      const couplingRod = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.13, couplingDist + 0.25),
        materials.forgedSteel
      );
      trainGroup.add(couplingRod);

      // Main Connecting Rod linking Front Driving Wheel Crank Pin to Piston Crosshead
      const mainRod = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.14, MAIN_ROD_LENGTH),
        materials.forgedSteel
      );
      trainGroup.add(mainRod);

      mechanisms.push({
        side,
        phaseOffset: side === 1 ? 0 : Math.PI / 2,
        couplingRod,
        pistonCrosshead: crossheadGroup,
        mainRod,
      });
    });

    // 7. LOOPING RAILWAY TRACK (GRAVEL BALLAST, OAK SLEEPERS, STEEL RAILS)
    const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(450, 450), materials.earthGround);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.18;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Raised Gravel Ballast Bed
    const ballastBed = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 320), materials.ballastGravel);
    ballastBed.position.set(0, -0.09, -40);
    ballastBed.receiveShadow = true;
    scene.add(ballastBed);

    // Continuous Steel Rails
    [-0.98, 0.98].forEach((xRail) => {
      const railWeb = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 320), materials.darkSteel);
      railWeb.position.set(xRail, 0.06, -40);
      scene.add(railWeb);

      const railHead = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 320), materials.forgedSteel);
      railHead.position.set(xRail, 0.13, -40);
      scene.add(railHead);
    });

    // Scrolling Wooden Sleepers (Ties) + Cast Iron Tie Plates
    const NUM_SLEEPERS = 150;
    const SLEEPER_SPACING = 1.15;
    const TRACK_SPAN = NUM_SLEEPERS * SLEEPER_SPACING;
    const sleepers: THREE.Group[] = [];

    const sleeperGeo = new THREE.BoxGeometry(3.3, 0.14, 0.32);
    const plateGeo = new THREE.BoxGeometry(0.26, 0.04, 0.28);

    for (let i = 0; i < NUM_SLEEPERS; i++) {
      const sGroup = new THREE.Group();
      const tie = new THREE.Mesh(sleeperGeo, materials.weatheredOak);
      tie.receiveShadow = true;
      sGroup.add(tie);

      [-0.98, 0.98].forEach((rx) => {
        const plate = new THREE.Mesh(plateGeo, materials.darkSteel);
        plate.position.set(rx, 0.08, 0);
        sGroup.add(plate);
      });

      sGroup.position.set(0, -0.02, 35 - i * SLEEPER_SPACING);
      scene.add(sGroup);
      sleepers.push(sGroup);
    }

    // 8. PROCEDURAL SCENERY CHUNKS (HILLS, TREES, TELEGRAPH POLES, SIGNALS, FACTORIES, STATION)
    const sceneryScrollObjects: { obj: THREE.Object3D; span: number }[] = [];
    const factoryChimneyTips: THREE.Vector3[] = [];
    let semaphoreArmMesh: THREE.Mesh | null = null;
    let signalLampMesh: THREE.Mesh | null = null;
    let stationGroupRef: THREE.Group | null = null;

    // Helper: Create Low-Poly Pine Tree
    const createPineTree = (scale = 1) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6), materials.weatheredOak);
      trunk.position.y = 0.8;
      trunk.castShadow = true;
      tree.add(trunk);

      [0, 1, 2].forEach((tier) => {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(1.45 - tier * 0.32, 2.2 - tier * 0.25, 7),
          materials.pineFoliage
        );
        cone.position.y = 2.1 + tier * 1.15;
        cone.castShadow = true;
        cone.receiveShadow = true;
        tree.add(cone);
      });
      tree.scale.setScalar(scale);
      return tree;
    };

    // Populate Rolling Hills, Rocks, and Pine Forests on Both Sides
    const SCENERY_SPAN = 220;
    for (let i = 0; i < 42; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const zPos = 45 - (i / 42) * SCENERY_SPAN;

      // Pine Trees
      const tree = createPineTree(0.85 + Math.random() * 0.65);
      tree.position.set(side * (7.5 + Math.random() * 24), -0.15, zPos);
      tree.rotation.y = Math.random() * Math.PI * 2;
      scene.add(tree);
      sceneryScrollObjects.push({ obj: tree, span: SCENERY_SPAN });

      // Low-Poly Boulders
      if (i % 3 === 0) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + Math.random() * 1.4, 0), materials.slateRock);
        rock.position.set(side * (5.5 + Math.random() * 16), 0.2, zPos + 2);
        rock.scale.set(1.2, 0.75, 1.0);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        scene.add(rock);
        sceneryScrollObjects.push({ obj: rock, span: SCENERY_SPAN });
      }
    }

    // Rolling Low-Poly Hills along Horizon
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(14 + Math.random() * 10, 9 + Math.random() * 7, 7),
        materials.hillGrass
      );
      hill.position.set(side * (34 + Math.random() * 22), 2.5, 45 - (i / 18) * SCENERY_SPAN);
      hill.rotation.y = Math.random() * Math.PI;
      scene.add(hill);
      sceneryScrollObjects.push({ obj: hill, span: SCENERY_SPAN });
    }

    // Trackside Telegraph Poles with Sagging Catenary Wires
    const POLE_SPACING = 18;
    const NUM_POLES = 12;
    const POLE_SPAN = NUM_POLES * POLE_SPACING;
    for (let i = 0; i < NUM_POLES; i++) {
      const poleGroup = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 6.2, 8), materials.weatheredOak);
      post.position.y = 3.0;
      post.castShadow = true;
      poleGroup.add(post);

      // Crossbars & Ceramic Insulators
      [5.4, 4.7].forEach((yBar) => {
        const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.12), materials.weatheredOak);
        crossbar.position.y = yBar;
        poleGroup.add(crossbar);

        [-0.65, 0.65].forEach((xIns) => {
          const insulator = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), materials.forgedSteel);
          insulator.position.set(xIns, yBar + 0.12, 0);
          poleGroup.add(insulator);
        });
      });

      // Sagging Telegraph Wires reaching to next pole
      [-0.65, 0.65].forEach((xWire) => {
        const pts: THREE.Vector3[] = [];
        for (let s = 0; s <= 8; s++) {
          const t = s / 8;
          const sag = Math.sin(t * Math.PI) * 0.48;
          pts.push(new THREE.Vector3(xWire, 5.52 - sag, -t * POLE_SPACING));
        }
        const curveGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const wireLine = new THREE.Line(
          curveGeo,
          new THREE.LineBasicMaterial({ color: 0x1a1a1a })
        );
        poleGroup.add(wireLine);
      });

      poleGroup.position.set(-4.35, -0.15, 35 - i * POLE_SPACING);
      scene.add(poleGroup);
      sceneryScrollObjects.push({ obj: poleGroup, span: POLE_SPAN });
    }

    // Railway Semaphore Signal Post + Aspect Lamp
    const signalGroup = new THREE.Group();
    const sigPost = new THREE.Mesh(new THREE.BoxGeometry(0.24, 6.8, 0.24), materials.forgedSteel);
    sigPost.position.y = 3.4;
    sigPost.castShadow = true;
    signalGroup.add(sigPost);

    const sigFinial = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), materials.agedBrass);
    sigFinial.position.y = 7.0;
    signalGroup.add(sigFinial);

    const armPivot = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.24, 0.08), materials.crimsonPaint);
    armPivot.position.set(-0.55, 6.1, 0.16);
    semaphoreArmMesh = armPivot;
    signalGroup.add(armPivot);

    const aspectLamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), materials.signalGreen);
    aspectLamp.position.set(0, 6.1, 0.22);
    signalLampMesh = aspectLamp;
    signalGroup.add(aspectLamp);

    signalGroup.position.set(3.8, -0.15, -45);
    scene.add(signalGroup);
    sceneryScrollObjects.push({ obj: signalGroup, span: 95 });

    // Distant Brick Factories with Sawtooth Roofs & Tall Smokestacks + Water Tower
    const createBrickFactory = (xPos: number, zPos: number) => {
      const fGroup = new THREE.Group();
      const hall = new THREE.Mesh(new THREE.BoxGeometry(9.5, 4.8, 14), materials.brickWall);
      hall.position.y = 2.4;
      fGroup.add(hall);

      // Sawtooth Roof Ridges
      [-4.2, 0, 4.2].forEach((rz) => {
        const ridge = new THREE.Mesh(new THREE.ConeGeometry(3.8, 2.2, 4), materials.slateRoof);
        ridge.rotation.y = Math.PI / 4;
        ridge.scale.set(1.75, 1, 0.9);
        ridge.position.set(0, 5.8, rz);
        fGroup.add(ridge);
      });

      // Tall Brick Smokestack
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.1, 16.5, 12), materials.brickWall);
      stack.position.set(3.2, 8.2, -3.5);
      fGroup.add(stack);

      fGroup.position.set(xPos, -0.15, zPos);
      scene.add(fGroup);
      sceneryScrollObjects.push({ obj: fGroup, span: SCENERY_SPAN });
      factoryChimneyTips.push(new THREE.Vector3(xPos + 3.2, 16.5, zPos - 3.5));
    };

    createBrickFactory(-30, -65);
    createBrickFactory(34, -145);

    // Trackside Wooden Water Tower
    const waterTower = new THREE.Group();
    [-0.9, 0.9].forEach((lx) => {
      [-0.9, 0.9].forEach((lz) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 4.4, 0.24), materials.weatheredOak);
        leg.position.set(lx, 2.2, lz);
        waterTower.add(leg);
      });
    });
    const waterTank = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 2.8, 16), materials.weatheredOak);
    waterTank.position.y = 5.6;
    const tankRoof = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.2, 16), materials.slateRoof);
    tankRoof.position.y = 7.6;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.4, 8), materials.darkSteel);
    spout.rotation.z = Math.PI / 3;
    spout.position.set(-2.1, 4.3, 0);
    waterTower.add(waterTank, tankRoof, spout);
    waterTower.position.set(6.4, -0.15, -110);
    scene.add(waterTower);
    sceneryScrollObjects.push({ obj: waterTower, span: SCENERY_SPAN });

    // Grand Victorian Railway Station Platform & Canopy (Passes at Checkpoints/Destination)
    const stationGroup = new THREE.Group();
    const platform = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.05, 26), materials.slateRock);
    platform.position.set(5.4, 0.35, 0);
    platform.receiveShadow = true;
    stationGroup.add(platform);

    const stationBuilding = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.4, 18), materials.brickWall);
    stationBuilding.position.set(6.3, 3.0, 0);
    stationBuilding.castShadow = true;
    stationGroup.add(stationBuilding);

    const canopyRoof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.25, 24), materials.slateRoof);
    canopyRoof.position.set(5.1, 4.8, 0);
    canopyRoof.rotation.z = -0.08;
    stationGroup.add(canopyRoof);

    // Ornate Brass & Iron Canopy Columns + Warm Platform Lamps
    [-9, -3, 3, 9].forEach((pz) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.0, 10), materials.boilerIron);
      col.position.set(3.2, 2.8, pz);
      stationGroup.add(col);

      const lampOrb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), materials.headlampGlow);
      lampOrb.position.set(3.2, 4.4, pz);
      stationGroup.add(lampOrb);
    });

    stationGroup.position.set(0, -0.15, -155);
    scene.add(stationGroup);
    stationGroupRef = stationGroup;
    sceneryScrollObjects.push({ obj: stationGroup, span: 185 });

    // 9. DYNAMIC CHIMNEY SMOKE & LATERAL CYLINDER STEAM BURST PARTICLES
    interface SmokePuff {
      mesh: THREE.Mesh;
      velocity: THREE.Vector3;
      age: number;
      maxAge: number;
      type: 'chimney' | 'cylinder';
    }

    const puffs: SmokePuff[] = [];
    const puffGeo = new THREE.DodecahedronGeometry(0.36, 1);

    const spawnPuff = (
      origin: THREE.Vector3,
      vel: THREE.Vector3,
      maxAge: number,
      type: 'chimney' | 'cylinder',
      colorHex = 0xdad6ce
    ) => {
      const mat = new THREE.MeshLambertMaterial({
        color: colorHex,
        transparent: true,
        opacity: type === 'cylinder' ? 0.85 : 0.68,
      });
      const mesh = new THREE.Mesh(puffGeo, mat);
      mesh.position.copy(origin);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      scene.add(mesh);
      puffs.push({ mesh, velocity: vel, age: 0, maxAge, type });
    };

    // 10. MOUSE DRAG LISTENER FOR ORBIT CAMERA MODE
    const onPointerDown = (e: MouseEvent) => {
      orbitAnglesRef.current.isDragging = true;
      orbitAnglesRef.current.lastX = e.clientX;
      orbitAnglesRef.current.lastY = e.clientY;
    };
    const onPointerMove = (e: MouseEvent) => {
      if (!orbitAnglesRef.current.isDragging) return;
      const dx = e.clientX - orbitAnglesRef.current.lastX;
      const dy = e.clientY - orbitAnglesRef.current.lastY;
      orbitAnglesRef.current.lastX = e.clientX;
      orbitAnglesRef.current.lastY = e.clientY;
      orbitAnglesRef.current.theta -= dx * 0.007;
      orbitAnglesRef.current.phi = Math.max(0.1, Math.min(1.25, orbitAnglesRef.current.phi + dy * 0.006));
    };
    const onPointerUp = () => {
      orbitAnglesRef.current.isDragging = false;
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    // 11. ANIMATION & KINEMATICS LOOP
    let animationFrameId: number;
    let lastTime = performance.now();
    let wheelAngle = 0;
    let smokeAccum = 0;
    let hudSyncTimer = 0;

    const animate = (now: number) => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const tState = telemetryRef.current;

      // Smoothly interpolate speed and boiler pressure toward targets
      tState.speedMph += (tState.targetSpeedMph - tState.speedMph) * Math.min(1, dt * 1.8);
      tState.pressurePsi += (tState.targetPressurePsi - tState.pressurePsi) * Math.min(1, dt * 2.2);

      // Natural slight aerodynamic drag so speed slowly settles unless stoked
      if (tState.targetSpeedMph > 22 && tState.burstTimer <= 0) {
        tState.targetSpeedMph = Math.max(22, tState.targetSpeedMph - dt * 0.18);
        tState.targetPressurePsi = Math.max(125, tState.targetPressurePsi - dt * 0.25);
      }

      // Convert MPH to 3D world units per second
      const worldSpeed = tState.speedMph * 0.36;

      // Advance route mileage
      if (tState.distanceTraveledMiles < tState.totalRouteMiles) {
        tState.distanceTraveledMiles = Math.min(
          tState.totalRouteMiles,
          tState.distanceTraveledMiles + (tState.speedMph / 3600) * dt * 24 // Scaled educational journey time
        );
      }

      // Firebox flicker intensity
      const firePulse = 2.0 + Math.sin(now * 0.018) * 0.45 + (tState.pressurePsi / 200) * 1.2;
      fireboxLight.intensity = firePulse;
      tState.fireboxTempF = 1650 + tState.pressurePsi * 2.6 + Math.sin(now * 0.005) * 18;

      // Subtle locomotive suspension sway on rails
      const swayFreq = now * 0.008 * (tState.speedMph / 30);
      trainGroup.position.y = Math.abs(Math.sin(swayFreq * 2)) * 0.012;
      trainGroup.rotation.z = Math.sin(swayFreq) * 0.0045;

      // Rotate Driving & Small Wheels + Trigger Web Audio Chug
      const dTheta = (worldSpeed * dt) / DRIVE_RADIUS;
      wheelAngle += dTheta;
      audioRef.current?.updateWheelPhase(wheelAngle, tState.speedMph);

      drivingWheels.forEach((dw) => {
        const phase = dw.side === 1 ? 0 : Math.PI / 2;
        dw.group.rotation.x = -(wheelAngle + phase);
      });

      smallWheels.forEach((sw) => {
        sw.rotation.x -= (worldSpeed * dt) / SMALL_RADIUS;
      });

      // Exact Slider-Crank Kinematics for Pistons, Crossheads, Coupling Rods & Connecting Rods
      mechanisms.forEach((mech) => {
        const theta = wheelAngle + mech.phaseOffset;
        // Crank pin offset relative to wheel center
        const pinY = DRIVE_RADIUS + Math.sin(theta) * CRANK_RADIUS;
        const pinZFront = Z_FRONT_DRIVE - Math.cos(theta) * CRANK_RADIUS;
        const pinZRear = Z_REAR_DRIVE - Math.cos(theta) * CRANK_RADIUS;

        // Horizontal Coupling Rod stays parallel to frame, orbiting with both crank pins
        mech.couplingRod.position.set(
          mech.side * 1.13,
          pinY,
          (pinZFront + pinZRear) * 0.5
        );

        // Exact Crosshead Z position along horizontal slide bar (y = DRIVE_RADIUS)
        const dy = pinY - DRIVE_RADIUS;
        const horizontalReach = Math.sqrt(Math.max(0.01, MAIN_ROD_LENGTH * MAIN_ROD_LENGTH - dy * dy));
        const crossheadZ = pinZFront - horizontalReach;

        mech.pistonCrosshead.position.set(mech.side * 1.18, DRIVE_RADIUS, crossheadZ);

        // Position & Angle the Main Connecting Rod between Front Crank Pin and Crosshead
        const midY = (pinY + DRIVE_RADIUS) * 0.5;
        const midZ = (pinZFront + crossheadZ) * 0.5;
        mech.mainRod.position.set(mech.side * 1.19, midY, midZ);
        const rodPitch = Math.atan2(pinY - DRIVE_RADIUS, pinZFront - crossheadZ);
        mech.mainRod.rotation.x = -rodPitch;
      });

      // Scroll Wooden Sleepers Seamlessly
      sleepers.forEach((s) => {
        s.position.z += worldSpeed * dt;
        if (s.position.z > 35) {
          s.position.z -= TRACK_SPAN;
        }
      });

      // Scroll Scenery Chunks Seamlessly
      sceneryScrollObjects.forEach(({ obj, span }) => {
        obj.position.z += worldSpeed * dt;
        if (obj.position.z > 45) {
          obj.position.z -= span;
        }
      });

      // Animate Railway Signal Aspect (Green vs Red)
      if (semaphoreArmMesh && signalLampMesh) {
        const targetArmAngle = tState.nextSignalGreen ? -0.58 : 0.0;
        semaphoreArmMesh.rotation.z += (targetArmAngle - semaphoreArmMesh.rotation.z) * dt * 5;
        signalLampMesh.material = tState.nextSignalGreen ? materials.signalGreen : materials.signalRed;
      }

      // Spawn Dynamic Chimney Smoke Puffs scaled with speed & boiler pressure
      smokeAccum += dt * (4.5 + (tState.speedMph / 12) + (tState.pressurePsi / 45));
      while (smokeAccum >= 1) {
        smokeAccum -= 1;
        const chimneyOrigin = new THREE.Vector3(
          (Math.random() - 0.5) * 0.18,
          4.75,
          -3.65 + (Math.random() - 0.5) * 0.18
        );
        const puffVel = new THREE.Vector3(
          (Math.random() - 0.5) * 0.9,
          2.6 + (tState.pressurePsi / 65) + Math.random() * 1.2,
          worldSpeed * 0.72 + Math.random() * 1.2
        );
        const shade = tState.burstTimer > 0 ? 0xf5f2eb : 0xcbc6be;
        spawnPuff(chimneyOrigin, puffVel, 2.2 + Math.random() * 0.9, 'chimney', shade);
      }

      // Lateral Cylinder Steam Bursts (when accelerating or answering correctly)
      if (tState.burstTimer > 0) {
        tState.burstTimer = Math.max(0, tState.burstTimer - dt);
        [-1, 1].forEach((side) => {
          if (Math.random() < 0.75) {
            const cylOrigin = new THREE.Vector3(side * 1.35, 0.75, Z_CYLINDER);
            const cylVel = new THREE.Vector3(
              side * (4.8 + Math.random() * 2.5),
              0.4 + Math.random() * 0.8,
              worldSpeed * 0.5 + (Math.random() - 0.5) * 1.5
            );
            spawnPuff(cylOrigin, cylVel, 0.75 + Math.random() * 0.35, 'cylinder', 0xffffff);
          }
        });
      }

      // Update & Recycle Smoke/Steam Puffs
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.age += dt;
        if (p.age >= p.maxAge) {
          scene.remove(p.mesh);
          (p.mesh.material as THREE.Material).dispose();
          puffs.splice(i, 1);
          continue;
        }
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.velocity.y *= 0.98;
        const lifeRatio = p.age / p.maxAge;
        const scale = p.type === 'cylinder' ? 0.5 + lifeRatio * 2.2 : 0.7 + lifeRatio * 3.6;
        p.mesh.scale.setScalar(scale);
        const mat = p.mesh.material as THREE.MeshLambertMaterial;
        mat.opacity = (1 - lifeRatio) * (p.type === 'cylinder' ? 0.75 : 0.58);
      }

      // Update Camera Position & LookAt based on active CameraMode
      const camSwayX = Math.sin(now * 0.004) * 0.05;
      const camSwayY = Math.cos(now * 0.007) * 0.04;
      const mode = cameraModeRef.current;

      if (mode === 'chase') {
        camera.position.set(5.4 + camSwayX, 4.35 + camSwayY, 9.8);
        camera.lookAt(0, 2.0, -2.2);
      } else if (mode === 'piston') {
        camera.position.set(4.1 + camSwayX * 0.4, 1.45 + camSwayY * 0.4, 0.2);
        camera.lookAt(0, 1.15, -1.6);
      } else if (mode === 'cabin') {
        camera.position.set(0.72 + camSwayX * 0.3, 3.05 + camSwayY * 0.3, 2.25);
        camera.lookAt(0.2, 2.35, -18.0);
      } else if (mode === 'orbit') {
        const r = 12.5;
        const { theta, phi } = orbitAnglesRef.current;
        camera.position.set(
          r * Math.sin(theta) * Math.cos(phi),
          Math.max(1.2, r * Math.sin(phi)),
          r * Math.cos(theta) * Math.cos(phi)
        );
        camera.lookAt(0, 1.9, 0.5);
      }

      renderer.render(scene, camera);

      // Throttled HUD State Sync (10Hz)
      hudSyncTimer += dt;
      if (hudSyncTimer >= 0.1) {
        hudSyncTimer = 0;
        let cpIdx = 0;
        for (let c = CHECKPOINTS.length - 1; c >= 0; c--) {
          if (tState.distanceTraveledMiles >= CHECKPOINTS[c].distanceMiles) {
            cpIdx = c;
            break;
          }
        }
        setHudTelemetry({
          speedMph: tState.speedMph,
          pressurePsi: tState.pressurePsi,
          fireboxTempF: tState.fireboxTempF,
          distanceMiles: tState.distanceTraveledMiles,
          totalRouteMiles: tState.totalRouteMiles,
          currentCheckpointIdx: cpIdx,
        });
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    // 12. RESPONSIVE WINDOW RESIZE HANDLER
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // 13. COMPLETE RESOURCE CLEANUP ON UNMOUNT
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      domElem.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);

      puffs.forEach((p) => {
        scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
      });
      puffGeo.dispose();

      Object.values(materials).forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, []);

  // ==========================================================================
  // GAMEPLAY INTERACTION HANDLERS
  // ==========================================================================

  const handleSelectChoice = useCallback(
    (choiceIdx: number) => {
      if (feedbackState.status === 'correct' || eliminatedChoices.includes(choiceIdx)) {
        return;
      }

      const isCorrect = choiceIdx === currentQuestion.correctIndex;
      const tState = telemetryRef.current;

      if (isCorrect) {
        // Play celebratory brass whistle + cylinder steam burst
        audioRef.current?.playSuccessWhistleAndSteam();

        // Boost steam pressure, train speed, and route advancement
        const newTargetPressure = Math.min(210, tState.targetPressurePsi + 22);
        const newTargetSpeed = Math.min(72, tState.targetSpeedMph + 9.5);
        tState.targetPressurePsi = newTargetPressure;
        tState.pressurePsi = Math.min(215, tState.pressurePsi + 14);
        tState.targetSpeedMph = newTargetSpeed;
        tState.burstTimer = 1.65;
        tState.nextSignalGreen = true;

        // Advance route progress substantially on correct dispatch
        const nextDist = Math.min(
          tState.totalRouteMiles,
          tState.distanceTraveledMiles + 1.85
        );
        tState.distanceTraveledMiles = nextDist;

        setStats((prev) => ({
          ...prev,
          questionsAnswered: prev.questionsAnswered + 1,
          firstTryCorrect:
            eliminatedChoices.length === 0 ? prev.firstTryCorrect + 1 : prev.firstTryCorrect,
          peakSpeedMph: Math.max(prev.peakSpeedMph, newTargetSpeed),
          pressureSamples: [...prev.pressureSamples, newTargetPressure],
        }));

        setFeedbackState({
          status: 'correct',
          explanation: currentQuestion.explanation,
        });
      } else {
        // Play steam pressure vent & iron clank
        audioRef.current?.playPressureVentError();

        // Vent boiler pressure & drop momentum
        tState.targetPressurePsi = Math.max(85, tState.targetPressurePsi - 18);
        tState.pressurePsi = Math.max(80, tState.pressurePsi - 15);
        tState.targetSpeedMph = Math.max(12, tState.targetSpeedMph - 8);
        tState.nextSignalGreen = false;

        setEliminatedChoices((prev) => [...prev, choiceIdx]);
        setStats((prev) => ({
          ...prev,
          totalWrongAttempts: prev.totalWrongAttempts + 1,
          pressureSamples: [...prev.pressureSamples, tState.targetPressurePsi],
        }));

        setFeedbackState({
          status: 'incorrect',
          explanation: currentQuestion.explanation,
        });
      }
    },
    [currentQuestion, eliminatedChoices, feedbackState.status]
  );

  const handleNextDispatch = useCallback(() => {
    const tState = telemetryRef.current;
    if (tState.distanceTraveledMiles >= tState.totalRouteMiles) {
      setStats((prev) => ({
        ...prev,
        completedTimeSec: Math.max(1, Math.round((Date.now() - prev.startTimeMs) / 1000)),
      }));
      setHasArrived(true);
      return;
    }

    setEliminatedChoices([]);
    setFeedbackState({ status: 'idle', explanation: null });
    setQuestionIndex((prev) => prev + 1);
  }, []);

  const handleRestartJourney = useCallback(() => {
    const tState = telemetryRef.current;
    tState.speedMph = 26.0;
    tState.targetSpeedMph = 28.0;
    tState.pressurePsi = 135;
    tState.targetPressurePsi = 135;
    tState.distanceTraveledMiles = 0;
    tState.burstTimer = 0.8;
    tState.nextSignalGreen = true;

    setQuestionIndex(0);
    setEliminatedChoices([]);
    setFeedbackState({ status: 'idle', explanation: null });
    setHasArrived(false);
    setStats({
      questionsAnswered: 0,
      firstTryCorrect: 0,
      totalWrongAttempts: 0,
      peakSpeedMph: 28.0,
      pressureSamples: [135],
      startTimeMs: Date.now(),
      completedTimeSec: 0,
    });
  }, []);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    audioRef.current?.setMuted(next);
  };

  const cycleCameraMode = () => {
    const order: CameraMode[] = ['chase', 'piston', 'cabin', 'orbit'];
    const nextIdx = (order.indexOf(cameraMode) + 1) % order.length;
    setCameraMode(order[nextIdx]);
  };

  const handleAddCustomQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQPrompt.trim() || newQChoices.some((c) => !c.trim())) return;
    const created: Question = {
      id: `custom-${Date.now()}`,
      category: 'Mechanical Engineering',
      prompt: newQPrompt.trim(),
      choices: [...newQChoices] as [string, string, string, string],
      correctIndex: newQCorrect,
      explanation:
        newQExplanation.trim() ||
        'Verified by the Chief Locomotive Superintendent’s technical manual.',
    };
    setCustomQuestions((prev) => [...prev, created]);
    setSelectedDeck('custom');
    setNewQPrompt('');
    setNewQChoices(['', '', '', '']);
    setNewQExplanation('');
    setShowCustomModal(false);
  };

  // Compute Route Progress Percentage & Scholar Rank
  const routeProgressPct = Math.min(
    100,
    (hudTelemetry.distanceMiles / hudTelemetry.totalRouteMiles) * 100
  );

  const accuracyPct =
    stats.questionsAnswered > 0
      ? Math.round((stats.firstTryCorrect / stats.questionsAnswered) * 100)
      : 100;

  const avgPressurePsi = Math.round(
    stats.pressureSamples.reduce((a, b) => a + b, 0) / Math.max(1, stats.pressureSamples.length)
  );

  const scholarRank =
    accuracyPct >= 90
      ? 'Chief Imperial Locomotive Superintendent'
      : accuracyPct >= 75
      ? 'First-Class Master Mechanical Engineer'
      : accuracyPct >= 55
      ? 'Journeyman Steam Driver'
      : 'Apprentice Firebox Stoker';

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#181818] text-[#f4eedc] select-none font-sans">
      {/* 3D THREE.JS VIEWPORT CANVAS */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full z-0 cursor-grab active:cursor-grabbing" />

      {/* ====================================================================
          TOP INDUSTRIAL TELEMETRY & ROUTE CHECKPOINT BAR
      ==================================================================== */}
      <header className="relative z-10 w-full px-4 pt-3 pointer-events-none">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
          {/* Brand Crest & Study Deck Selector */}
          <div className="flex items-center gap-3 bg-[#181614]/95 border-2 border-[#8c6d1f] px-4 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.85)]">
            <div className="w-9 h-9 bg-[#2a2118] border border-[#c59b27] flex items-center justify-center">
              <Train className="w-5 h-5 text-[#c59b27]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-lg font-bold tracking-wider uppercase text-[#f4eedc]">
                  SteamScholar
                </h1>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-[#8c6d1f]/30 border border-[#c59b27]/60 text-[#c59b27]">
                  No. 1829
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <label className="text-[10px] font-mono uppercase text-[#a89f8d]">Logbook:</label>
                <select
                  value={selectedDeck}
                  onChange={(e) => {
                    setSelectedDeck(e.target.value as DeckId);
                    setQuestionIndex(0);
                    setEliminatedChoices([]);
                    setFeedbackState({ status: 'idle', explanation: null });
                  }}
                  className="bg-[#22201e] text-[#f4eedc] text-xs font-mono border border-[#8c6d1f] px-1.5 py-0.5 focus:outline-none focus:border-[#c59b27]"
                >
                  <option value="all">All Industrial Disciplines ({BUILT_IN_QUESTIONS.length + customQuestions.length})</option>
                  <option value="thermodynamics">Thermodynamics & Metallurgy</option>
                  <option value="engineering">Mechanical Engineering</option>
                  <option value="history">Industrial History & Rail Ops</option>
                  {customQuestions.length > 0 && (
                    <option value="custom">Custom Study Deck ({customQuestions.length})</option>
                  )}
                </select>
                <button
                  onClick={() => setShowCustomModal(true)}
                  title="Add Custom Study Questions"
                  className="text-xs font-mono bg-[#2c251d] hover:bg-[#3d3326] text-[#c59b27] border border-[#8c6d1f] px-2 py-0.5 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Deck</span>
                </button>
              </div>
            </div>
          </div>

          {/* Brass Pressure Gauge & Speedometer Cluster */}
          <BrassTelemetryCluster
            pressurePsi={hudTelemetry.pressurePsi}
            speedMph={hudTelemetry.speedMph}
            fireboxTempF={hudTelemetry.fireboxTempF}
          />

          {/* Utility Controls: Camera Angle, Audio Synth Mute, Restart */}
          <div className="flex items-center gap-2 bg-[#181614]/95 border-2 border-[#8c6d1f] px-3 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.85)]">
            <button
              onClick={cycleCameraMode}
              className="px-2.5 py-1.5 bg-[#22201e] hover:bg-[#332d26] border border-[#8c6d1f] text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 text-[#f4eedc] transition-colors"
              title="Switch 3D Camera Perspective"
            >
              <Camera className="w-3.5 h-3.5 text-[#c59b27]" />
              <span>
                {cameraMode === 'chase'
                  ? 'Chase View'
                  : cameraMode === 'piston'
                  ? 'Piston Rod View'
                  : cameraMode === 'cabin'
                  ? 'Footplate View'
                  : 'Free Orbit'}
              </span>
            </button>

            <button
              onClick={toggleMute}
              className="p-1.5 bg-[#22201e] hover:bg-[#332d26] border border-[#8c6d1f] text-[#c59b27] transition-colors"
              title={isMuted ? 'Unmute Steam & Whistle Synth' : 'Mute Audio'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-[#e07a5f]" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              onClick={handleRestartJourney}
              className="px-2.5 py-1.5 bg-[#22201e] hover:bg-[#3b2323] border border-[#8c6d1f] text-xs font-mono uppercase tracking-wider flex items-center gap-1 text-[#f4eedc] transition-colors"
              title="Reset Locomotive Route"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#b87333]" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>

        {/* Route Progress & Named Railway Checkpoints Bar */}
        <div className="max-w-7xl mx-auto mt-2 bg-[#181614]/90 border border-[#8c6d1f] px-4 py-2 shadow-lg pointer-events-auto">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider mb-1.5">
            <div className="flex items-center gap-2">
              <Compass className="w-3.5 h-3.5 text-[#c59b27]" />
              <span className="text-[#c59b27]">Current Section:</span>
              <span className="text-[#f4eedc] font-bold">
                {CHECKPOINTS[hudTelemetry.currentCheckpointIdx]?.name}
              </span>
              <span className="hidden md:inline text-[#a89f8d]">
                — {CHECKPOINTS[hudTelemetry.currentCheckpointIdx]?.description}
              </span>
            </div>
            <div className="text-[#f4eedc]">
              <span className="text-[#c59b27] font-bold">{hudTelemetry.distanceMiles.toFixed(1)}</span>
              {' / '}
              <span>{hudTelemetry.totalRouteMiles.toFixed(1)} MILES TO TERMINUS</span>
            </div>
          </div>

          {/* Track Bar with Station Nodes */}
          <div className="relative h-2.5 bg-[#2a2622] border border-[#6b5316]">
            <div
              className="h-full bg-[#c59b27] transition-all duration-300"
              style={{ width: `${routeProgressPct}%` }}
            />
            {CHECKPOINTS.map((cp, idx) => {
              const leftPct = (cp.distanceMiles / hudTelemetry.totalRouteMiles) * 100;
              const reached = hudTelemetry.distanceMiles >= cp.distanceMiles;
              return (
                <div
                  key={cp.name}
                  style={{ left: `${leftPct}%` }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                >
                  <div
                    className={`w-3 h-3 rotate-45 border ${
                      reached
                        ? 'bg-[#c59b27] border-[#f4eedc]'
                        : 'bg-[#181614] border-[#8c6d1f]'
                    }`}
                  />
                  <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-4 bg-[#181614] border border-[#c59b27] px-2 py-1 text-[10px] font-mono whitespace-nowrap z-30 shadow-md">
                    {idx + 1}. {cp.name} ({cp.distanceMiles} mi)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* ====================================================================
          BOTTOM TELEGRAPH DISPATCH QUESTION PANEL
      ==================================================================== */}
      {!hasArrived && (
        <main className="absolute bottom-3 left-0 right-0 z-10 px-4 pointer-events-none">
          <div className="max-w-4xl mx-auto bg-[#181614]/95 border-2 border-[#8c6d1f] shadow-[0_12px_35px_rgba(0,0,0,0.92)] pointer-events-auto relative">
            {/* Corner Brass Rivets */}
            <span className="w-2 h-2 rounded-full bg-[#c59b27] absolute top-1.5 left-1.5" />
            <span className="w-2 h-2 rounded-full bg-[#c59b27] absolute top-1.5 right-1.5" />
            <span className="w-2 h-2 rounded-full bg-[#c59b27] absolute bottom-1.5 left-1.5" />
            <span className="w-2 h-2 rounded-full bg-[#c59b27] absolute bottom-1.5 right-1.5" />

            {/* Panel Header Bar */}
            <div className="flex items-center justify-between bg-[#221e1a] border-b border-[#8c6d1f] px-5 py-2">
              <div className="flex items-center gap-2.5">
                <Wrench className="w-4 h-4 text-[#c59b27]" />
                <span className="text-xs font-mono uppercase tracking-widest text-[#c59b27] font-bold">
                  Engineering Dispatch #{questionIndex + 1}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 bg-[#2f281e] border border-[#b87333] text-[#f4eedc]">
                  {currentQuestion.category}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-[11px] font-mono text-[#a89f8d]">
                  Correct dispatch stokes +22 PSI & advances 1.85 mi
                </span>
                <button
                  onClick={() => setIsMinimizedHud(!isMinimizedHud)}
                  className="text-[11px] font-mono uppercase text-[#c59b27] hover:underline border border-[#8c6d1f]/60 px-2 py-0.5"
                >
                  {isMinimizedHud ? 'Expand Dispatch' : 'Inspect 3D Train'}
                </button>
              </div>
            </div>

            {/* Collapsible Question & Choices Body */}
            {!isMinimizedHud && (
              <div className="p-4 sm:p-5">
                {/* Question Prompt */}
                <h2 className="font-serif text-base sm:text-lg font-semibold text-[#f4eedc] leading-snug mb-3.5">
                  {currentQuestion.prompt}
                </h2>

                {/* 4 Answer Choices Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {currentQuestion.choices.map((choiceText, idx) => {
                    const isEliminated = eliminatedChoices.includes(idx);
                    const isCorrectRevealed =
                      feedbackState.status === 'correct' && idx === currentQuestion.correctIndex;

                    let btnStyle =
                      'bg-[#22201e] hover:bg-[#2d2924] border-[#6e5619] text-[#f4eedc]';
                    if (isCorrectRevealed) {
                      btnStyle = 'bg-[#1c3322] border-[#4ade80] text-[#f4eedc]';
                    } else if (isEliminated) {
                      btnStyle =
                        'bg-[#2a1a1a]/70 border-[#7f1d1d] text-[#9ca3af] line-through opacity-65 cursor-not-allowed';
                    }

                    const letters = ['A', 'B', 'C', 'D'];

                    return (
                      <button
                        key={idx}
                        disabled={isEliminated || feedbackState.status === 'correct'}
                        onClick={() => handleSelectChoice(idx)}
                        className={`text-left px-3.5 py-2.5 border-2 transition-all flex items-start gap-3 ${btnStyle}`}
                      >
                        <span
                          className={`w-6 h-6 shrink-0 font-mono text-xs font-bold flex items-center justify-center border ${
                            isCorrectRevealed
                              ? 'bg-[#4ade80] text-[#181818] border-[#4ade80]'
                              : isEliminated
                              ? 'bg-[#7f1d1d] text-[#f4eedc] border-[#ef4444]'
                              : 'bg-[#181614] text-[#c59b27] border-[#8c6d1f]'
                          }`}
                        >
                          {letters[idx]}
                        </span>
                        <span className="text-xs sm:text-sm leading-snug">{choiceText}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Ivory / Brass Technical Inspection Explanation Plate */}
                {feedbackState.explanation && (
                  <div
                    className={`mt-3.5 p-3.5 border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      feedbackState.status === 'correct'
                        ? 'bg-[#f4eedc] text-[#181818] border-[#c59b27]'
                        : 'bg-[#2b1917] text-[#f4eedc] border-[#b87333]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {feedbackState.status === 'correct' ? (
                        <CheckCircle2 className="w-5 h-5 text-[#15803d] shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-[#f59e0b] shrink-0 mt-0.5" />
                      )}
                      <div className="text-xs sm:text-sm leading-relaxed">
                        <span className="font-mono font-bold uppercase tracking-wider block mb-0.5">
                          {feedbackState.status === 'correct'
                            ? 'Steam Valve Open — Full Forward Draft!'
                            : 'Pressure Vented — Inspect Mechanism & Retry Remaining Choices:'}
                        </span>
                        <span>{feedbackState.explanation}</span>
                      </div>
                    </div>

                    {feedbackState.status === 'correct' && (
                      <button
                        onClick={handleNextDispatch}
                        className="shrink-0 bg-[#181614] hover:bg-[#2c2620] text-[#c59b27] border-2 border-[#8c6d1f] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 self-end sm:self-center transition-colors"
                      >
                        <span>
                          {hudTelemetry.distanceMiles >= hudTelemetry.totalRouteMiles
                            ? 'Enter Grand Terminus'
                            : 'Next Dispatch'}
                        </span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ====================================================================
          DESTINATION ARRIVED CELEBRATION MODAL
      ==================================================================== */}
      {hasArrived && (
        <div className="fixed inset-0 z-30 bg-black/75 flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-[#181614] border-4 border-[#c59b27] p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.95)] relative">
            <div className="flex items-center gap-3 border-b-2 border-[#8c6d1f] pb-4 mb-5">
              <div className="w-12 h-12 bg-[#2a2118] border-2 border-[#c59b27] flex items-center justify-center">
                <Award className="w-7 h-7 text-[#c59b27]" />
              </div>
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-[#c59b27]">
                  Imperial Exhibition Concourse Reached
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#f4eedc]">
                  Grand Central Terminus
                </h2>
              </div>
            </div>

            {/* Assigned Scholar Rank Plate */}
            <div className="bg-[#f4eedc] text-[#181818] border-2 border-[#8c6d1f] p-4 mb-5">
              <div className="text-[11px] font-mono uppercase tracking-widest text-[#7c2d12]">
                Conferred Guild Warrant
              </div>
              <div className="font-serif text-xl font-bold text-[#181818] mt-0.5">
                {scholarRank}
              </div>
              <p className="text-xs text-[#3b362e] mt-1">
                Locomotive No. 1829 completed the 12.5-mile industrial valley run from Ironbridge Foundry with full boiler integrity.
              </p>
            </div>

            {/* Journey Telemetry Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-[#22201e] border border-[#8c6d1f] p-3">
                <div className="text-[10px] font-mono uppercase text-[#a89f8d]">First-Try Accuracy</div>
                <div className="text-xl font-mono font-bold text-[#c59b27] mt-1">{accuracyPct}%</div>
              </div>
              <div className="bg-[#22201e] border border-[#8c6d1f] p-3">
                <div className="text-[10px] font-mono uppercase text-[#a89f8d]">Peak Velocity</div>
                <div className="text-xl font-mono font-bold text-[#f4eedc] mt-1">
                  {stats.peakSpeedMph.toFixed(1)} MPH
                </div>
              </div>
              <div className="bg-[#22201e] border border-[#8c6d1f] p-3">
                <div className="text-[10px] font-mono uppercase text-[#a89f8d]">Mean Steam PSI</div>
                <div className="text-xl font-mono font-bold text-[#f4eedc] mt-1">{avgPressurePsi} PSI</div>
              </div>
              <div className="bg-[#22201e] border border-[#8c6d1f] p-3">
                <div className="text-[10px] font-mono uppercase text-[#a89f8d]">Run Duration</div>
                <div className="text-xl font-mono font-bold text-[#f4eedc] mt-1">
                  {stats.completedTimeSec}s
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                onClick={handleRestartJourney}
                className="bg-[#c59b27] hover:bg-[#d8ae37] text-[#181818] font-mono text-xs font-bold uppercase tracking-wider px-5 py-2.5 border-2 border-[#f4eedc] flex items-center gap-2 transition-colors"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Embark on New Run</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          CUSTOM STUDY DECK CREATOR MODAL
      ==================================================================== */}
      {showCustomModal && (
        <div className="fixed inset-0 z-30 bg-black/75 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-[#181614] border-2 border-[#c59b27] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#8c6d1f] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#c59b27]" />
                <h3 className="font-serif text-lg font-bold text-[#f4eedc]">
                  Add Custom Telegraph Dispatch Question
                </h3>
              </div>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-xs font-mono text-[#a89f8d] hover:text-[#f4eedc]"
              >
                [CLOSE]
              </button>
            </div>

            <form onSubmit={handleAddCustomQuestion} className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-[#c59b27] uppercase mb-1">Question Prompt</label>
                <input
                  type="text"
                  required
                  value={newQPrompt}
                  onChange={(e) => setNewQPrompt(e.target.value)}
                  placeholder="e.g., What does the First Law of Thermodynamics state?"
                  className="w-full bg-[#22201e] border border-[#8c6d1f] px-3 py-2 text-[#f4eedc] focus:outline-none focus:border-[#c59b27]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx}>
                    <label className="flex items-center justify-between text-[#a89f8d] mb-1">
                      <span>Option {['A', 'B', 'C', 'D'][idx]}</span>
                      <input
                        type="radio"
                        name="correctChoice"
                        checked={newQCorrect === idx}
                        onChange={() => setNewQCorrect(idx)}
                      />
                    </label>
                    <input
                      type="text"
                      required
                      value={newQChoices[idx]}
                      onChange={(e) => {
                        const updated = [...newQChoices] as [string, string, string, string];
                        updated[idx] = e.target.value;
                        setNewQChoices(updated);
                      }}
                      placeholder={`Answer choice ${idx + 1}`}
                      className="w-full bg-[#22201e] border border-[#8c6d1f] px-2.5 py-1.5 text-[#f4eedc]"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[#c59b27] uppercase mb-1">
                  Engineering Explanation (shown after answer)
                </label>
                <textarea
                  rows={2}
                  value={newQExplanation}
                  onChange={(e) => setNewQExplanation(e.target.value)}
                  placeholder="Brief explanation of why the correct option works..."
                  className="w-full bg-[#22201e] border border-[#8c6d1f] px-3 py-1.5 text-[#f4eedc]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-3 py-1.5 border border-[#8c6d1f] text-[#a89f8d] hover:text-[#f4eedc]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#c59b27] text-[#181818] font-bold uppercase"
                >
                  Save to Deck
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}