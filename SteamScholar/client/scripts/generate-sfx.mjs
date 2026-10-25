/**
 * Generates the game's sound effects with the ElevenLabs text-to-sound-effects API.
 * Run once, listen, pick, commit the chosen MP3s. The app never calls ElevenLabs at runtime.
 *
 *   npm run sfx -w client                      generate 3 takes of every sound (about 3,000 credits)
 *   npm run sfx -w client -- whistle sputter   regenerate only these sounds
 *   npm run sfx -w client -- --use whistle=2,chug-loop=3   copy chosen takes into public/audio/
 *
 * Takes land in public/sfx-candidates/ (gitignored). With `npm run dev` running, audition them at
 * http://localhost:5173/sfx-candidates/index.html. Needs ELEVENLABS_API_KEY in server/.env.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';

const TAKES = 3;
const audioDir = new URL('../public/audio/', import.meta.url);
const candidatesDir = new URL('../public/sfx-candidates/', import.meta.url);

/** Prompts tuned for a warm Victorian steam theme. Durations match how each sound is used. */
const SOUNDS = {
  whistle: {
    text: 'Vintage steam locomotive whistle, warm two-tone brass chord, one short clean blast, distant countryside',
    duration_seconds: 1.8,
  },
  'chug-loop': {
    text: 'Steady steam locomotive chugging at a constant medium speed, rhythmic exhaust chuffs, wheels on rails, no whistle, no horn',
    duration_seconds: 2,
    loop: true,
  },
  'ui-click': {
    text: 'Single small brass lever click, crisp mechanical switch, dry, no reverb',
    duration_seconds: 0.5,
  },
  'correct-chime': {
    text: 'Single soft warm bell chime, gentle and pleasant, short decay, no music',
    duration_seconds: 1,
  },
  sputter: {
    text: 'Small steam engine sputtering, three short irregular coughs and a soft hiss of escaping steam',
    duration_seconds: 1.2,
  },
};

function useTakes(spec) {
  for (const pair of spec.split(',')) {
    const [name, take] = pair.split('=');
    if (!SOUNDS[name] || !take) throw new Error(`Bad --use entry "${pair}". Example: --use whistle=2,sputter=1`);
    const from = new URL(`${name}-${take}.mp3`, candidatesDir);
    if (!existsSync(from)) throw new Error(`No take ${take} for ${name}; generate it first.`);
    copyFileSync(from, new URL(`${name}.mp3`, audioDir));
    console.log(`public/audio/${name}.mp3 <- take ${take}`);
  }
}

async function generate(name, take, apiKey) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt_influence: 0.5, ...SOUNDS[name] }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`ElevenLabs ${res.status} for ${name} take ${take}: ${detail}`);
  }
  writeFileSync(new URL(`${name}-${take}.mp3`, candidatesDir), Buffer.from(await res.arrayBuffer()));
  console.log(`generated ${name} take ${take}`);
}

function writeAuditionPage() {
  const files = readdirSync(candidatesDir).filter((f) => f.endsWith('.mp3')).sort();
  const rows = Object.keys(SOUNDS)
    .map((name) => {
      const takes = files.filter((f) => f.startsWith(`${name}-`));
      const players = takes
        .map((f) => `<figure><figcaption>${f}</figcaption><audio controls ${name === 'chug-loop' ? 'loop' : ''} src="${f}"></audio></figure>`)
        .join('');
      return `<section><h2>${name}</h2><p>${SOUNDS[name].text}</p>${players || '<p>No takes yet.</p>'}</section>`;
    })
    .join('');
  writeFileSync(
    new URL('index.html', candidatesDir),
    `<!doctype html><meta charset="utf-8"><title>SFX takes</title>
<style>body{font:16px system-ui;background:#14110F;color:#F6EEDC;max-width:760px;margin:2rem auto;padding:0 1rem}
h2{color:#D9BE8A;margin-top:2rem}figure{margin:.5rem 0}figcaption{font-size:.85rem;color:#E8DBBE}p{color:#E8DBBE}</style>
<h1>SteamScholar sound takes</h1><p>Pick favourites, then run: <code>npm run sfx -w client -- --use whistle=2,chug-loop=1,...</code></p>${rows}`,
  );
}

const args = process.argv.slice(2);
mkdirSync(candidatesDir, { recursive: true });

if (args[0] === '--use') {
  useTakes(args[1] ?? '');
} else {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY is not set. Add it to server/.env (see server/.env.example).');
    process.exit(1);
  }
  const names = args.length ? args : Object.keys(SOUNDS);
  for (const name of names) if (!SOUNDS[name]) throw new Error(`Unknown sound "${name}". Known: ${Object.keys(SOUNDS).join(', ')}`);
  for (const name of names) {
    // Sequential on purpose: free-tier concurrency is low.
    for (let take = 1; take <= TAKES; take++) await generate(name, take, apiKey);
    // Default to take 1 so the game has sound right away; swap with --use after listening.
    if (!existsSync(new URL(`${name}.mp3`, audioDir))) copyFileSync(new URL(`${name}-1.mp3`, candidatesDir), new URL(`${name}.mp3`, audioDir));
  }
  writeAuditionPage();
  console.log('Audition: http://localhost:5173/sfx-candidates/index.html (with npm run dev running)');
}
