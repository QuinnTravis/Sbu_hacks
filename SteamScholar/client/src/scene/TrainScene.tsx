import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import {
  buildWorld,
  CRANK_RADIUS,
  DRIVE_RADIUS,
  MAIN_ROD_LENGTH,
  SMALL_RADIUS,
  Z_CYLINDER,
  Z_FRONT_DRIVE,
  Z_REAR_DRIVE,
} from './buildWorld';
import { onEffect } from './effects';

/** Store speed (0-100) to world units per second. */
const SPEED_TO_WORLD = 0.2;
/** Fraction of the gap to target speed closed per 60 Hz frame (spec 4). */
const SPEED_LERP_PER_FRAME = 0.04;
/** Braking deceleration into a station, world units/s². */
const BRAKE_DECEL = 5;
/** The train speeds up to at least this (world units/s) while approaching, so slow trains still arrive promptly. */
const APPROACH_MIN_WORLD_SPEED = 12;
/** Extra run-in before braking starts, so the station appears far off in the fog rather than popping in. */
const APPROACH_RUN_IN = 35;
/** Station group z at which the platform sits beside the locomotive. */
const STATION_STOP_Z = -6;
const STATION_HALF_LENGTH = 14;
const POLE_SPACING = 18;
/** Three-quarter view from beside the cab: boiler, driving wheels and rods in frame, line ahead visible. */
const CAMERA_POS = new THREE.Vector3(7.0, 3.5, 5.4);
const CAMERA_TARGET = new THREE.Vector3(-0.6, 2.0, -4.5);
const SHAKE_SECONDS = 0.2;
const SHAKE_AMPLITUDE = 0.08;

type StationState = 'hidden' | 'approaching' | 'stopped' | 'leaving';

interface SmokePuff {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
  type: 'chimney' | 'cylinder';
}

/**
 * The prototype's Three.js world wrapped as a React component. Reads the game store every
 * frame (targetSpeed, stopAtNextStation, reduceMotion, pressure) and writes actualSpeed back.
 */
export default function TrainScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. SCENE, CAMERA, RENDERER
    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x28211c);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(0x28211c, 0.0115);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 260);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const world = buildWorld(scene);
    const {
      materials,
      trainGroup,
      fireboxLight,
      drivingWheels,
      smallWheels,
      mechanisms,
      sleepers,
      trackSpan,
      sceneryScrollObjects,
      telegraphPoles,
      semaphoreArm,
      signalLamp,
      stationGroup,
    } = world;

    // 2. CHIMNEY SMOKE & CYLINDER STEAM PARTICLES
    const puffs: SmokePuff[] = [];
    const puffGeo = new THREE.DodecahedronGeometry(0.36, 1);

    const spawnPuff = (
      origin: THREE.Vector3,
      vel: THREE.Vector3,
      maxAge: number,
      type: 'chimney' | 'cylinder',
      colorHex = 0xdad6ce,
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

    const chimneyOrigin = () =>
      new THREE.Vector3((Math.random() - 0.5) * 0.18, 4.75, -3.65 + (Math.random() - 0.5) * 0.18);

    // 3. EFFECT HANDLERS (spec 4: imperative triggers)
    let burstTimer = 0;
    let sputterTimer = 0;
    let shakeTimer = 0;
    let worldSpeed = 0;

    const offEffects = [
      onEffect('steamBurst', () => {
        burstTimer = 1.2;
        const count = useGameStore.getState().settings.reduceMotion ? 4 : 9;
        for (let i = 0; i < count; i++) {
          spawnPuff(
            chimneyOrigin(),
            new THREE.Vector3((Math.random() - 0.5) * 1.6, 5 + Math.random() * 2.5, worldSpeed * 0.6 + Math.random()),
            1.8 + Math.random() * 0.8,
            'chimney',
            0xf5f2eb,
          );
        }
      }),
      onEffect('sputter', () => {
        sputterTimer = 0.8;
      }),
      onEffect('shake', () => {
        if (!useGameStore.getState().settings.reduceMotion) shakeTimer = SHAKE_SECONDS;
      }),
    ];

    // 4. ANIMATION & KINEMATICS LOOP
    let animationFrameId: number;
    let lastTime = performance.now();
    let wheelAngle = 0;
    let smokeAccum = 0;
    let speedSyncTimer = 0;
    let actualSpeed = useGameStore.getState().actualSpeed;
    let stationState: StationState = 'hidden';

    const animate = (now: number) => {
      animationFrameId = requestAnimationFrame(animate);
      // Cap the step (tab switches) but keep real-time pace down to 10 fps on slow laptops.
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const game = useGameStore.getState();
      const reduceMotion = game.settings.reduceMotion;
      // Map 0-100 store pressure onto the prototype's PSI range for its visual formulas.
      const pressurePsi = 100 + game.pressure * 1.1;

      // --- Speed: lerp toward targetSpeed, then apply station braking ---
      const lerp = 1 - Math.pow(1 - SPEED_LERP_PER_FRAME, dt * 60);

      if (game.stopAtNextStation && (stationState === 'hidden' || stationState === 'leaving')) {
        // Place the station ahead at braking distance so the train eases to a stop beside it.
        const approachV = Math.max(actualSpeed * SPEED_TO_WORLD, APPROACH_MIN_WORLD_SPEED);
        stationGroup.position.z = STATION_STOP_Z - ((approachV * approachV) / (2 * BRAKE_DECEL) + APPROACH_RUN_IN);
        stationGroup.visible = true;
        stationState = 'approaching';
      } else if (!game.stopAtNextStation && (stationState === 'approaching' || stationState === 'stopped')) {
        stationState = 'leaving';
      }

      if (stationState === 'approaching') {
        const remaining = STATION_STOP_Z - stationGroup.position.z;
        const desired = Math.max(game.targetSpeed * SPEED_TO_WORLD, APPROACH_MIN_WORLD_SPEED);
        let v = actualSpeed * SPEED_TO_WORLD;
        v += (desired - v) * lerp;
        v = Math.min(v, Math.max(0.3, Math.sqrt(2 * BRAKE_DECEL * Math.max(0, remaining))));
        if (remaining <= v * dt) {
          stationGroup.position.z = STATION_STOP_Z;
          v = 0;
          stationState = 'stopped';
          game.onStationArrived(game.stationIndex);
        }
        actualSpeed = v / SPEED_TO_WORLD;
      } else if (stationState === 'stopped') {
        actualSpeed = 0;
      } else {
        actualSpeed += (game.targetSpeed - actualSpeed) * lerp;
      }

      worldSpeed = actualSpeed * SPEED_TO_WORLD;
      const speedMph = worldSpeed / 0.36;

      // Firebox flicker intensity
      fireboxLight.intensity = 2.0 + Math.sin(now * 0.018) * 0.45 + (pressurePsi / 200) * 1.2;

      // Subtle locomotive suspension sway on rails
      if (reduceMotion) {
        trainGroup.position.y = 0;
        trainGroup.rotation.z = 0;
      } else {
        const swayFreq = now * 0.008 * (speedMph / 30);
        trainGroup.position.y = Math.abs(Math.sin(swayFreq * 2)) * 0.012;
        trainGroup.rotation.z = Math.sin(swayFreq) * 0.0045;
      }

      // Rotate driving & small wheels in proportion to speed
      wheelAngle += (worldSpeed * dt) / DRIVE_RADIUS;
      drivingWheels.forEach((dw) => {
        const phase = dw.side === 1 ? 0 : Math.PI / 2;
        dw.group.rotation.x = -(wheelAngle + phase);
      });
      smallWheels.forEach((sw) => {
        sw.rotation.x -= (worldSpeed * dt) / SMALL_RADIUS;
      });

      // Exact slider-crank kinematics for pistons, crossheads, coupling rods & connecting rods
      mechanisms.forEach((mech) => {
        const theta = wheelAngle + mech.phaseOffset;
        const pinY = DRIVE_RADIUS + Math.sin(theta) * CRANK_RADIUS;
        const pinZFront = Z_FRONT_DRIVE - Math.cos(theta) * CRANK_RADIUS;
        const pinZRear = Z_REAR_DRIVE - Math.cos(theta) * CRANK_RADIUS;

        mech.couplingRod.position.set(mech.side * 1.13, pinY, (pinZFront + pinZRear) * 0.5);

        const dy = pinY - DRIVE_RADIUS;
        const horizontalReach = Math.sqrt(Math.max(0.01, MAIN_ROD_LENGTH * MAIN_ROD_LENGTH - dy * dy));
        const crossheadZ = pinZFront - horizontalReach;
        mech.pistonCrosshead.position.set(mech.side * 1.18, DRIVE_RADIUS, crossheadZ);

        const midY = (pinY + DRIVE_RADIUS) * 0.5;
        const midZ = (pinZFront + crossheadZ) * 0.5;
        mech.mainRod.position.set(mech.side * 1.19, midY, midZ);
        mech.mainRod.rotation.x = -Math.atan2(pinY - DRIVE_RADIUS, pinZFront - crossheadZ);
      });

      // Scroll sleepers and scenery seamlessly (the world moves, the train stays put)
      const advance = worldSpeed * dt;
      sleepers.forEach((s) => {
        s.position.z += advance;
        if (s.position.z > 35) s.position.z -= trackSpan;
      });
      sceneryScrollObjects.forEach(({ obj, span }) => {
        obj.position.z += advance;
        if (obj.position.z > 45) obj.position.z -= span;
      });

      if (stationState !== 'hidden' && stationState !== 'stopped') {
        stationGroup.position.z += advance;
        if (stationState === 'leaving' && stationGroup.position.z > 70) {
          stationGroup.visible = false;
          stationState = 'hidden';
        }
      }

      // Hide telegraph poles (and their wires) while they overlap the platform.
      const stationZ = stationGroup.position.z;
      telegraphPoles.forEach((pole) => {
        const z = pole.position.z;
        pole.visible =
          !stationGroup.visible || z < stationZ - STATION_HALF_LENGTH || z - POLE_SPACING > stationZ + STATION_HALF_LENGTH;
      });

      // Signal shows danger while the train is being brought to a stand.
      const signalClear = !game.stopAtNextStation;
      semaphoreArm.rotation.z += ((signalClear ? -0.58 : 0.0) - semaphoreArm.rotation.z) * dt * 5;
      signalLamp.material = signalClear ? materials.signalGreen : materials.signalRed;

      // Continuous chimney smoke scaled with speed & pressure (halved under reduce motion)
      const density = reduceMotion ? 0.5 : 1;
      smokeAccum += dt * (4.5 + speedMph / 12 + pressurePsi / 45) * density;
      while (smokeAccum >= 1) {
        smokeAccum -= 1;
        const puffVel = new THREE.Vector3(
          (Math.random() - 0.5) * 0.9,
          2.6 + pressurePsi / 65 + Math.random() * 1.2,
          worldSpeed * 0.72 + Math.random() * 1.2,
        );
        spawnPuff(chimneyOrigin(), puffVel, 2.2 + Math.random() * 0.9, 'chimney', burstTimer > 0 ? 0xf5f2eb : 0xcbc6be);
      }

      // Lateral cylinder steam bursts after a correct answer
      if (burstTimer > 0) {
        burstTimer = Math.max(0, burstTimer - dt);
        [-1, 1].forEach((side) => {
          if (Math.random() < 0.75 * density) {
            const cylOrigin = new THREE.Vector3(side * 1.35, 0.75, Z_CYLINDER);
            const cylVel = new THREE.Vector3(
              side * (4.8 + Math.random() * 2.5),
              0.4 + Math.random() * 0.8,
              worldSpeed * 0.5 + (Math.random() - 0.5) * 1.5,
            );
            spawnPuff(cylOrigin, cylVel, 0.75 + Math.random() * 0.35, 'cylinder', 0xffffff);
          }
        });
      }

      // Sputter: a few small, irregular, dark puffs after a wrong answer
      if (sputterTimer > 0) {
        sputterTimer = Math.max(0, sputterTimer - dt);
        if (Math.random() < 0.18 * density) {
          const vel = new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.8 + Math.random() * 1.2, worldSpeed * 0.7);
          spawnPuff(chimneyOrigin(), vel, 0.9 + Math.random() * 0.5, 'cylinder', 0x5a524b);
        }
      }

      // Update & recycle smoke/steam puffs
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

      // Chase camera with gentle sway and a short shake on wrong answers
      const sway = reduceMotion ? 0 : 1;
      let shakeX = 0;
      let shakeY = 0;
      if (shakeTimer > 0) {
        shakeTimer = Math.max(0, shakeTimer - dt);
        const amp = SHAKE_AMPLITUDE * (shakeTimer / SHAKE_SECONDS);
        shakeX = (Math.random() - 0.5) * 2 * amp;
        shakeY = (Math.random() - 0.5) * 2 * amp;
      }
      camera.position.set(
        CAMERA_POS.x + Math.sin(now * 0.004) * 0.05 * sway + shakeX,
        CAMERA_POS.y + Math.cos(now * 0.007) * 0.04 * sway + shakeY,
        CAMERA_POS.z,
      );
      camera.lookAt(CAMERA_TARGET);

      renderer.render(scene, camera);

      // Throttled speed sync for the speedometer and chug audio (10 Hz)
      speedSyncTimer += dt;
      if (speedSyncTimer >= 0.1) {
        speedSyncTimer = 0;
        const rounded = Math.round(actualSpeed * 10) / 10;
        if (rounded !== game.actualSpeed) game.setActualSpeed(rounded);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    // 5. RESIZE WITH THE CONTAINER (it changes size between screens)
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // 6. RESOURCE CLEANUP ON UNMOUNT
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      offEffects.forEach((off) => off());
      puffs.forEach((p) => {
        scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
      });
      puffGeo.dispose();
      Object.values(materials).forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="h-full w-full" aria-hidden="true" />;
}
