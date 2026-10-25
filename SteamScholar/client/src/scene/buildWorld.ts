import * as THREE from 'three';

/*
 * Procedural low-poly world lifted from the original SteamScholar prototype
 * (steamscholar_3d_industrial_railway_game.tsx). Geometry and materials are unchanged;
 * the station is now placed on demand instead of looping, and handles are returned
 * for the animation loop in TrainScene.tsx.
 */

export const DRIVE_RADIUS = 0.85;
export const SMALL_RADIUS = 0.44;
export const CRANK_RADIUS = 0.34;
export const Z_REAR_DRIVE = 2.05;
export const Z_FRONT_DRIVE = -0.15;
export const Z_CYLINDER = -3.45;
export const MAIN_ROD_LENGTH = 2.65;

export interface SideMechanism {
  side: number;
  phaseOffset: number; // Left & Right quartered by 90 degrees (PI/2)
  couplingRod: THREE.Mesh;
  pistonCrosshead: THREE.Group;
  mainRod: THREE.Mesh;
}

export type World = ReturnType<typeof buildWorld>;

export function buildWorld(scene: THREE.Scene) {
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

  // Warm fill from the camera side: the sun backlights the train, which left the visible side black.
  const fillLight = new THREE.DirectionalLight(0xffd9a0, 1.1);
  fillLight.position.set(18, 10, 16);
  scene.add(fillLight);

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
  const mechanisms: SideMechanism[] = [];

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
  const telegraphPoles: THREE.Group[] = [];
  const factoryChimneyTips: THREE.Vector3[] = [];

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
    telegraphPoles.push(poleGroup);
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
  signalGroup.add(armPivot);

  const aspectLamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), materials.signalGreen);
  aspectLamp.position.set(0, 6.1, 0.22);
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

  // Grand Victorian Railway Station Platform & Canopy (the train stops here at each station)
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

  // Mirrored to the left of the track so the right-side chase camera never ends up inside the building.
  stationGroup.scale.x = -1;
  stationGroup.position.set(0, -0.15, -400);
  stationGroup.visible = false;
  scene.add(stationGroup);

  return {
    materials,
    trainGroup,
    fireboxLight,
    drivingWheels,
    smallWheels,
    mechanisms,
    sleepers,
    trackSpan: TRACK_SPAN,
    sceneryScrollObjects,
    telegraphPoles,
    semaphoreArm: armPivot,
    signalLamp: aspectLamp,
    stationGroup,
  };
}
