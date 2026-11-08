import * as THREE from '../vendor/three/three.module.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from '../vendor/addons/postprocessing/FilmPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';

/* ============================================================================
   THE FACILITY: NULL
   A local-first, procedurally built survival-horror experience.
   Created by °-° KING LOOK.S — idea & concept by °-° KING LOOK.S.
   ========================================================================== */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nowSec = () => performance.now() / 1000;

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const lowDefault = params.get('quality') === 'low' || (coarse && !params.get('quality'));

const game = {
  mode: 'menu', lang: 'de', quality: lowDefault ? 'low' : 'high',
  solo: true, botCount: 0, launchBots: 0,
  phase: 0, keys: [false, false, false], storyDone: false, journalRead: false, cassettePlayed: false,
  power: false, breakers: [false, false], breakerWindow: 0,
  elevatorCalled: false, hold: 0, escapeReady: false, detonation: null,
  health: 100, stamina: 100, fear: 0, battery: 34,
  flashlightOn: false, hasFlashlight: false, hasRadio: false,
  noise: 0, monsterAlert: 0, monsterState: 'dormant', monsterDist: 99, monsterSeen: 0,
  down: false, revive: 0, deathTimer: 0, damageCd: 0, hurtFlash: 0,
  paused: false, ending: false, endingWon: false, elapsed: 0,
  subtitles: true, voiceOn: false, micReady: false, talking: false, micNoise: 0,
  sensitivity: 0.8, volume: 0.7,
  roomCode: '', roomPlayers: [], micStream: null, micAnalyser: null,
  crouch: false, sprinting: false, sprintLock: false,
  lastObjectiveAt: -99, objectiveVisible: true, introT: 0,
  seenEnding: false, pickedBattery: 0, throwCd: 0, radioCd: 0,
  touchMove: { x: 0, y: 0 }, touchLook: null,
  hitCount: 0, alarm: false, liftDoorOpen: false,
  debug: params.has('debug'),
};

const player = {
  pos: new THREE.Vector3(0, 0, 2.6),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  radius: 0.33,
  eye: 1.68,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030504);
scene.fog = new THREE.FogExp2(0x070b0a, 0.042);
// A whisper of ambient light so geometry stays readable in the dark.
const ambient = new THREE.HemisphereLight(0x4a5a52, 0x0a0c0a, 0.42);
scene.add(ambient);

const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.06, 160);
camera.rotation.order = 'YXZ';

const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowDefault, alpha: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const world = new THREE.Group();
scene.add(world);

const colliders = [];
const interactables = [];
const flickers = [];
const particles = [];
const bots = [];
const dynamicLights = [];
const doors = [];
const keyMeshes = [];
const bloodDecals = [];
const glassPanes = [];
let composer = null, bloomPass = null, filmPass = null;
let flashlight = null, flashlightFill = null, monster = null, monsterLight = null;
let deskLamp = null, liftLight = null, ambientHum = null;
let lastTime = 0, bob = 0, footTimer = 0, heartTimer = 0, growlTimer = 5;
const keysDown = new Set();
let holdTarget = null, holdT = 0, holdNeeded = 0;
let micCheckTimer = 0, botLineTimer = 14;
let menuCamT = 0;
let tempVec = new THREE.Vector3();

const KEY_LABELS = ['MED', 'LAB', 'REACTOR'];
const KEY_COLORS = [0x5fb7d8, 0xd8a24e, 0xd9665c];
const BOT_NAMES = ['WARD, E.', 'VOSS, K.', 'ITO, M.'];
const BOT_ROLES = ['FIELD MEDIC', 'CONTAINMENT TECH', 'SECURITY'] ;

/* ── Localization ────────────────────────────────────────────────────────── */
const translations = {
  de: {
    loading: 'ANLAGE WIRD INITIALISIERT', tagline: 'SIE HÖRT DICH ATMEN.', newGame: 'NEUES SPIEL',
    multiplayer: 'MULTIPLAYER', settings: 'EINSTELLUNGEN', credits: 'ARCHIV / CREDITS', back: 'ZURÜCK',
    language: 'SPRACHE / LANGUAGE', masterVolume: 'MASTER-LAUTSTÄRKE', lookSensitivity: 'MAUSEMPFINDLICHKEIT',
    subtitles: 'UNTERTITEL', graphics: 'GRAFIK', voiceChat: 'NÄHE-SPRACHCHAT', controls: 'STEUERUNG',
    coopIntro: 'ALLEIN IST ES SCHLIMMER. ZU ZWEIT IMMER NOCH SCHLIMM.', hostLobby: 'PRIVATEN RAUM ERSTELLEN',
    hostDesc: 'TEILE DEN 4-STELLIGEN RAUMCODE', joinLobby: 'MIT CODE BEITRETEN', joinDesc: 'GIB DEN CODE DEINER GRUPPE EIN',
    join: 'BEITRETEN', quickPlay: 'QUICK PLAY', quickDesc: 'ÖFFENTLICHE SUCHE · 2–4 OPERATOREN',
    offlineBots: 'OFFLINE / KI-TEAM', offlineDesc: 'SPIELE SOLO ODER MIT KOOPERATIVEN BOTS', yourLobby: 'DEIN EINSATZ',
    copyCode: 'CODE KOPIEREN', waitingOperator: 'WARTE AUF OPERATIVE', openSlot: 'OFFENER PLATZ',
    launch: 'EINSATZ STARTEN', addBots: '+ KI-TEAM AUFFÜLLEN', skipIntro: 'ÜBERSPRINGEN ↗',
    archiveTitle: 'ARCHIV / CREDITS', archiveIntro: 'Ein kleines, unabhängiges Survival-Horror-Erlebnis.',
    archiveCreator: 'ERSCHAFFEN VON', archiveDesign: 'DESIGN & ENTWICKLUNG', archiveTech: 'TECHNOLOGIE',
    archiveVoice: 'STIMME', archiveThanks: 'Danke, dass du die Anlage betreten hast. Manche Dinge sollten unten bleiben.',
    resume: 'FORTSETZEN', quit: 'EINSATZ ABBRECHEN', retry: 'ERNEUT VERSUCHEN', returnTitle: 'ZURÜCK ZUM TITEL',
    localNote: 'PRIVATE CODES SIND IN DIESEM BUILD LOKAL. TEILE SIE MIT FREUNDEN AUF DERSELBEN SPIELINSTANZ.',
    downCopy: 'Halte E, um dein Team zu rufen.', micOff: 'MIKROFON AUS · PUSH-TO-TALK V',
    micOn: 'MIKROFON BEREIT · NÄHE-SPRACHCHAT', micDenied: 'MIKROFON VERWEIGERT · PTT BLEIBT AKTIV',
    searchPublic: 'SUCHE ÖFFENTLICHE OPERATION …', foundSquad: 'TEAM GEFUNDEN · VERBINDUNG AUFGEBAUT',
    localRelay: 'LOKALER RELAIS · KEIN ONLINE-MATCHMAKING', codeLocal: 'CODE LOKAL · RELAIS SIMULIERT',
    noCode: 'BITTE EINEN 4-STELLIGEN CODE EINGEBEN', botsReady: 'KI-TEAM EINSATZBEREIT',
  },
  en: {
    loading: 'INITIALIZING FACILITY', tagline: 'IT CAN HEAR YOU BREATHING.', newGame: 'NEW OPERATION',
    multiplayer: 'MULTIPLAYER', settings: 'SETTINGS', credits: 'ARCHIVE / CREDITS', back: 'BACK',
    language: 'LANGUAGE / SPRACHE', masterVolume: 'MASTER VOLUME', lookSensitivity: 'LOOK SENSITIVITY',
    subtitles: 'SUBTITLES', graphics: 'GRAPHICS', voiceChat: 'PROXIMITY VOICE', controls: 'CONTROLS',
    coopIntro: 'ALONE IS WORSE. TOGETHER IS STILL BAD.', hostLobby: 'CREATE PRIVATE LOBBY',
    hostDesc: 'SHARE YOUR FOUR-CHARACTER ROOM CODE', joinLobby: 'JOIN WITH CODE', joinDesc: 'ENTER YOUR SQUAD’S ROOM CODE',
    join: 'JOIN', quickPlay: 'QUICK PLAY', quickDesc: 'PUBLIC SEARCH · 2–4 OPERATORS',
    offlineBots: 'OFFLINE / BOT TEAM', offlineDesc: 'GO SOLO OR DEPLOY WITH COOPERATIVE AI', yourLobby: 'YOUR OPERATION',
    copyCode: 'COPY CODE', waitingOperator: 'WAITING FOR OPERATIVE', openSlot: 'OPEN SLOT',
    launch: 'BEGIN OPERATION', addBots: '+ FILL WITH AI TEAM', skipIntro: 'SKIP INTRO ↗',
    archiveTitle: 'ARCHIVE / CREDITS', archiveIntro: 'A small independent survival-horror experience.',
    archiveCreator: 'CREATED BY', archiveDesign: 'DESIGN & DEVELOPMENT', archiveTech: 'TECHNOLOGY',
    archiveVoice: 'VOICE', archiveThanks: 'Thank you for entering the facility. Some things should stay below.',
    resume: 'RESUME', quit: 'ABANDON OPERATION', retry: 'TRY AGAIN', returnTitle: 'RETURN TO TITLE',
    localNote: 'PRIVATE CODES ARE LOCAL TO THIS BUILD. SHARE THEM WITH FRIENDS ON THE SAME GAME INSTANCE.',
    downCopy: 'Hold E to signal your team.', micOff: 'MICROPHONE OFF · PUSH-TO-TALK V',
    micOn: 'MICROPHONE READY · PROXIMITY VOICE', micDenied: 'MICROPHONE DENIED · PTT STILL ACTIVE',
    searchPublic: 'SEARCHING PUBLIC OPERATION …', foundSquad: 'SQUAD FOUND · LINK ESTABLISHED',
    localRelay: 'LOCAL RELAY · NO ONLINE MATCHMAKING', codeLocal: 'CODE LOCAL · RELAY SIMULATED',
    noCode: 'ENTER A FOUR-CHARACTER CODE', botsReady: 'BOT SQUAD READY',
  },
};
const tr = (de, en) => game.lang === 'de' ? de : en;
const t = key => translations[game.lang][key] || translations.en[key] || key;

const objectives = {
  de: [
    'Lies das Einsatzjournal und entriegle die Sicherheitstür.',
    'Finde die MED-Schlüsselkarte in der Behandlungsstation.',
    'Scanne die MED-Karte am Laborzugang.',
    'Finde die LAB-Schlüsselkarte im Probenarchiv.',
    'Scanne die LAB-Karte am Reaktorzugang.',
    'Finde die REACTOR-Karte im Kontrollraum.',
    'Stelle den Hauptgenerator mit beiden Brechern wieder her.',
    'Rufe den Oberflächenaufzug und überlebe 60 Sekunden.',
    'Der Aufzug ist bereit. Betritt die Kabine.',
  ],
  en: [
    'Read the field journal and unlock the security door.',
    'Find the MED keycard in the treatment ward.',
    'Scan the MED card at the laboratory access.',
    'Find the LAB keycard in the sample archive.',
    'Scan the LAB card at the reactor access.',
    'Find the REACTOR card in the control room.',
    'Restore the main generator using both breakers.',
    'Call the surface elevator and survive 60 seconds.',
    'The elevator is ready. Board the car.',
  ],
};
const sectorNames = {
  de: ['SEKTOR 01 · SICHERHEIT', 'SEKTOR 02 · MEDIZIN', 'SEKTOR 03 · FORSCHUNG', 'SEKTOR 04 · REAKTOR', 'SEKTOR 05 · OBERFLÄCHE'],
  en: ['SECTOR 01 · SECURITY', 'SECTOR 02 · MEDICAL', 'SECTOR 03 · RESEARCH', 'SECTOR 04 · REACTOR', 'SECTOR 05 · SURFACE'],
};

/* ── Audio ───────────────────────────────────────────────────────────────── */
const AudioSys = {
  ctx: null, master: null, ambientGain: null, ambientStarted: false,
  voiceQueue: [], speaking: false, lastSpeakAt: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = game.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -22; comp.knee.value = 18; comp.ratio.value = 8;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.startAmbient();
      this.updateListener(camera);
    } catch (e) { console.warn('Audio unavailable', e); }
  },
  setVolume(v) { game.volume = v; if (this.master) this.master.gain.value = v; },
  startAmbient() {
    if (this.ambientStarted || !this.ctx) return;
    this.ambientStarted = true;
    const g = this.ctx.createGain(); g.gain.value = 0.055; g.connect(this.master);
    this.ambientGain = g;
    const o1 = this.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 48;
    const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 72.3;
    const o3 = this.ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 96.8;
    const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 220; filt.Q.value = 2.4;
    const og = this.ctx.createGain(); og.gain.value = 0.32;
    o1.connect(filt); o2.connect(filt); o3.connect(filt); filt.connect(og); og.connect(g);
    o1.start(); o2.start(); o3.start();
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain(); lg.gain.value = 90; lfo.connect(lg); lg.connect(filt.frequency); lfo.start();
    // air / ventilation noise
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = last * 0.985 + w * 0.015; d[i] = last; }
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 420; nf.Q.value = 0.7;
    const ng = this.ctx.createGain(); ng.gain.value = 0.11;
    src.connect(nf); nf.connect(ng); ng.connect(g); src.start();
  },
  updateListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.position, f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, this.ctx.currentTime);
      l.positionY.setValueAtTime(p.y, this.ctx.currentTime);
      l.positionZ.setValueAtTime(p.z, this.ctx.currentTime);
      l.forwardX.setValueAtTime(f.x, this.ctx.currentTime);
      l.forwardY.setValueAtTime(f.y, this.ctx.currentTime);
      l.forwardZ.setValueAtTime(f.z, this.ctx.currentTime);
      l.upX.setValueAtTime(u.x, this.ctx.currentTime);
      l.upY.setValueAtTime(u.y, this.ctx.currentTime);
      l.upZ.setValueAtTime(u.z, this.ctx.currentTime);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  },
  tone(freq = 220, dur = 0.2, type = 'sine', vol = 0.1, pan = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    o.connect(g); g.connect(p); p.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noiseBurst(dur = 0.12, vol = 0.08, freq = 900, type = 'bandpass', pan = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.value = vol;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    src.connect(f); f.connect(g); g.connect(p); p.connect(this.master);
    src.start(t0);
  },
  footstep(sprint = false, pan = 0) {
    this.noiseBurst(sprint ? 0.09 : 0.13, sprint ? 0.055 : 0.03, sprint ? 180 : 240, 'lowpass', pan);
    this.tone(sprint ? 64 : 78, 0.06, 'triangle', sprint ? 0.03 : 0.016, pan);
  },
  radioStatic(dur = 0.5) {
    this.noiseBurst(dur, 0.05, 1800, 'bandpass', rand(-0.3, 0.3));
    this.tone(620, 0.06, 'square', 0.018);
    setTimeout(() => this.tone(420, 0.05, 'square', 0.014), 120);
  },
  heartbeat(intensity = 1) {
    if (!this.ctx) return;
    const v = 0.05 + intensity * 0.1;
    this.tone(46, 0.11, 'sine', v);
    setTimeout(() => this.tone(38, 0.13, 'sine', v * 0.7), 150);
  },
  growl(position, intensity = 1) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(42, 62), t0);
    o.frequency.exponentialRampToValueAtTime(rand(24, 34), t0 + 1.2);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09 * intensity, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
    const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'exponential';
    p.refDistance = 2; p.maxDistance = 34; p.rolloffFactor = 1.4;
    if (p.positionX) { p.positionX.value = position.x; p.positionY.value = 1.4; p.positionZ.value = position.z; }
    else p.setPosition(position.x, 1.4, position.z);
    o.connect(f); f.connect(g); g.connect(p); p.connect(this.master);
    o.start(t0); o.stop(t0 + 1.6);
  },
  alarm() {
    this.tone(660, 0.35, 'square', 0.028);
    setTimeout(() => this.tone(520, 0.42, 'square', 0.024), 380);
  },
  elevator() {
    this.tone(120, 1.1, 'sawtooth', 0.05);
    setTimeout(() => this.tone(180, 0.9, 'triangle', 0.04), 300);
    setTimeout(() => this.tone(90, 1.4, 'sine', 0.06), 900);
  },
  say(text, opts = {}) {
    if (!text) return;
    setSubtitle(text, opts.speaker || '');
    if (!game.subtitles && opts.forceSub !== true) { /* voice still plays */ }
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = opts.rate || 0.9; u.pitch = opts.pitch || 0.82; u.volume = clamp(game.volume, 0, 1);
    const voices = speechSynthesis.getVoices();
    const en = voices.find(v => /en-(GB|US)/i.test(v.lang) && /male|david|daniel|george|alex/i.test(v.name)) || voices.find(v => /^en/i.test(v.lang));
    if (en) u.voice = en;
    this.voiceQueue.push(u);
    if (!this.speaking) this._drainVoice();
  },
  _drainVoice() {
    const u = this.voiceQueue.shift();
    if (!u) { this.speaking = false; return; }
    this.speaking = true;
    u.onend = u.onerror = () => { this.speaking = false; this._drainVoice(); };
    try { speechSynthesis.speak(u); } catch { this.speaking = false; }
  },
  stopVoice() { if ('speechSynthesis' in window) speechSynthesis.cancel(); this.voiceQueue.length = 0; this.speaking = false; },
};

/* ── Subtitle / toast helpers ────────────────────────────────────────────── */
let subtitleTimer = null, toastTimer = null;
function setSubtitle(text, speaker = '', duration = 6000) {
  if (!game.subtitles) return;
  const el = $('#subtitles-line');
  if (!el) return;
  el.innerHTML = (speaker ? `<b>${speaker}</b> ` : '') + text;
  el.classList.add('show');
  clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => el.classList.remove('show'), duration);
}
function showToast(text, duration = 2600, kind = '') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast ' + kind; }, duration);
}
function flashScreen(strength = 0.7) {
  const el = $('#flash'); if (!el) return;
  el.style.opacity = String(strength);
  el.classList.remove('burst');
  requestAnimationFrame(() => el.classList.add('burst'));
  setTimeout(() => { el.style.opacity = '0'; }, 420);
}

/* ── Procedural textures ─────────────────────────────────────────────────── */
const texCache = new Map();
function canvasTexture(key, draw, size = 256, rx = 1, ry = 1) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); draw(x, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texCache.set(key, tex);
  return tex;
}
function noiseFill(x, size, base, amount = 0.08) {
  x.fillStyle = base; x.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * 0.09; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    x.fillStyle = `rgba(${v},${v},${v},${rand(0.012, amount)})`;
    x.fillRect(rand(0, size), rand(0, size), rand(1, 5), rand(1, 4));
  }
}
function makeFloorTex(key, base, grout, accent) {
  return canvasTexture(key, (x, s) => {
    noiseFill(x, s, base, 0.07);
    x.strokeStyle = grout; x.lineWidth = 2;
    for (let i = 0; i <= s; i += s / 4) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(s, i); x.stroke();
    }
    for (let i = 0; i < 24; i++) {
      let px = rand(0, s), py = rand(0, s);
      x.strokeStyle = `rgba(0,0,0,${rand(0.14, 0.4)})`; x.lineWidth = rand(0.5, 1.7);
      x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 4; j++) { px += rand(-18, 18); py += rand(5, 22); x.lineTo(px, py); }
      x.stroke();
    }
    for (let i = 0; i < 13; i++) {
      const g = x.createRadialGradient(rand(0, s), rand(0, s), 1, rand(0, s), rand(0, s), rand(7, 30));
      g.addColorStop(0, `rgba(8,7,6,${rand(0.15, 0.45)})`); g.addColorStop(1, 'rgba(8,7,6,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    }
    if (accent) { x.fillStyle = accent; x.globalAlpha = 0.12; x.fillRect(0, s * 0.43, s, 3); x.globalAlpha = 1; }
  }, 256, 2, 2);
}
function makeWallTex(key, base, accent, opts = {}) {
  return canvasTexture(key, (x, s) => {
    noiseFill(x, s, base, 0.08);
    x.strokeStyle = 'rgba(0,0,0,.33)'; x.lineWidth = 2;
    for (let y = 0; y < s; y += 42) { x.beginPath(); x.moveTo(0, y); x.lineTo(s, y); x.stroke(); }
    for (let i = 0; i < 8; i++) {
      const px = rand(0, s), py = rand(0, s), w = rand(12, 48), h = rand(8, 30);
      x.fillStyle = `rgba(${Math.random() < 0.5 ? '16,15,13' : '110,96,72'},${rand(0.16, 0.5)})`;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + w, py + rand(-4, 4));
      x.lineTo(px + w - rand(0, 8), py + h); x.lineTo(px + rand(0, 8), py + h - rand(0, 6)); x.fill();
    }
    for (let i = 0; i < 16; i++) {
      const px = rand(0, s), py = rand(0, s);
      const g = x.createLinearGradient(px, py, px + rand(-6, 6), py + rand(24, 70));
      g.addColorStop(0, `rgba(45,28,18,${rand(0.1, 0.36)})`); g.addColorStop(1, 'rgba(45,28,18,0)');
      x.fillStyle = g; x.fillRect(px, py, rand(2, 9), rand(20, 70));
    }
    if (opts.tile) {
      x.strokeStyle = 'rgba(10,13,12,.5)'; x.lineWidth = 1;
      for (let y = 0; y < s; y += 32) for (let xx = 0; xx < s; xx += 32) x.strokeRect(xx, y, 32, 32);
    }
    if (accent) { x.fillStyle = accent; x.globalAlpha = 0.2; x.fillRect(0, s - 18, s, 4); x.globalAlpha = 1; }
  }, 256, 1.4, 1);
}
function makeMetalTex(key, base) {
  return canvasTexture(key, (x, s) => {
    noiseFill(x, s, base, 0.05);
    for (let i = 0; i < 170; i++) {
      x.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rand(0.015, 0.07)})`;
      x.beginPath(); x.moveTo(rand(0, s), rand(0, s)); x.lineTo(rand(0, s), rand(0, s)); x.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const g = x.createRadialGradient(rand(0, s), rand(0, s), 1, rand(0, s), rand(0, s), rand(4, 18));
      g.addColorStop(0, 'rgba(66,35,19,.4)'); g.addColorStop(1, 'rgba(66,35,19,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    }
  }, 256, 1, 1);
}
function makeConcreteTex(key, base) {
  return canvasTexture(key, (x, s) => {
    noiseFill(x, s, base, 0.12);
    for (let i = 0; i < 22; i++) {
      x.strokeStyle = `rgba(0,0,0,${rand(0.1, 0.3)})`; x.lineWidth = rand(0.5, 1.4);
      let px = rand(0, s), py = rand(0, s); x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 4; j++) { px += rand(-16, 16); py += rand(8, 20); x.lineTo(px, py); } x.stroke();
    }
  }, 256, 2, 2);
}
function makeHazardTex() {
  return canvasTexture('hazard', (x, s) => {
    x.fillStyle = '#2b291f'; x.fillRect(0, 0, s, s);
    x.save(); x.translate(s / 2, s / 2); x.rotate(-Math.PI / 4);
    for (let i = -s; i < s; i += 38) { x.fillStyle = '#b18a35'; x.fillRect(i, -s, 18, s * 2); }
    x.restore();
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${rand(0.02, 0.18)})`; x.fillRect(rand(0, s), rand(0, s), rand(1, 6), rand(1, 4)); }
  }, 128, 3, 1);
}
function makeBloodTex(key = 'blood', dark = false) {
  return canvasTexture(key, (x, s) => {
    x.clearRect(0, 0, s, s);
    const g = x.createRadialGradient(s * 0.5, s * 0.46, 2, s * 0.5, s * 0.5, s * 0.48);
    g.addColorStop(0, dark ? 'rgba(55,5,5,.92)' : 'rgba(104,10,8,.9)');
    g.addColorStop(0.38, dark ? 'rgba(48,4,4,.72)' : 'rgba(82,7,6,.68)');
    g.addColorStop(1, 'rgba(35,3,3,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 30; i++) {
      const px = rand(s * 0.2, s * 0.8), py = rand(s * 0.2, s * 0.8);
      x.fillStyle = `rgba(${dark ? '54,4,4' : '96,8,7'},${rand(0.18, 0.55)})`;
      x.beginPath(); x.ellipse(px, py, rand(2, 14), rand(3, 26), rand(-0.5, 0.5), 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < 12; i++) {
      const px = rand(s * 0.35, s * 0.65), py = rand(s * 0.4, s * 0.7);
      x.fillStyle = `rgba(${dark ? '55,5,5' : '112,10,8'},${rand(0.2, 0.6)})`;
      x.beginPath(); x.arc(px, py, rand(1.5, 5), 0, Math.PI * 2); x.fill();
    }
  }, 256, 1, 1);
}
function makeBumpTex() {
  return canvasTexture('bump', (x, s) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < s * s * 0.15; i++) {
      const v = Math.floor(rand(64, 192)); x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(rand(0, s), rand(0, s), rand(1, 3), rand(1, 3));
    }
  }, 256, 2, 2);
}
function makeLabelTexture(text, opts = {}) {
  const w = opts.w || 512, h = opts.h || 128;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = opts.bg || 'rgba(12,16,13,.92)'; x.fillRect(0, 0, w, h);
  if (opts.border !== false) { x.strokeStyle = opts.borderColor || '#7f7a63'; x.lineWidth = 3; x.strokeRect(5, 5, w - 10, h - 10); }
  x.font = `bold ${opts.font || 34}px monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = opts.color || '#cfcab5';
  x.fillText(text, w / 2, h / 2 + (opts.dy || 0));
  if (opts.sub) {
    x.font = `${opts.subFont || 18}px monospace`; x.fillStyle = opts.subColor || '#8d8c7c';
    x.fillText(opts.sub, w / 2, h * 0.78);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

/* ── Materials ───────────────────────────────────────────────────────────── */
const BUMP = makeBumpTex();
const TEX = {
  floorSecurity: makeFloorTex('floorSecurity', '#3b3a34', 'rgba(14,15,13,.55)', '#6a4a31'),
  floorMedical: makeFloorTex('floorMedical', '#33362f', 'rgba(12,14,12,.58)', '#557d7b'),
  floorLabs: makeFloorTex('floorLabs', '#30383a', 'rgba(10,14,15,.6)', '#4e7f8d'),
  floorReactor: makeFloorTex('floorReactor', '#392d2a', 'rgba(13,10,9,.6)', '#8a4f35'),
  floorLift: makeFloorTex('floorLift', '#343733', 'rgba(12,14,12,.6)', '#6d7d6a'),
  wallSecurity: makeWallTex('wallSecurity', '#4a493f', '#6c5638'),
  wallMedical: makeWallTex('wallMedical', '#4b4a40', '#4f6c6a', { tile: true }),
  wallLabs: makeWallTex('wallLabs', '#3e4949', '#4a7781', { tile: true }),
  wallReactor: makeWallTex('wallReactor', '#4e403c', '#8e5b3d'),
  wallLift: makeWallTex('wallLift', '#42453f', '#62745f'),
  ceiling: makeConcreteTex('ceiling', '#22261f'),
  metal: makeMetalTex('metal', '#4d554f'),
  darkMetal: makeMetalTex('darkMetal', '#2c322e'),
  rust: makeMetalTex('rust', '#54382b'),
  porcelain: canvasTexture('porcelain', (x, s) => { noiseFill(x, s, '#b8b6a5', 0.035); }, 256, 2, 2),
  fabric: canvasTexture('fabric', (x, s) => {
    noiseFill(x, s, '#5b6057', 0.06);
    x.strokeStyle = 'rgba(0,0,0,.13)'; x.lineWidth = 1;
    for (let i = 0; i < s; i += 5) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke(); }
  }, 256, 2, 2),
  rubber: canvasTexture('rubber', (x, s) => { noiseFill(x, s, '#171b18', 0.05); }, 128, 2, 2),
  hazard: makeHazardTex(),
  blood: makeBloodTex('blood'),
  bloodDark: makeBloodTex('bloodDark', true),
  glass: canvasTexture('glass', (x, s) => {
    x.clearRect(0, 0, s, s);
    const g = x.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, 'rgba(170,210,205,.3)'); g.addColorStop(.5, 'rgba(90,130,125,.06)'); g.addColorStop(1, 'rgba(210,230,220,.22)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(220,240,235,.35)'; x.lineWidth = 2;
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(rand(0, s), 0); x.lineTo(rand(0, s), s); x.stroke(); }
  }, 256, 1, 1),
};
const M = {
  floorSecurity: new THREE.MeshStandardMaterial({ map: TEX.floorSecurity, bumpMap: BUMP, bumpScale: 0.018, roughness: 0.93, metalness: 0.02 }),
  floorMedical: new THREE.MeshStandardMaterial({ map: TEX.floorMedical, bumpMap: BUMP, bumpScale: 0.018, roughness: 0.9, metalness: 0.02 }),
  floorLabs: new THREE.MeshStandardMaterial({ map: TEX.floorLabs, bumpMap: BUMP, bumpScale: 0.018, roughness: 0.78, metalness: 0.04 }),
  floorReactor: new THREE.MeshStandardMaterial({ map: TEX.floorReactor, bumpMap: BUMP, bumpScale: 0.018, roughness: 0.92, metalness: 0.03 }),
  floorLift: new THREE.MeshStandardMaterial({ map: TEX.floorLift, bumpMap: BUMP, bumpScale: 0.018, roughness: 0.9, metalness: 0.02 }),
  wallSecurity: new THREE.MeshStandardMaterial({ map: TEX.wallSecurity, bumpMap: BUMP, bumpScale: 0.026, roughness: 0.96, metalness: 0.0 }),
  wallMedical: new THREE.MeshStandardMaterial({ map: TEX.wallMedical, bumpMap: BUMP, bumpScale: 0.026, roughness: 0.92, metalness: 0.0 }),
  wallLabs: new THREE.MeshStandardMaterial({ map: TEX.wallLabs, bumpMap: BUMP, bumpScale: 0.026, roughness: 0.76, metalness: 0.02 }),
  wallReactor: new THREE.MeshStandardMaterial({ map: TEX.wallReactor, bumpMap: BUMP, bumpScale: 0.026, roughness: 0.95, metalness: 0.0 }),
  wallLift: new THREE.MeshStandardMaterial({ map: TEX.wallLift, bumpMap: BUMP, bumpScale: 0.026, roughness: 0.94, metalness: 0.0 }),
  ceiling: new THREE.MeshStandardMaterial({ map: TEX.ceiling, bumpMap: BUMP, bumpScale: 0.02, roughness: 1 }),
  metal: new THREE.MeshStandardMaterial({ map: TEX.metal, bumpMap: BUMP, bumpScale: 0.01, roughness: 0.52, metalness: 0.68 }),
  darkMetal: new THREE.MeshStandardMaterial({ map: TEX.darkMetal, roughness: 0.6, metalness: 0.55 }),
  rust: new THREE.MeshStandardMaterial({ map: TEX.rust, roughness: 0.88, metalness: 0.25 }),
  porcelain: new THREE.MeshStandardMaterial({ map: TEX.porcelain, bumpMap: BUMP, bumpScale: 0.008, roughness: 0.58, metalness: 0.02 }),
  fabric: new THREE.MeshStandardMaterial({ map: TEX.fabric, roughness: 1 }),
  rubber: new THREE.MeshStandardMaterial({ map: TEX.rubber, roughness: 0.95 }),
  hazard: new THREE.MeshStandardMaterial({ map: TEX.hazard, roughness: 0.78, metalness: 0.16 }),
  glass: new THREE.MeshPhysicalMaterial({ map: TEX.glass, color: 0x9fc2bf, transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  blood: new THREE.MeshStandardMaterial({ map: TEX.blood, transparent: true, roughness: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  bloodDark: new THREE.MeshStandardMaterial({ map: TEX.bloodDark, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  bone: new THREE.MeshStandardMaterial({ color: 0x8c9184, roughness: 0.66, emissive: 0x141a15, emissiveIntensity: 0.5 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x171b18, roughness: 0.94 }),
  skinPale: new THREE.MeshStandardMaterial({ color: 0x5d5b50, roughness: 0.82 }),
  emissiveRed: new THREE.MeshBasicMaterial({ color: 0xa72c20 }),
  emissiveGreen: new THREE.MeshBasicMaterial({ color: 0x74a77a }),
  emissiveAmber: new THREE.MeshBasicMaterial({ color: 0xd69a55 }),
  emissiveWhite: new THREE.MeshBasicMaterial({ color: 0xc8c2a8 }),
  black: new THREE.MeshStandardMaterial({ color: 0x070a08, roughness: 1 }),
  suit: new THREE.MeshStandardMaterial({ color: 0x5c665b, roughness: 0.9 }),
  visor: new THREE.MeshStandardMaterial({ color: 0x1c2521, roughness: 0.3, metalness: 0.35, emissive: 0x1b2a22, emissiveIntensity: 0.8 }),
};

/* ── Geometry helpers ────────────────────────────────────────────────────── */
const shadowOn = () => game.quality === 'high';
function meshBox(parent, x, y, z, w, h, d, material, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  if (opts.rot) m.rotation.set(opts.rot[0] || 0, opts.rot[1] || 0, opts.rot[2] || 0);
  m.castShadow = opts.cast !== false && shadowOn();
  m.receiveShadow = opts.receive !== false;
  parent.add(m);
  return m;
}
function meshCyl(parent, x, y, z, rt, rb, h, material, seg = 12, opts = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  if (opts.rot) m.rotation.set(opts.rot[0] || 0, opts.rot[1] || 0, opts.rot[2] || 0);
  m.castShadow = opts.cast !== false && shadowOn();
  m.receiveShadow = opts.receive !== false;
  parent.add(m);
  return m;
}
function meshSphere(parent, x, y, z, r, material, opts = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, opts.seg || 12, opts.seg2 || 10), material);
  m.position.set(x, y, z);
  if (opts.scale) m.scale.set(...opts.scale);
  m.castShadow = opts.cast !== false && shadowOn();
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function addCollider(cx, cz, w, d, h = 4.2, tag = '') {
  const c = { x: cx, z: cz, w, d, h, tag, disabled: false };
  colliders.push(c);
  return c;
}
const LIGHT_SCALE = 16;
const FLASH_I = 115;
const FILL_I = 3.2;
function addLight(x, y, z, color, intensity, distance = 16, decay = 1.7, flicker = false) {
  intensity *= LIGHT_SCALE;
  const l = new THREE.PointLight(color, intensity, distance, decay);
  l.position.set(x, y, z);
  l.castShadow = false;
  scene.add(l);
  if (flicker) flickers.push({ light: l, base: intensity, phase: rand(0, 9), red: color === 0xc0392b });
  dynamicLights.push(l);
  return l;
}
function addLabel(parent, text, x, y, z, opts = {}) {
  const tex = makeLabelTexture(text, opts);
  const w = opts.w || 2.2, h = opts.h || 0.55;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  if (opts.rotation) m.rotation.set(opts.rotation[0] || 0, opts.rotation[1] || 0, opts.rotation[2] || 0);
  parent.add(m);
  return m;
}
function addBlood(x, z, scale = 1, rot = 0, dark = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1 * scale, 1.55 * scale), dark ? M.bloodDark : M.blood);
  m.rotation.x = -Math.PI / 2; m.rotation.z = rot;
  m.position.set(x, 0.013, z);
  world.add(m); bloodDecals.push(m);
  return m;
}
function addDebris(x, z, count = 4) {
  for (let i = 0; i < count; i++) {
    const w = rand(0.04, 0.34), h = rand(0.02, 0.1), d = rand(0.05, 0.4);
    const mat = pick([M.metal, M.rubber, M.rust, M.porcelain]);
    const m = meshBox(world, x + rand(-1.1, 1.1), h / 2, z + rand(-1.1, 1.1), w, h, d, mat, { cast: false });
    m.rotation.y = rand(0, Math.PI);
    m.rotation.x = rand(-0.2, 0.2);
  }
}
function addDust(count = 420) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(-5.6, 5.6); pos[i * 3 + 1] = rand(0.2, 4.1); pos[i * 3 + 2] = rand(-89, 6);
    speeds[i] = rand(0.015, 0.1);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xc8c3ad, size: 0.022, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  world.add(points);
  particles.push({ points, speeds, type: 'dust' });
}
function addSteam(x, y, z, count = 26, color = 0x8b948a) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = x + rand(-0.5, 0.5); pos[i * 3 + 1] = y + rand(-0.3, 0.4); pos[i * 3 + 2] = z + rand(-0.5, 0.5);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.5, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  world.add(points);
  particles.push({ points, speeds: new Float32Array(count).map(() => rand(0.15, 0.5)), type: 'steam', base: pos.slice(), x, y, z });
}
function addPipe(x, y, z, length, axis = 'z', material = M.rust, r = 0.09) {
  const m = meshCyl(world, x, y, z, r, r, length, material, 10);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  return m;
}

/* ── Prop builders ───────────────────────────────────────────────────────── */
function makeBed(x, z, dirty = false) {
  meshBox(world, x, 0.36, z, 2.35, 0.12, 1.15, M.metal);
  meshBox(world, x, 0.55, z, 2.16, 0.22, 1.02, M.porcelain);
  meshBox(world, x, 0.92, z, 1.98, 0.42, 0.88, dirty ? M.fabric : M.porcelain);
  meshBox(world, x, 1.22, z + 0.34, 0.38, 0.12, 0.34, dirty ? M.rust : M.porcelain);
  for (const dx of [-1, 1]) for (const dz of [-0.4, 0.4]) meshCyl(world, x + dx, 0.16, z + dz, 0.035, 0.035, 0.3, M.metal, 6);
  meshBox(world, x, 0.95, z - 0.46, 2.0, 0.08, 0.08, M.metal, { cast: false });
  if (dirty) { addBlood(x + 0.2, z, 0.55, rand(0, 3)); meshBox(world, x + 0.5, 1.05, z, 0.5, 0.04, 0.5, M.fabric, { cast: false }); }
  addCollider(x, z, 2.4, 1.2, 1.2, 'bed');
}
function makeGurney(x, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; world.add(g);
  meshBox(g, 0, 0.74, 0, 1.65, 0.09, 0.72, M.metal);
  meshBox(g, 0, 0.83, 0, 1.45, 0.1, 0.6, M.porcelain);
  for (const dx of [-0.66, 0.66]) for (const dz of [-0.27, 0.27]) meshCyl(g, dx, 0.34, dz, 0.035, 0.035, 0.55, M.metal, 6);
  for (const dx of [-0.66, 0.66]) for (const dz of [-0.27, 0.27]) meshCyl(g, dx, 0.1, dz, 0.075, 0.075, 0.07, M.rubber, 8, { rot: [Math.PI / 2, 0, 0] });
  meshBox(g, 0.55, 0.93, 0, 0.3, 0.05, 0.4, M.fabric, { cast: false });
  addCollider(x, z, 1.7, 0.8, 1.0, 'gurney');
}
function makeCabinet(x, z, rot = 0, tall = 2.0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; world.add(g);
  meshBox(g, 0, tall / 2, 0, 1.05, tall, 0.46, M.metal);
  meshBox(g, 0, tall * 0.5, 0.24, 0.92, tall * 0.86, 0.02, M.darkMetal, { cast: false });
  for (let i = 0; i < 3; i++) meshBox(g, 0, tall * 0.22 + i * tall * 0.26, 0.26, 0.75, 0.03, 0.03, M.rust, { cast: false });
  addCollider(x, z, rot % Math.PI ? 0.5 : 1.1, rot % Math.PI ? 1.1 : 0.5, tall, 'cabinet');
}
function makeTerminal(x, z, rot = 0, screen = 0x4b8c82) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; world.add(g);
  meshBox(g, 0, 0.86, 0, 1.15, 0.08, 0.65, M.metal);
  meshBox(g, 0, 0.44, 0, 0.9, 0.78, 0.5, M.darkMetal);
  meshBox(g, 0, 1.18, -0.16, 0.68, 0.5, 0.07, M.black);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), new THREE.MeshBasicMaterial({ color: screen }));
  scr.position.set(0, 1.18, -0.12); g.add(scr);
  meshBox(g, 0, 0.94, 0.02, 0.9, 0.03, 0.35, M.black, { cast: false });
  addCollider(x, z, 1.2, 0.75, 1.5, 'terminal');
}
function makeTank(x, z, color = 0x3d8b74, r = 0.52, h = 2.1) {
  meshCyl(world, x, h / 2, z, r, r, h, M.glass, 18, { cast: false });
  meshCyl(world, x, 0.12, z, r + 0.08, r + 0.08, 0.22, M.metal, 18);
  meshCyl(world, x, h + 0.12, z, r + 0.08, r + 0.08, 0.2, M.metal, 18);
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.03, r - 0.03, h * 0.72, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, transparent: true, opacity: 0.5, roughness: 0.2 }));
  fluid.position.set(x, h * 0.39, z); world.add(fluid);
  meshSphere(world, x, h * 0.62, z, 0.1, M.bone, { cast: false });
  meshBox(world, x, h * 0.35, z, 0.16, 0.4, 0.14, M.bone, { cast: false });
  addCollider(x, z, r * 2, r * 2, h, 'tank');
}
function makeCrate(x, z, s = 0.7, rot = 0) {
  meshBox(world, x, s / 2, z, s, s, s, M.rust, { rot: [0, rot, 0] });
  meshBox(world, x, s * 0.82, z, s * 0.86, 0.03, s * 0.86, M.metal, { rot: [0, rot, 0], cast: false });
  addCollider(x, z, s, s, s, 'crate');
}
function makeBarrel(x, z, h = 0.95) {
  meshCyl(world, x, h / 2, z, 0.31, 0.33, h, M.rust, 14);
  for (const y of [h * 0.25, h * 0.75]) meshCyl(world, x, y, z, 0.335, 0.335, 0.035, M.metal, 14, { cast: false });
  addCollider(x, z, 0.66, 0.66, h, 'barrel');
}
function makeChair(x, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; world.add(g);
  meshBox(g, 0, 0.48, 0, 0.48, 0.06, 0.48, M.metal);
  meshBox(g, 0, 0.83, -0.22, 0.46, 0.62, 0.05, M.fabric);
  for (const dx of [-0.2, 0.2]) for (const dz of [-0.2, 0.2]) meshCyl(g, dx, 0.24, dz, 0.025, 0.025, 0.48, M.metal, 5);
  addCollider(x, z, 0.55, 0.55, 1.0, 'chair');
}
function makeWheelchair(x, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; world.add(g);
  meshBox(g, 0, 0.52, 0, 0.52, 0.06, 0.48, M.fabric);
  meshBox(g, 0, 0.85, -0.2, 0.5, 0.62, 0.06, M.fabric);
  for (const dx of [-0.3, 0.3]) {
    meshCyl(g, dx, 0.31, 0.06, 0.29, 0.29, 0.05, M.rubber, 18, { rot: [0, 0, Math.PI / 2] });
    meshCyl(g, dx, 0.18, -0.42, 0.08, 0.08, 0.05, M.rubber, 8, { rot: [0, 0, Math.PI / 2] });
  }
  addCollider(x, z, 0.7, 0.7, 1.0, 'wheelchair');
}
function makeIV(x, z) {
  meshCyl(world, x, 0.95, z, 0.022, 0.022, 1.9, M.metal, 6);
  for (let i = 0; i < 3; i++) meshCyl(world, x, 0.04, z, 0.2, 0.2, 0.03, M.metal, 8);
  meshBox(world, x + 0.14, 1.6, z, 0.12, 0.28, 0.1, M.glass, { cast: false });
  addCollider(x, z, 0.25, 0.25, 1.8, 'iv');
}
function makeJar(x, y, z, color = 0x7d9a6f, r = 0.09) {
  meshCyl(world, x, y, z, r, r, r * 2.6, M.glass, 10, { cast: false });
  meshCyl(world, x, y - r * 0.3, z, r * 0.8, r * 0.8, r * 1.2, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.7, roughness: 0.4 }), 8, { cast: false });
  meshCyl(world, x, y + r * 1.5, z, r * 1.1, r * 1.1, 0.03, M.metal, 8, { cast: false });
}
function makeShelf(x, z, rot = 0, h = 2.2) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; world.add(g);
  for (const dx of [-0.9, 0.9]) for (const dz of [-0.25, 0.25]) meshBox(g, dx, h / 2, dz, 0.05, h, 0.05, M.metal);
  for (let i = 0; i < 4; i++) meshBox(g, 0, 0.25 + i * 0.58, 0, 1.9, 0.04, 0.55, M.metal);
  for (let i = 0; i < 5; i++) makeJar(x + rand(-0.7, 0.7), 0.42 + Math.floor(rand(0, 3)) * 0.58, z, pick([0x7d9a6f, 0x8c6d58, 0x6e7f8c]), rand(0.06, 0.11));
  addCollider(x, z, 2.0, 0.65, h, 'shelf');
}
function makeConsole(x, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; world.add(g);
  meshBox(g, 0, 0.92, 0, 1.7, 0.12, 0.8, M.darkMetal);
  meshBox(g, 0, 0.46, 0, 1.4, 0.9, 0.65, M.metal);
  for (let i = 0; i < 5; i++) meshBox(g, -0.6 + i * 0.3, 1.02, -0.1, 0.12, 0.05, 0.12, pick([M.emissiveRed, M.emissiveGreen, M.emissiveAmber]), { cast: false });
  addCollider(x, z, 1.75, 0.85, 1.2, 'console');
}

/* ── Facility layout ─────────────────────────────────────────────────────── */
const ZONES = [
  { id: 'security', z: 0, len: 14, floor: M.floorSecurity, wall: M.wallSecurity, light: 0xffc27a, intensity: 0.95, fixture: M.emissiveAmber },
  { id: 'medical', z: -17, len: 20, floor: M.floorMedical, wall: M.wallMedical, light: 0xa9beb2, intensity: 0.72, fixture: M.emissiveWhite },
  { id: 'labs', z: -37.5, len: 21, floor: M.floorLabs, wall: M.wallLabs, light: 0x91bdc8, intensity: 0.7, fixture: M.emissiveWhite },
  { id: 'reactor', z: -60, len: 24, floor: M.floorReactor, wall: M.wallReactor, light: 0xd08b64, intensity: 0.58, fixture: M.emissiveAmber },
  { id: 'lift', z: -81, len: 18, floor: M.floorLift, wall: M.wallLift, light: 0x9cad9f, intensity: 0.7, fixture: M.emissiveWhite },
];

function clearWorld() {
  for (const l of dynamicLights) { if (l.parent) l.parent.remove(l); }
  dynamicLights.length = 0; flickers.length = 0; particles.length = 0;
  colliders.length = 0; interactables.length = 0; doors.length = 0; keyMeshes.length = 0; bloodDecals.length = 0; glassPanes.length = 0;
  world.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  world.clear();
  if (monster && monster.parent) monster.parent.remove(monster);
  monster = null; monsterLight = null;
  bots.length = 0;
  // Remove any old dynamic camera lights except the player's gear.
  scene.children.filter(o => o.userData && o.userData.dynamicLight).forEach(o => scene.remove(o));
  scene.children.filter(o => o.userData && o.userData.dynamicProp).forEach(o => scene.remove(o));
}

function buildWorld() {
  clearWorld();
  // continuous shell ---------------------------------------------------------
  for (const zone of ZONES) {
    const len = zone.len;
    const floor = meshBox(world, 0, -0.18, zone.z, 12, 0.36, len + 0.35, zone.floor, { receive: true, cast: false });
    floor.receiveShadow = true;
    meshBox(world, 0, 4.28, zone.z, 12.2, 0.3, len + 0.2, M.ceiling, { cast: false });
    for (const side of [-1, 1]) {
      const wall = meshBox(world, side * 6.0, 2.1, zone.z, 0.3, 4.3, len, zone.wall);
      addCollider(side * 6.0, zone.z, 0.3, len, 4.3, 'wall');
    }
    // floor seams
    for (let z = zone.z - len / 2 + 1; z < zone.z + len / 2; z += 2) {
      meshBox(world, 0, 0.002, z, 11.4, 0.015, 0.025, M.black, { cast: false, receive: false });
    }
    // ceiling fixtures
    for (let z = zone.z - len / 2 + 3; z < zone.z + len / 2; z += 5) {
      meshBox(world, 0, 4.14, z, 1.35, 0.09, 0.5, M.metal, { cast: false });
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), zone.fixture);
      lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 4.085, z); world.add(lamp);
      if (Math.abs(z - (zone.z - len / 2 + 3)) < 0.1) {
        addLight(0, 3.86, z, zone.light, zone.intensity, 18, 1.8, zone.id !== 'security');
      }
    }
    // wall conduit / supports
    for (const side of [-1, 1]) {
      meshBox(world, side * 5.72, 2.72, zone.z, 0.09, 0.09, len - 0.5, M.metal, { cast: false });
      for (let z = zone.z - len / 2 + 1.2; z < zone.z + len / 2; z += 4.2) {
        meshBox(world, side * 5.78, 1.65, z, 0.12, 3.1, 0.12, M.metal, { cast: false });
        meshBox(world, side * 5.78, 3.35, z, 0.26, 0.12, 0.26, M.rust, { cast: false });
      }
    }
    // emergency beacon
    if (zone.id !== 'security') {
      const bx = 5.55, bz = zone.z - len / 2 + 1.3;
      meshBox(world, bx, 3.85, bz, 0.18, 0.28, 0.12, M.emissiveRed, { cast: false });
      const beacon = addLight(bx - 0.2, 3.75, bz, 0xc0392b, 0.4, 7, 2, true);
      beacon.userData.dynamicLight = true;
    }
  }
  // partitions at sector thresholds -----------------------------------------
  const thresholds = [-7, -27, -48, -72];
  thresholds.forEach((z, i) => {
    const wall = [M.wallSecurity, M.wallMedical, M.wallLabs, M.wallReactor][i];
    for (const side of [-1, 1]) {
      meshBox(world, side * 3.85, 2.1, z, 4.3, 4.3, 0.3, wall);
      addCollider(side * 3.85, z, 4.3, 0.3, 4.3, 'partition');
    }
    meshBox(world, 0, 3.92, z, 3.4, 0.76, 0.3, wall, { cast: false });
    meshBox(world, 0, 3.52, z, 3.5, 0.1, 0.34, M.metal, { cast: false });
    // threshold floor plate
    meshBox(world, 0, 0.012, z, 3.4, 0.024, 0.9, M.metal, { cast: false, receive: false });
    for (const side of [-1, 1]) meshBox(world, side * 1.78, 1.8, z, 0.2, 3.3, 0.34, M.metal, { cast: false });
  });
  // end walls
  meshBox(world, 0, 2.1, 7.1, 12.2, 4.3, 0.3, M.wallSecurity);
  addCollider(0, 7.1, 12.2, 0.3, 4.3, 'endwall');
  meshBox(world, 0, 2.1, -90.1, 12.2, 4.3, 0.3, M.wallLift);
  addCollider(0, -90.1, 12.2, 0.3, 4.3, 'endwall');

  buildSecurity();
  buildMedical();
  buildLabs();
  buildReactor();
  buildLift();
  buildDoors();
  addDust(480);
  buildMonster();
  setupBots();
  updateObjectives(true);
  applyLiftState();
}

/* ── Sector 01: security office ──────────────────────────────────────────── */
function buildSecurity() {
  // desk
  meshBox(world, 0, 0.8, 4.5, 3.4, 0.15, 1.5, M.rust);
  for (const x of [-1.45, 1.45]) for (const z of [3.95, 5.05]) meshBox(world, x, 0.4, z, 0.12, 0.8, 0.12, M.darkMetal);
  meshBox(world, 0, 0.95, 4.32, 1.15, 0.04, 0.7, M.fabric, { cast: false });
  // desk lamp
  meshCyl(world, 0.95, 1.12, 4.32, 0.08, 0.13, 0.24, M.metal, 12);
  meshCyl(world, 0.95, 1.29, 4.32, 0.18, 0.09, 0.1, new THREE.MeshStandardMaterial({ color: 0xbda16b, emissive: 0xe98e34, emissiveIntensity: 1.3 }), 12);
  deskLamp = addLight(0.95, 1.45, 4.32, 0xffb762, 2.2, 7, 1.8, true);
  // chair
  makeChair(0, 3.2, Math.PI);
  // cassette recorder
  meshBox(world, 0.62, 1.04, 4.18, 0.42, 0.12, 0.28, M.darkMetal);
  meshBox(world, 0.62, 1.11, 4.18, 0.28, 0.02, 0.16, M.black, { cast: false });
  meshCyl(world, 0.52, 1.12, 4.18, 0.035, 0.035, 0.01, M.emissiveRed, 8, { cast: false });
  meshCyl(world, 0.72, 1.12, 4.18, 0.035, 0.035, 0.01, M.emissiveRed, 8, { cast: false });
  // bloodstained journal
  meshBox(world, -0.18, 1.06, 4.2, 0.5, 0.06, 0.34, M.rust, { rot: [0, 0.16, 0] });
  meshBox(world, -0.18, 1.095, 4.2, 0.42, 0.008, 0.28, M.porcelain, { rot: [0, 0.16, 0], cast: false });
  addBlood(0.15, 4.05, 0.34, 0.4, true);
  // flashlight
  const flashGroup = new THREE.Group(); flashGroup.position.set(-0.92, 1.12, 4.18); flashGroup.rotation.x = Math.PI / 2; world.add(flashGroup);
  meshCyl(flashGroup, 0, 0, 0, 0.055, 0.075, 0.5, M.darkMetal, 12);
  meshCyl(flashGroup, 0, -0.27, 0, 0.09, 0.09, 0.1, M.metal, 12);
  // radio
  meshBox(world, -0.5, 1.06, 4.32, 0.32, 0.15, 0.2, M.rubber);
  meshCyl(world, -0.5, 1.24, 4.32, 0.012, 0.012, 0.24, M.metal, 5, { cast: false });
  meshBox(world, -0.5, 1.12, 4.43, 0.1, 0.04, 0.02, M.emissiveGreen, { cast: false });
  // filing cabinets and board
  makeCabinet(-5.4, 2.8, Math.PI / 2, 1.5);
  makeCabinet(-5.4, 1.2, Math.PI / 2, 1.5);
  makeCabinet(5.35, 5.5, -Math.PI / 2, 1.8);
  meshBox(world, 5.78, 2.35, 2.8, 0.05, 1.25, 2.2, M.rust, { cast: false });
  addLabel(world, 'INCIDENT 04—17', 5.72, 3.05, 2.8, { w: 1.7, h: 0.4, rotation: [0, -Math.PI / 2, 0], font: 28 });
  addLabel(world, 'NORTHSTAR BIOMETRICS', 0, 3.7, 6.94, { w: 3.4, h: 0.5, rotation: [0, Math.PI, 0], font: 27 });
  // security control panel by the exit
  meshBox(world, 2.7, 1.35, -6.35, 0.4, 1.0, 0.18, M.metal);
  meshBox(world, 2.7, 1.62, -6.24, 0.14, 0.14, 0.03, M.emissiveRed, { cast: false });
  addLabel(world, 'LOCKDOWN', 2.7, 2.15, -6.22, { w: 1.2, h: 0.3, font: 26 });
  addBlood(-2.1, 0.8, 0.9, 0.5);
  addBlood(1.4, -3.9, 0.7, 2.1);
  addDebris(0, 1.2, 5);
  makeShelf(-5.5, -4.8, Math.PI / 2, 1.7);
  // small battery on the desk
  addBatteryPickup(1.55, 1.02, 4.15);

  addInteract(0.62, 1.1, 4.18, 2.4, () => tr('Kassette abspielen', 'Play cassette'), () => playCassette(), { kind: 'story', icon: '◉' });
  addInteract(-0.18, 1.1, 4.2, 2.4, () => tr('Blutiges Einsatzjournal lesen', 'Read bloodstained journal'), () => readJournal(), { kind: 'story' });
  // Flashlight and radio are issued at the start of the operation (see prepareRun).
  addInteract(2.7, 1.35, -6.35, 2.4, () => tr('Sicherheitstür entriegeln', 'Unlock security door'), () => unlockSecurity(), { kind: 'panel' });
}

/* ── Sector 02: medical ward ─────────────────────────────────────────────── */
function buildMedical() {
  for (let i = 0; i < 4; i++) {
    makeBed(-3.25, -11.5 - i * 3.8, i < 2);
    makeBed(3.25, -13.2 - i * 3.8, i === 1);
  }
  // privacy curtains
  for (let i = 0; i < 4; i++) {
    const z = -13.4 - i * 3.8;
    for (const x of [-1.6, 1.6]) {
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x6f7569, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.62 }));
      curtain.position.set(x, 2.2, z); curtain.rotation.y = Math.PI / 2; world.add(curtain);
      meshCyl(world, x, 3.32, z, 0.02, 0.02, 2.8, M.metal, 5, { cast: false, rot: [0, 0, Math.PI / 2] });
    }
  }
  makeGurney(0.2, -13.2, 0.1);
  makeGurney(-1.1, -24.3, -0.3);
  makeWheelchair(4.7, -22.4, -0.7);
  makeIV(-1.9, -12.3); makeIV(1.9, -16.2); makeIV(-1.9, -21.8);
  makeCabinet(5.35, -10.2, -Math.PI / 2, 1.8);
  makeCabinet(5.35, -24.2, -Math.PI / 2, 1.8);
  makeShelf(-5.45, -22.9, Math.PI / 2, 1.9);
  makeTerminal(4.8, -18.2, -Math.PI / 2, 0x4f8d7d);
  // treatment bay
  meshBox(world, -4.2, 0.62, -19.1, 0.7, 0.06, 0.5, M.metal, { cast: false });
  meshBox(world, -4.2, 0.75, -19.1, 0.46, 0.2, 0.34, M.porcelain);
  meshCyl(world, -4.2, 0.9, -19.1, 0.11, 0.14, 0.1, M.metal, 12);
  addBlood(-4.2, -19.1, 0.8, 0.4);
  addBlood(-3.4, -18.6, 0.45, 1.3);
  // medical keycard
  addKeycard(0, -4.2, 0.94, -19.1, 0x5fb7d8);
  // wall signage and emergency shower
  addLabel(world, 'TREATMENT 04', 5.78, 3.55, -18.2, { w: 2.2, h: 0.42, rotation: [0, -Math.PI / 2, 0], font: 25 });
  addLabel(world, 'BIOLOGY / RESTRICTED', -5.78, 3.55, -21.8, { w: 2.6, h: 0.42, rotation: [0, Math.PI / 2, 0], font: 22 });
  meshCyl(world, 5.55, 2.2, -25.2, 0.05, 0.05, 1.6, M.metal, 6);
  meshCyl(world, 5.25, 3.02, -25.2, 0.24, 0.18, 0.12, M.metal, 10, { rot: [0, 0, Math.PI / 2] });
  addBatteryPickup(-5.1, 1.02, -15.3);
  addDebris(-0.2, -20.6, 6);
  addInteract(0, 1.3, -27, 2.7, () => tr('MED-Karte scannen · Laborzugang', 'Scan MED card · laboratory access'), () => tryDoor('med'), { kind: 'door' });
}

/* ── Sector 03: research labs ────────────────────────────────────────────── */
function buildLabs() {
  for (let i = 0; i < 4; i++) {
    const z = -30.6 - i * 4.4;
    meshBox(world, -3.1, 0.8, z, 2.3, 0.12, 0.82, M.darkMetal);
    meshBox(world, -3.1, 1.5, z, 2.1, 0.04, 0.7, M.porcelain);
    for (const x of [-4.05, -2.15]) meshBox(world, x, 0.4, z, 0.1, 0.8, 0.7, M.metal);
    for (let n = 0; n < 3; n++) {
      meshCyl(world, -3.75 + n * 0.55, 1.74, z, 0.1, 0.1, 0.4, M.glass, 10, { cast: false });
      meshCyl(world, -3.75 + n * 0.55, 1.62, z, 0.08, 0.08, 0.18, new THREE.MeshStandardMaterial({ color: pick([0x5d8d75, 0x8d6d58, 0x587f8d]), emissive: 0x223d32, emissiveIntensity: 0.5, transparent: true, opacity: 0.75 }), 8, { cast: false });
    }
    addCollider(-3.1, z, 2.4, 0.9, 1.6, 'bench');
    makeChair(-3.1, z + 1.0, Math.PI);
  }
  // glass containment wall
  for (let z = -30.5; z > -46.5; z -= 2.2) {
    meshBox(world, 2.7, 1.7, z, 0.1, 3.2, 2.1, M.glass, { cast: false, receive: false });
    meshBox(world, 2.7, 0.12, z, 0.24, 0.24, 2.2, M.metal, { cast: false });
    meshBox(world, 2.7, 3.28, z, 0.24, 0.14, 2.2, M.metal, { cast: false });
    glassPanes.push(world.children[world.children.length - 1]);
  }
  addCollider(2.7, -38.5, 0.2, 16, 3.2, 'glass');
  for (let i = 0; i < 3; i++) makeTank(4.6, -31.8 - i * 4.2, [0x3d8b74, 0x8a6b4d, 0x4d7c8b][i], 0.58, 2.2);
  makeConsole(4.6, -45.4, Math.PI);
  makeTerminal(-5.0, -34.4, Math.PI / 2, 0x4b8c82);
  makeTerminal(-5.0, -41.4, Math.PI / 2, 0x7d8c4b);
  makeShelf(-5.45, -28.9, Math.PI / 2, 2.0);
  // sample vault with LAB card
  meshBox(world, 4.3, 0.85, -42.1, 1.35, 1.7, 0.9, M.metal);
  meshBox(world, 4.3, 1.72, -42.1, 1.2, 0.06, 0.8, M.porcelain, { cast: false });
  addLabel(world, 'SAMPLE VAULT', 4.3, 2.05, -41.64, { w: 1.7, h: 0.36, font: 22 });
  addKeycard(1, 4.3, 1.82, -42.1, 0xd8a24e);
  addBlood(0.3, -35.1, 1.0, 0.9);
  addBlood(-1.2, -44.6, 0.7, 2.6);
  addLabel(world, 'PROJECT NULL', 5.78, 3.6, -38.4, { w: 2.5, h: 0.45, rotation: [0, -Math.PI / 2, 0], font: 24, color: '#c7a27b' });
  addLabel(world, 'CONTAINMENT BREACH', -5.78, 3.6, -43.6, { w: 2.8, h: 0.45, rotation: [0, Math.PI / 2, 0], font: 20, color: '#c75f4a' });
  addBatteryPickup(-5.2, 1.02, -38.2);
  addDebris(0.4, -42.8, 7);
  addSteam(4.6, 2.6, -40.2, 22, 0x8aa6a0);
  addInteract(0, 1.3, -48, 2.7, () => tr('LAB-Karte scannen · Reaktorzugang', 'Scan LAB card · reactor access'), () => tryDoor('lab'), { kind: 'door' });
}

/* ── Sector 04: reactor ──────────────────────────────────────────────────── */
function buildReactor() {
  // cooling vessel
  meshCyl(world, 0, 2.15, -60, 2.35, 2.7, 4.3, M.metal, 28);
  meshCyl(world, 0, 4.38, -60, 2.52, 2.52, 0.22, M.darkMetal, 28);
  meshCyl(world, 0, 0.12, -60, 2.8, 2.7, 0.3, M.metal, 28);
  meshCyl(world, 0, 2.2, -60, 2.05, 2.05, 2.6, new THREE.MeshStandardMaterial({ color: 0x8c4a2e, emissive: 0xb4522a, emissiveIntensity: 0.75, transparent: true, opacity: 0.55, roughness: 0.3 }), 24, { cast: false });
  for (let i = 0; i < 14; i++) {
    const a = i * Math.PI / 7, x = Math.cos(a) * 2.55, z = -60 + Math.sin(a) * 2.55;
    meshBox(world, x, 2.15, z, 0.12, 3.9, 0.14, M.steel || M.metal);
  }
  addCollider(0, -60, 5.1, 5.1, 4.4, 'reactor');
  // catwalk and railings
  for (let i = 0; i < 4; i++) meshBox(world, -4.55, 0.1 + i * 0.8, -56.4, 0.5, 0.08, 5.6, M.metal, { cast: false });
  for (const z of [-53.7, -59.1]) {
    meshCyl(world, -4.55, 0.65, z, 0.04, 0.04, 1.2, M.metal, 6);
    meshCyl(world, -4.55, 1.25, z, 0.04, 0.04, 0.04, M.metal, 6, { rot: [0, 0, Math.PI / 2] });
  }
  // generator and breakers
  meshBox(world, 4.3, 1.25, -64.4, 1.35, 2.5, 1.25, M.metal);
  meshBox(world, 4.3, 1.3, -63.74, 0.9, 0.75, 0.04, M.black, { cast: false });
  for (let i = 0; i < 3; i++) meshBox(world, 4.0 + i * 0.3, 1.35, -63.7, 0.13, 0.13, 0.03, i < game.keys.filter(Boolean).length ? M.emissiveGreen : M.emissiveRed, { cast: false });
  addLabel(world, 'MAIN POWER', 4.3, 2.85, -63.72, { w: 1.7, h: 0.38, font: 23 });
  // breaker cabinets
  for (const [i, x] of [[0, -4.3], [1, 4.3]]) {
    meshBox(world, x, 1.35, -67.2, 1.0, 1.7, 0.5, M.metal);
    meshBox(world, x, 1.35, -66.92, 0.8, 1.5, 0.04, M.darkMetal, { cast: false });
    meshBox(world, x, 1.55, -66.88, 0.16, 0.42, 0.06, i === 0 ? M.emissiveRed : M.emissiveAmber, { cast: false });
    addLabel(world, i === 0 ? 'BREAKER A' : 'BREAKER B', x, 2.42, -66.9, { w: 1.3, h: 0.3, font: 20 });
  }
  // reactor control desk with REACTOR card
  makeConsole(-4.3, -57.2, Math.PI / 2);
  addKeycard(2, -4.3, 1.08, -57.2, 0xd9665c);
  makeTerminal(-4.9, -53.6, Math.PI / 2, 0x9d6b3f);
  makeCabinet(5.35, -58.2, -Math.PI / 2, 1.8);
  makeBarrel(2.9, -69.4); makeBarrel(3.5, -69.9); makeCrate(-5.2, -68.4, 0.8, 0.4);
  // hazard markings and signs
  for (const z of [-50.2, -70.2]) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), M.hazard);
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, 0.02, z); world.add(stripe);
  }
  addLabel(world, 'REACTOR CORE', 0, 3.9, -50.3, { w: 2.6, h: 0.45, font: 26, color: '#d9a477' });
  addLabel(world, 'DANGER · HIGH VOLTAGE', 5.78, 3.55, -63.4, { w: 2.8, h: 0.42, rotation: [0, -Math.PI / 2, 0], font: 19, color: '#d66b50' });
  addBlood(-2.4, -55.2, 1.1, 1.2);
  addBlood(2.2, -66.3, 0.8, 0.2);
  addSteam(0, 3.2, -60, 40, 0x9c8f82);
  addSteam(-4.3, 1.5, -67.2, 18, 0x8b948a);
  addDebris(-1.8, -64.4, 6);
  addBatteryPickup(5.1, 1.02, -55.6);
  addInteract(-4.3, 1.35, -67.2, 2.2, () => tr('Brecher A einlegen', 'Engage breaker A'), () => engageBreaker(0), { kind: 'breaker', hold: 1.1 });
  addInteract(4.3, 1.35, -67.2, 2.2, () => tr('Brecher B einlegen', 'Engage breaker B'), () => engageBreaker(1), { kind: 'breaker', hold: 1.1 });
}

/* ── Sector 05: surface lift ─────────────────────────────────────────────── */
function buildLift() {
  // elevator frame and doors
  meshBox(world, 0, 2.05, -88.2, 5.2, 4.1, 0.4, M.darkMetal);
  meshBox(world, 0, 2.1, -87.94, 3.5, 3.35, 0.12, M.metal);
  for (const x of [-1.76, 1.76]) meshBox(world, x, 1.68, -87.7, 0.24, 3.36, 0.24, M.steel || M.metal);
  meshBox(world, 0, 3.62, -87.7, 3.9, 0.28, 0.3, M.metal);
  addLabel(world, 'SURFACE ACCESS', 0, 4.05, -87.6, { w: 3.0, h: 0.46, font: 25 });
  const liftDoorGroup = new THREE.Group(); liftDoorGroup.position.set(0, 0, -87.8); world.add(liftDoorGroup);
  const liftPanels = [];
  for (const side of [-1, 1]) {
    const p = meshBox(liftDoorGroup, side * 0.86, 1.62, 0, 1.68, 3.2, 0.14, M.metal);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 0.16), M.hazard);
    stripe.position.set(0, -1.32, 0.08); p.add(stripe); liftPanels.push(p);
  }
  const liftCollider = addCollider(0, -87.8, 3.5, 0.3, 3.4, 'liftdoor');
  doors.push({ id: 'surface', group: liftDoorGroup, panels: liftPanels, collider: liftCollider, open: 0, target: 0, axis: 'x', label: 'SURFACE ACCESS' });
  // control panel
  meshBox(world, 3.55, 1.35, -82.4, 0.32, 0.9, 0.2, M.metal);
  meshBox(world, 3.55, 1.62, -82.28, 0.13, 0.13, 0.03, M.emissiveRed, { cast: false });
  addLabel(world, 'LIFT CALL', 3.55, 2.1, -82.26, { w: 1.2, h: 0.3, font: 20 });
  liftLight = addLight(0, 3.7, -86.5, 0x9fb8a4, 1.1, 12, 1.6, false);
  // cargo and hazard markings
  makeCrate(-4.7, -80.8, 0.9, 0.2); makeCrate(-4.5, -79.6, 0.7, 1.1);
  makeCrate(4.8, -77.4, 0.8, 0.5); makeBarrel(-5.0, -75.4); makeBarrel(4.9, -86.2);
  for (const z of [-74.2, -85.8]) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.75), M.hazard);
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, 0.021, z); world.add(stripe);
  }
  addLabel(world, 'EVACUATION LIFT', 5.78, 3.5, -81.0, { w: 2.5, h: 0.42, rotation: [0, -Math.PI / 2, 0], font: 22 });
  addBlood(1.1, -84.2, 0.9, 2.2);
  addDebris(0, -84.4, 7);
  addInteract(3.55, 1.35, -82.4, 2.5, () => tr('Oberflächenaufzug rufen', 'Call surface elevator'), () => useLiftPanel(), { kind: 'lift' });
  addInteract(0, 1.4, -87.0, 3.2, () => tr('Aufzugskabine betreten', 'Board elevator car'), () => boardElevator(), { kind: 'lift' });
}

/* ── Doors ───────────────────────────────────────────────────────────────── */
function makeDoor(id, z, label, opts = {}) {
  const frameMat = M.metal;
  for (const side of [-1, 1]) {
    meshBox(world, side * 1.82, 1.8, z, 0.22, 3.6, 0.55, frameMat);
    meshBox(world, side * 1.82, 3.55, z, 0.5, 0.12, 0.7, M.rust, { cast: false });
  }
  meshBox(world, 0, 3.62, z, 3.9, 0.24, 0.55, frameMat);
  const group = new THREE.Group(); group.position.set(0, 0, z); world.add(group);
  const panels = [];
  const color = opts.color || 0x4a5048;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.55, map: TEX.metal });
  for (const side of [-1, 1]) {
    const p = meshBox(group, side * 0.84, 1.6, 0, 1.66, 3.2, 0.16, mat);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.14), M.hazard);
    stripe.position.set(0, -1.28, 0.09); p.add(stripe);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.3), opts.red ? M.emissiveRed : M.emissiveGreen);
    lamp.position.set(side * -0.55, 1.1, 0.09); p.add(lamp);
    panels.push(p);
  }
  const collider = addCollider(0, z, 3.3, 0.45, 3.3, 'door');
  const door = { id, group, panels, collider, open: 0, target: 0, axis: 'x', label };
  doors.push(door);
  addLabel(world, label, 0, 3.92, z + 0.34, { w: 2.8, h: 0.42, font: 23, color: '#cfc6ae' });
  return door;
}
function buildDoors() {
  makeDoor('security', -7, 'SECURITY / 01', { red: true });
  makeDoor('med', -27, 'MEDICAL → LABS', { color: 0x3f4a48 });
  makeDoor('lab', -48, 'LABS → REACTOR', { color: 0x374447 });
  makeDoor('reactor', -72, 'REACTOR → LIFT', { color: 0x41433c });
}
function doorById(id) { return doors.find(d => d.id === id); }
function openDoor(door, silent = false) {
  if (!door || door.target > 0) return;
  door.target = 1;
  door.collider.disabled = true;
  if (!silent) {
    AudioSys.tone(108, 0.4, 'sawtooth', 0.12);
    AudioSys.tone(64, 0.6, 'triangle', 0.1);
    AudioSys.noiseBurst(0.4, 0.05, 320, 'lowpass');
  }
}
function updateDoors(dt) {
  for (const door of doors) {
    if (door.open === door.target) continue;
    door.open = lerp(door.open, door.target, Math.min(1, dt * 4.5));
    const off = door.open * 1.56;
    door.panels[0].position.x = -0.84 - off;
    door.panels[1].position.x = 0.84 + off;
  }
}
function applyLiftState() {
  const lift = doorById('surface');
  if (!lift) return;
  if (game.escapeReady) openDoor(lift, true);
}

/* ── Keycards, batteries, and story props ───────────────────────────────── */
function addKeycard(index, x, y, z, color) {
  const group = new THREE.Group(); group.position.set(x, y, z); world.add(group);
  const card = meshBox(group, 0, 0, 0, 0.36, 0.022, 0.23, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.4 }), { cast: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -0.005; group.add(glow);
  group.userData.spin = true;
  keyMeshes.push(group);
  const labels = ['MED', 'LAB', 'REACTOR'];
  addInteract(x, y + 0.2, z, 2.2, () => tr(`${labels[index]}-Schlüsselkarte aufnehmen`, `Take ${labels[index]} keycard`), () => collectKey(index, group), { kind: 'key', glow });
}
function addBatteryPickup(x, y, z) {
  const group = new THREE.Group(); group.position.set(x, y, z); world.add(group);
  meshBox(group, 0, 0, 0, 0.2, 0.09, 0.12, M.metal);
  meshBox(group, 0, 0.055, 0, 0.14, 0.02, 0.08, M.emissiveAmber, { cast: false });
  addInteract(x, y + 0.1, z, 2.0, () => tr('Batteriezelle aufnehmen', 'Take battery cell'), () => takeBattery(group), { kind: 'item' });
}
function takeBattery(group) {
  game.battery = Math.min(100, game.battery + 38);
  group.visible = false;
  AudioSys.tone(680, 0.1, 'sine', 0.07);
  AudioSys.tone(920, 0.16, 'sine', 0.05);
  showToast(tr('Batteriezelle +38%', 'Battery cell +38%'), 2000, 'good');
  updateHud(true);
}

/* ── Player gear ─────────────────────────────────────────────────────────── */
function setupPlayerGear() {
  scene.add(camera);
  flashlight = new THREE.SpotLight(0xd8d5bd, 0, 34, Math.PI / 6.2, 0.52, 1.35);
  flashlight.position.set(0, 0, 0);
  flashlight.target.position.set(0, 0, -1);
  flashlight.castShadow = shadowOn();
  flashlight.shadow.mapSize.set(1024, 1024);
  flashlight.shadow.bias = -0.0015;
  camera.add(flashlight); camera.add(flashlight.target);
  flashlightFill = new THREE.PointLight(0xd8d5bd, 0, 6.5, 1.8);
  flashlightFill.position.set(0, 0, -0.45);
  camera.add(flashlightFill);
}

/* ── Monster ─────────────────────────────────────────────────────────────── */
function buildMonster() {
  monster = new THREE.Group();
  monster.position.set(0, 0.02, -62);
  monster.visible = false;
  const torso = meshSphere(monster, 0, 1.45, 0, 0.44, M.skin, { scale: [0.78, 1.35, 0.62], seg: 12, seg2: 10 });
  const chest = meshSphere(monster, 0, 1.65, -0.04, 0.32, M.skinPale, { scale: [0.9, 0.7, 0.45] });
  const head = meshSphere(monster, 0, 2.48, -0.1, 0.32, M.skin, { scale: [0.78, 1.2, 0.74] });
  const jaw = meshBox(monster, 0, 2.28, -0.3, 0.26, 0.12, 0.2, M.skinPale);
  for (const x of [-0.12, 0.12]) {
    meshSphere(monster, x, 2.54, -0.35, 0.045, M.bone, { seg: 6, seg2: 5 });
    meshSphere(monster, x, 2.54, -0.39, 0.018, new THREE.MeshBasicMaterial({ color: 0xd2462e }), { seg: 5, seg2: 4, cast: false });
  }
  for (const side of [-1, 1]) {
    const arm = meshCyl(monster, side * 0.5, 1.34, -0.02, 0.12, 0.15, 1.25, M.skin, 7);
    arm.rotation.z = side * -0.24; arm.rotation.x = 0.1;
    const forearm = meshCyl(monster, side * 0.64, 0.72, -0.1, 0.08, 0.11, 0.8, M.skinPale, 6);
    forearm.rotation.z = side * -0.16;
    for (let i = 0; i < 3; i++) meshCyl(monster, side * 0.68 + i * side * 0.02, 0.27, -0.18 + i * 0.05, 0.012, 0.022, 0.24, M.bone, 4, { rot: [0.5, 0, side * 0.3] });
    const leg = meshCyl(monster, side * 0.21, 0.5, 0.03, 0.15, 0.2, 1.0, M.skin, 7);
    leg.rotation.z = side * 0.05;
    const foot = meshBox(monster, side * 0.22, 0.04, -0.18, 0.22, 0.08, 0.42, M.skinPale);
  }
  // ribs / spines
  for (let i = 0; i < 5; i++) {
    const rib = meshCyl(monster, 0, 1.92 - i * 0.15, 0.16, 0.018, 0.03, 0.5, M.bone, 4);
    rib.rotation.z = Math.PI / 2; rib.rotation.y = rand(-0.1, 0.1);
  }
  for (let i = 0; i < 6; i++) meshCyl(monster, rand(-0.1, 0.1), 1.95 + i * 0.1, 0.2, 0.015, 0.03, 0.18, M.bone, 4, { rot: [rand(-0.4, 0.4), 0, rand(-0.3, 0.3)] });
  monsterLight = new THREE.PointLight(0x9b2518, 0, 7, 2);
  monsterLight.position.set(0, 2.2, -0.5);
  monster.add(monsterLight);
  monster.userData = { active: false, state: 'dormant', alert: 0, noisePos: new THREE.Vector3(0, 0, -60), waypoint: new THREE.Vector3(0, 0, -60), waypointT: 0, attackCd: 0, growlCd: 4, loseT: 0 };
  scene.add(monster);
}
function activateMonster(aggressive = false) {
  if (!monster) return;
  monster.visible = true;
  monster.userData.active = true;
  if (monster.userData.state === 'dormant') {
    monster.userData.state = 'roam';
    monster.position.set(0, 0.02, -58);
    monster.userData.waypoint.set(rand(-3, 3), 0, rand(-66, -48));
    monster.userData.waypointT = 0;
  }
  if (aggressive) {
    monster.userData.alert = 1;
    monster.userData.state = 'chase';
    AudioSys.growl(monster.position, 1.2);
  }
}
function monsterHears(noise, x, z) {
  if (!monster?.userData.active) return;
  const m = monster.userData;
  m.noisePos.set(x, 0, z);
  m.alert = clamp(m.alert + noise * 0.45, 0, 1.4);
  if (m.alert > 0.45 && m.state !== 'chase') m.state = 'investigate';
}
function updateMonster(dt) {
  if (!monster?.userData.active) return;
  const m = monster.userData;
  const toPlayer = tempVec.set(player.pos.x - monster.position.x, 0, player.pos.z - monster.position.z);
  const dist = toPlayer.length();
  game.monsterDist = dist;
  m.attackCd = Math.max(0, m.attackCd - dt);
  m.growlCd -= dt;
  // hearing and sight
  const moveNoise = game.sprinting ? 0.9 : game.crouch ? 0.12 : game.noise;
  const voiceNoise = game.talking ? 1.1 : game.micNoise > 0.18 ? 0.8 : 0;
  const lightNoise = game.flashlightOn ? 0.12 : 0;
  let hear = moveNoise + voiceNoise + lightNoise;
  const hearingRadius = game.crouch && !game.flashlightOn ? 3.2 : 5.5 + hear * 18;
  if (dist < hearingRadius) {
    m.alert = clamp(m.alert + dt * (0.75 + hear * 1.4), 0, 1.5);
    m.noisePos.copy(player.pos);
  } else {
    m.alert = Math.max(0, m.alert - dt * 0.12);
  }
  if (game.elevatorCalled && !game.escapeReady) m.alert = Math.max(m.alert, 0.75);
  if (game.flashlightOn && dist < 13) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const dir = tempVec.clone().normalize();
    if (fwd.dot(dir) > 0.62) m.alert = clamp(m.alert + dt * 0.55, 0, 1.5);
  }
  if (m.alert > 0.72 || (game.elevatorCalled && !game.escapeReady)) m.state = 'chase';
  else if (m.alert > 0.22) m.state = 'investigate';
  else if (m.state !== 'roam') m.state = 'roam';
  // movement target
  let tx, tz, speed;
  if (m.state === 'chase') {
    tx = player.pos.x; tz = player.pos.z;
    speed = game.elevatorCalled && !game.escapeReady ? 2.85 : 2.15;
    if (m.growlCd <= 0) { AudioSys.growl(monster.position, clamp(1 - dist / 24, 0.2, 1)); m.growlCd = rand(3.8, 7); }
  } else if (m.state === 'investigate') {
    tx = m.noisePos.x; tz = m.noisePos.z; speed = 1.55;
    if (dist2(monster.position, m.noisePos) < 1.2) { m.state = 'roam'; m.alert *= 0.4; }
  } else {
    m.waypointT -= dt;
    if (m.waypointT <= 0 || dist2(monster.position, m.waypoint) < 1.4) {
      m.waypoint.set(rand(-4.6, 4.6), 0, rand(-70, -8));
      m.waypointT = rand(6, 12);
    }
    tx = m.waypoint.x; tz = m.waypoint.z; speed = 0.92;
  }
  const dx = tx - monster.position.x, dz = tz - monster.position.z;
  const dl = Math.hypot(dx, dz) || 1;
  const step = speed * dt;
  const beforeX = monster.position.x, beforeZ = monster.position.z;
  moveEntity(monster, (dx / dl) * step, (dz / dl) * step, 0.45);
  const moved = Math.hypot(monster.position.x - beforeX, monster.position.z - beforeZ);
  if (moved < step * 0.25 && m.state === 'roam') m.waypointT = 0;
  if (moved > 0.0005) monster.rotation.y = Math.atan2(dx, dz);
  monster.position.y = 0.02 + Math.sin(game.elapsed * 5.4) * 0.025;
  monsterLight.intensity = 9 + Math.sin(game.elapsed * 7) * 2.5 + (m.state === 'chase' ? 8 : 0);
  // attack player
  if (dist < 1.55 && m.attackCd <= 0) {
    m.attackCd = 1.35;
    damagePlayer(rand(16, 24), 'monster');
    AudioSys.growl(monster.position, 1.4);
    game.fear = clamp(game.fear + 18, 0, 100);
  }
  // attack bots
  for (const bot of bots) {
    if (bot.down) continue;
    const d = dist2(bot.group.position, monster.position);
    if (d < 1.5 && m.attackCd <= 0 && Math.random() < 0.5) {
      m.attackCd = 1.5;
      bot.health -= rand(20, 30);
      bot.hitFlash = 0.35;
      if (bot.health <= 0) downBot(bot);
    }
  }
  // fear / heartbeat
  if (dist < 22) {
    const near = clamp(1 - dist / 22, 0, 1);
    game.fear = clamp(game.fear + (near * 7 - (1 - near) * 1.8) * dt, 0, 100);
    game.monsterSeen = near;
    if (dist < 12) {
      heartTimer -= dt;
      if (heartTimer <= 0) { heartTimer = lerp(1.15, 0.48, near); AudioSys.heartbeat(near); }
    }
  } else {
    game.fear = Math.max(0, game.fear - 3 * dt);
  }
}
function moveEntity(obj, dx, dz, radius = 0.33) {
  const tryAxis = (axis, amount) => {
    if (!amount) return;
    const steps = Math.max(1, Math.ceil(Math.abs(amount) / 0.08));
    const st = amount / steps;
    for (let i = 0; i < steps; i++) {
      const nx = obj.position.x + (axis === 'x' ? st : 0);
      const nz = obj.position.z + (axis === 'z' ? st : 0);
      if (!blockedAt(nx, nz, radius)) { obj.position[axis] += st; }
      else break;
    }
  };
  tryAxis('x', dx); tryAxis('z', dz);
}
function blockedAt(x, z, radius) {
  for (const c of colliders) {
    if (c.disabled) continue;
    if (Math.abs(x - c.x) < c.w / 2 + radius && Math.abs(z - c.z) < c.d / 2 + radius) return true;
  }
  return false;
}

/* ── Cooperative bots ────────────────────────────────────────────────────── */
function setupBots() {
  bots.length = 0;
  const count = game.solo ? 0 : clamp(game.launchBots || game.botCount || 0, 0, 3);
  const palette = [0x637066, 0x776b5c, 0x5d6571];
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    g.position.set((i % 2 ? 1 : -1) * (1.3 + i * 0.25), 0, 1.6 + i * 0.7);
    const suit = new THREE.MeshStandardMaterial({ color: palette[i], roughness: 0.9 });
    meshSphere(g, 0, 1.06, 0, 0.27, suit, { scale: [0.8, 1.35, 0.7], seg: 10, seg2: 8 });
    meshSphere(g, 0, 1.68, 0, 0.21, suit, { seg: 10, seg2: 8 });
    meshBox(g, 0, 1.68, -0.18, 0.28, 0.12, 0.08, M.visor);
    meshBox(g, 0, 1.1, 0.22, 0.38, 0.5, 0.2, M.metal);
    meshCyl(g, 0.3, 1.2, 0.05, 0.035, 0.035, 0.7, M.metal, 5, { rot: [0, 0, -0.3] });
    const dot = meshSphere(g, 0.3, 1.53, -0.02, 0.045, M.emissiveAmber, { seg: 6, seg2: 5, cast: false });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.25, 5.5, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xd8c9a3, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.rotation.x = -Math.PI / 2; beam.position.set(0.3, 1.5, -2.75); g.add(beam);
    world.add(g);
    bots.push({
      group: g, name: BOT_NAMES[i], role: BOT_ROLES[i], health: 100, down: false, downT: 0,
      offset: new THREE.Vector3((i % 2 ? 1 : -1) * (1.2 + i * 0.3), 0, 1.5 + i * 0.8),
      spareBattery: true, lineCd: rand(8, 20), hitFlash: 0, reviveT: 0,
      say: () => {}, color: palette[i], index: i,
    });
  }
  updateSquadStatus();
}
function botSay(bot, text, force = false) {
  if (!bot || bot.down) return;
  if (!force && bot.lineCd > 0) return;
  bot.lineCd = rand(18, 34);
  AudioSys.say(text, { speaker: bot.name, pitch: 0.9 + bot.index * 0.04 });
}
function updateBots(dt) {
  const standing = bots.filter(b => !b.down);
  for (const bot of bots) {
    bot.lineCd -= dt;
    bot.hitFlash = Math.max(0, bot.hitFlash - dt);
    if (bot.down) {
      bot.downT += dt;
      bot.group.rotation.z = Math.PI / 2;
      bot.group.position.y = 0.16;
      continue;
    }
    bot.group.rotation.z = 0;
    bot.group.position.y = 0;
    const target = player.pos.clone();
    if (game.down) {
      target.copy(player.pos);
    } else {
      const side = bot.offset.x;
      target.set(player.pos.x + side, 0, player.pos.z + bot.offset.z);
    }
    // avoid crowding / keep separation
    for (const other of standing) {
      if (other === bot) continue;
      const d = dist2(bot.group.position, other.group.position);
      if (d < 0.85) { target.x += (bot.group.position.x - other.group.position.x) * 0.7; target.z += (bot.group.position.z - other.group.position.z) * 0.7; }
    }
    let dx = target.x - bot.group.position.x, dz = target.z - bot.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 24) { bot.group.position.set(player.pos.x + rand(-1.5, 1.5), 0, player.pos.z + rand(1.5, 2.5)); }
    else if (d > (game.down ? 0.8 : 1.0)) {
      const sp = game.down ? 3.2 : (game.sprinting ? 4.2 : 2.65);
      const step = Math.min(d, sp * dt);
      moveEntity(bot.group, (dx / d) * step, (dz / d) * step, 0.28);
      bot.group.rotation.y = Math.atan2(dx, dz);
    }
    // player revive
    if (game.down && d < 1.6) {
      game.revive = clamp(game.revive + dt / 5.2, 0, 1);
      if (game.revive >= 1) revivePlayer();
    }
    // share battery
    if (!game.down && bot.spareBattery && game.battery < 16 && d < 5.5) {
      bot.spareBattery = false;
      game.battery = Math.min(100, game.battery + 42);
      botSay(bot, tr('Ich habe noch eine Zelle. Nimm sie.', 'I have a spare cell. Take it.'), true);
      showToast(tr('Teamkamerad teilt Batterie +42%', 'Teammate shared battery +42%'), 2200, 'good');
    }
    // reactions
    if (monster?.userData.active && game.monsterDist < 10 && bot.lineCd <= 0 && Math.random() < 0.03) {
      botSay(bot, pick([
        'It is close. Kill your light.',
        'Do not run. It hears the footsteps.',
        'I have contact. Left side.',
        'Stay together. Do not let it split us.',
      ]), true);
    } else if (bot.lineCd <= 0 && Math.random() < 0.004) {
      botSay(bot, pick([
        'This place is still breathing.',
        'The readings are wrong. Everything down here is wrong.',
        'I can hear something in the walls.',
        'Keep moving. The lift is our only way out.',
        'If you find a cell, take it. The dark eats batteries.',
      ]));
    }
  }
  updateSquadStatus();
}
function downBot(bot) {
  if (bot.down) return;
  bot.down = true; bot.health = 0; bot.downT = 0; bot.reviveT = 0;
  bot.group.rotation.z = Math.PI / 2; bot.group.position.y = 0.16;
  AudioSys.tone(80, 0.5, 'sawtooth', 0.08);
  showToast(tr(`${bot.name} ist down. Halte E zum Wiederbeleben.`, `${bot.name} is down. Hold E to revive.`), 3500, 'warn');
  if (game.lang === 'de') AudioSys.say(`${bot.name} is down. I need a medic.`, { speaker: bot.name });
  updateSquadStatus();
}
function reviveBot(bot) {
  if (!bot.down) return;
  bot.down = false; bot.health = 48; bot.downT = 0;
  bot.group.rotation.z = 0; bot.group.position.y = 0;
  botSay(bot, 'I am up. Thank you.', true);
  showToast(tr(`${bot.name} wiederbelebt.`, `${bot.name} revived.`), 2200, 'good');
  updateSquadStatus();
}
function nearestDownedBot() {
  let best = null, bd = 2.4;
  for (const b of bots) if (b.down) { const d = dist2(player.pos, b.group.position); if (d < bd) { bd = d; best = b; } }
  return best;
}

/* ── Player state / damage / death ───────────────────────────────────────── */
function damagePlayer(amount, source = '') {
  if (game.down || game.mode !== 'playing' || game.damageCd > 0) return;
  game.health = Math.max(0, game.health - amount);
  game.damageCd = 1.0;
  game.hurtFlash = 1;
  game.fear = clamp(game.fear + amount * 0.7, 0, 100);
  $('#damage-vignette').style.opacity = '0.85';
  setTimeout(() => { if ($('#damage-vignette')) $('#damage-vignette').style.opacity = '0'; }, 260);
  AudioSys.tone(54, 0.28, 'sawtooth', 0.11);
  AudioSys.noiseBurst(0.22, 0.08, 700, 'lowpass');
  if (game.health <= 0) goDown();
}
function goDown() {
  if (game.down) return;
  game.down = true; game.revive = 0; game.deathTimer = 0;
  $('#down-overlay').classList.add('show');
  $('#down-copy').textContent = t('downCopy');
  AudioSys.say('I am hit. I am down. Do not leave me here.', { speaker: 'OPERATOR' });
  if (!bots.some(b => !b.down)) game.deathTimer = 8;
}
function revivePlayer() {
  game.down = false; game.revive = 0; game.health = 42;
  $('#down-overlay').classList.remove('show');
  showToast(tr('Dein Team hat dich stabilisiert.', 'Your team stabilized you.'), 2600, 'good');
  AudioSys.tone(320, 0.2, 'sine', 0.06);
}
function die(reason = 'lost') {
  if (game.ending) return;
  game.mode = 'ending'; game.ending = true; game.endingWon = false;
  document.exitPointerLock?.();
  AudioSys.stopVoice();
  AudioSys.tone(62, 1.6, 'sawtooth', 0.16);
  $('#ending-title').textContent = reason === 'detonation' ? tr('DETONATION.', 'DETONATION.') : tr('SIGNAL VERLOREN.', 'SIGNAL LOST.');
  $('#ending-copy').textContent = reason === 'detonation'
    ? tr('Die Anlage versiegelt sich für immer. Dein Signal endet hier.', 'The facility seals itself forever. Your signal ends here.')
    : tr('Das Signal verstummt. Die Anlage bleibt versiegelt.', 'The signal goes quiet. The facility remains sealed.');
  $('#ending-screen').classList.add('show');
  $('#game-ui').classList.remove('active');
  updateSquadStatus();
}
function win() {
  if (game.ending) return;
  game.mode = 'ending'; game.ending = true; game.endingWon = true;
  document.exitPointerLock?.();
  AudioSys.stopVoice();
  AudioSys.elevator();
  AudioSys.say('Surface reached. Whatever followed us up… it is still here.', { speaker: 'OPERATOR' });
  $('#ending-title').textContent = tr('OBERFLÄCHE ERREICHT.', 'SURFACE REACHED.');
  $('#ending-copy').textContent = tr('Der Morgen ist da. Doch etwas ist mit dir nach oben gekommen.', 'Morning has come. But something followed you to the surface.');
  $('#ending-screen').classList.add('show');
  $('#game-ui').classList.remove('active');
}

/* ── Flashlight / radio ──────────────────────────────────────────────────── */
function toggleFlashlight(force) {
  if (!game.hasFlashlight) { showToast(tr('Du hast noch keine Taschenlampe.', 'You do not have a flashlight yet.')); return; }
  if (game.battery <= 0 && !force) { showToast(tr('Die Taschenlampe ist tot.', 'The flashlight is dead.')); return; }
  game.flashlightOn = force === undefined ? !game.flashlightOn : force;
  if (flashlight) flashlight.intensity = game.flashlightOn ? FLASH_I : 0;
  if (flashlightFill) flashlightFill.intensity = game.flashlightOn ? FILL_I : 0;
  AudioSys.tone(game.flashlightOn ? 420 : 180, 0.05, 'square', 0.025);
  updateEquipment();
}
function updateEquipment() {
  const el = $('#equipment'); if (!el) return;
  el.innerHTML = `${game.hasFlashlight ? (game.flashlightOn ? '▰' : '▱') : '·'} ${tr('Taschenlampe', 'Flashlight')} <span>${game.hasRadio ? '◉' : '○'} ${tr('Walkie-talkie', 'Walkie-talkie')}</span>`;
}
function useRadio() {
  if (!game.hasRadio || game.radioCd > 0) { if (!game.hasRadio) showToast(tr('Kein Funkgerät.', 'No walkie-talkie.')); return; }
  game.radioCd = 2.2;
  AudioSys.radioStatic(0.5);
  game.noise = 1;
  if (monster?.userData.active) monsterHears(0.8, player.pos.x, player.pos.z);
  if (Math.random() < 0.55) {
    AudioSys.say(pick([
      'Control, this is Operator. Radio check. Nobody is answering.',
      'If anyone is on this channel, the lower wing is not secure.',
      'We have three keycards. Moving toward the reactor.',
      'Do not trust the emergency lighting. It lies.',
    ]), { speaker: 'RADIO' });
  } else {
    showToast(tr('FUNKRAUSCHEN · KEIN SIGNAL', 'RADIO STATIC · NO SIGNAL'), 1400);
  }
}

/* ── Interaction ─────────────────────────────────────────────────────────── */
function nearestInteract() {
  let best = null, bd = Infinity;
  for (const it of interactables) {
    if (it.used) continue;
    const d = Math.hypot(player.pos.x - it.x, player.pos.z - it.z);
    if (d < it.r && d < bd) { bd = d; best = it; }
  }
  const db = nearestDownedBot();
  if (db) {
    const d = dist2(player.pos, db.group.position);
    if (d < bd) return { dynamicBot: db, label: tr(`${db.name} wiederbeleben`, `Revive ${db.name}`), hold: 2.4, x: db.group.position.x, z: db.group.position.z, r: 2.4 };
  }
  return best;
}
function addInteract(x, y, z, r, label, use, opts = {}) {
  interactables.push({ x, y, z, r, label, use, kind: opts.kind || 'object', hold: opts.hold || 0, used: false, glow: opts.glow || null });
}
function tryInteract() {
  if (game.down) return;
  const it = nearestInteract();
  if (!it) return;
  if (it.hold) {
    holdTarget = it; holdT = 0; holdNeeded = it.hold;
    return;
  }
  it.use();
  if (it.kind === 'item' || it.kind === 'key') it.used = true;
}
function updateHold(dt) {
  if (!holdTarget) { holdT = 0; return; }
  if (!keysDown.has('KeyE') && !game.touchInteractHeld) {
    holdTarget = null; holdT = 0;
    $('#interaction').classList.remove('holding');
    return;
  }
  if (holdTarget.dynamicBot && holdTarget.dynamicBot.down === false) { holdTarget = null; holdT = 0; return; }
  holdT += dt;
  const pct = clamp(holdT / holdNeeded, 0, 1);
  $('#interaction').classList.add('holding');
  $('#interaction .hold-track i').style.width = `${pct * 100}%`;
  if (pct >= 1) {
    const it = holdTarget;
    holdTarget = null; holdT = 0;
    $('#interaction').classList.remove('holding');
    $('#interaction .hold-track i').style.width = '0%';
    if (it.dynamicBot) reviveBot(it.dynamicBot);
    else { it.use(); if (it.kind === 'item' || it.kind === 'key') it.used = true; }
  }
}
function updateInteractionUi() {
  const it = nearestInteract();
  const el = $('#interaction');
  if (!it || game.paused || game.down || game.mode !== 'playing') { el.classList.remove('show'); return; }
  el.classList.add('show');
  const label = typeof it.label === 'function' ? it.label() : it.label;
  $('#interaction-text').textContent = label;
  if (holdTarget && holdTarget !== it) { holdTarget = null; holdT = 0; }
}

/* ── Story actions ───────────────────────────────────────────────────────── */
function readJournal() {
  if (game.journalRead) { showToast(tr('Das Journal wurde bereits gelesen.', 'You have already read the journal.')); return; }
  game.journalRead = true; game.storyDone = true; game.phase = Math.max(game.phase, 1);
  AudioSys.say('Field journal, April seventeenth. The lower wing is gone. The subject responds to acoustic stimuli. It does not see. It listens.', { speaker: 'RECORDING' });
  showToast(tr('EINSATZJOURNAL: „Wenn die Lichter ausgehen, bleib still. Sie hört dich atmen.“', 'FIELD JOURNAL: “When the lights go out, stay quiet. It can hear you breathe.”'), 5200, 'warn');
  updateObjectives(true);
}
function playCassette() {
  game.cassettePlayed = true; game.storyDone = true; game.phase = Math.max(game.phase, 1);
  AudioSys.radioStatic(0.6);
  AudioSys.say('Cassette recording zero four one seven. If this reaches security, do not run. It follows the noise. The keycards are encrypted to separate sectors. Restore the main generator only after all three are recovered.', { speaker: 'CASSETTE' });
  showToast(tr('KASSETTE · AUFZEICHNUNG 04:17', 'CASSETTE · RECORDING 04:17'), 2200);
  updateObjectives(true);
}
function unlockSecurity() {
  const door = doorById('security');
  if (door.target > 0) { showToast(tr('Die Sicherheitstür ist bereits offen.', 'The security door is already open.')); return; }
  if (!game.storyDone) { showToast(tr('Lies zuerst das Einsatzjournal oder spiele die Kassette ab.', 'Read the field journal or play the cassette first.'), 3000); return; }
  openDoor(door);
  game.phase = Math.max(game.phase, 1);
  activateMonster(false);
  AudioSys.say('Security door released. The route is open. Do not make unnecessary noise.', { speaker: 'NORTHSTAR' });
  showToast(tr('Sicherheitstür entriegelt. Der Weg ist frei.', 'Security door unlocked. The route is clear.'), 2800, 'good');
  updateObjectives(true);
}
function takeFlashlight() {
  if (game.hasFlashlight) return;
  game.hasFlashlight = true; game.battery = Math.max(game.battery, 34);
  game.flashlightOn = true;
  if (flashlight) flashlight.intensity = FLASH_I;
  if (flashlightFill) flashlightFill.intensity = FILL_I;
  AudioSys.tone(440, 0.08, 'square', 0.04);
  showToast(tr('Taschenlampe aufgenommen. F schaltet sie ein oder aus.', 'Flashlight acquired. Press F to toggle it.'), 3200, 'good');
  updateEquipment();
}
function takeRadio() {
  if (game.hasRadio) return;
  game.hasRadio = true;
  AudioSys.radioStatic(0.7);
  AudioSys.say('Operator, this is Northstar control. We read you. The facility is dark. No response from the night shift. Find the keycards. Restore power. Get to the lift.', { speaker: 'RADIO' });
  showToast(tr('Funkgerät aufgenommen. Q sendet einen Funkimpuls.', 'Walkie-talkie acquired. Press Q to send a radio ping.'), 3200, 'good');
  updateEquipment();
}
function collectKey(i, group) {
  const count = game.keys.filter(Boolean).length;
  if (i !== count) {
    showToast(tr('Falsche Reihenfolge. Folge den Sektorprotokollen.', 'Wrong sequence. Follow the sector protocol.'), 2400, 'warn');
    return false;
  }
  game.keys[i] = true;
  group.visible = false;
  AudioSys.tone(740, 0.14, 'sine', 0.08);
  AudioSys.tone(980, 0.22, 'sine', 0.06);
  AudioSys.say(`${KEY_LABELS[i]} keycard secured. ${i < 2 ? 'Proceed to the next sector.' : 'All three cards recovered. Restore the generator.'}`, { speaker: 'NORTHSTAR' });
  showToast(tr(`${KEY_LABELS[i]}-Karte gesichert.`, `${KEY_LABELS[i]} keycard secured.`), 2400, 'good');
  updateObjectives(true);
  return true;
}
function tryDoor(id) {
  const door = doorById(id);
  if (!door) return;
  if (door.target > 0) { showToast(tr('Zugang bereits geöffnet.', 'Access already open.')); return; }
  if (id === 'med') {
    if (!game.keys[0]) { showToast(tr('MED-Karte erforderlich.', 'MED keycard required.'), 2200, 'warn'); return; }
    openDoor(door); AudioSys.say('MED access granted. Laboratory wing unlocked.', { speaker: 'NORTHSTAR' }); updateObjectives(true);
  } else if (id === 'lab') {
    if (!game.keys[1]) { showToast(tr('LAB-Karte erforderlich.', 'LAB keycard required.'), 2200, 'warn'); return; }
    openDoor(door); AudioSys.say('LAB access granted. Reactor wing unlocked.', { speaker: 'NORTHSTAR' }); updateObjectives(true);
  } else if (id === 'reactor') {
    if (!game.power) { showToast(tr('Kein Strom. Stelle zuerst den Hauptgenerator wieder her.', 'No power. Restore the main generator first.'), 2800, 'warn'); return; }
    openDoor(door); AudioSys.say('Reactor access granted. Surface lift is beyond.', { speaker: 'NORTHSTAR' }); updateObjectives(true);
  }
}
function engageBreaker(i, assisted = false) {
  if (game.breakers[i]) return;
  if (!game.keys.every(Boolean)) { showToast(tr('Alle drei Schlüsselkarten werden benötigt.', 'All three keycards are required.'), 2600, 'warn'); return; }
  if (game.power) return;
  if (!assisted) {
    if (game.breakerWindow <= 0) game.breakerWindow = 30;
    if (game.botCount > 0) {
      setTimeout(() => {
        if (game.mode === 'playing' && !game.power && game.breakers[i] && !game.breakers[1 - i]) {
          const bot = bots.find(b => !b.down);
          if (bot) { botSay(bot, 'Breaker B is mine. Hold it.', true); engageBreaker(1 - i, true); }
        }
      }, 1500);
    }
  }
  game.breakers[i] = true;
  AudioSys.tone(170, 0.2, 'sawtooth', 0.09);
  AudioSys.tone(260, 0.18, 'triangle', 0.06);
  showToast(tr(`Brecher ${i === 0 ? 'A' : 'B'} eingelegt.`, `Breaker ${i === 0 ? 'A' : 'B'} engaged.`), 2000, 'good');
  if (game.breakers.every(Boolean)) restorePower();
  else if (!assisted && game.botCount === 0) showToast(tr('Zweiter Brecher innerhalb von 30 Sekunden!', 'Reach the second breaker within 30 seconds!'), 3200, 'warn');
  updateObjectives(true);
}
function restorePower() {
  if (game.power) return;
  game.power = true; game.detonation = 600; game.breakerWindow = 0;
  for (const f of flickers) if (f.red) f.light.color.set(0x74a989);
  const door = doorById('reactor'); if (door) openDoor(door, true);
  AudioSys.alarm();
  AudioSys.say('Main power restored. Warning: facility auto-detonation sequence is now active. Ten minutes. Get to the surface lift.', { speaker: 'NORTHSTAR' });
  showToast(tr('HAUPTSTROM WIEDERHERGESTELLT. SELBSTZERSTÖRUNG AKTIV: 10:00', 'MAIN POWER RESTORED. AUTO-DETONATION ACTIVE: 10:00'), 5000, 'warn');
  activateMonster(true);
  updateObjectives(true);
}
function useLiftPanel() {
  if (!game.power) { showToast(tr('Kein Strom. Aktiviere zuerst den Hauptgenerator.', 'No power. Restore the main generator first.'), 2600, 'warn'); return; }
  if (game.escapeReady) { showToast(tr('Die Kabine ist bereit. Betritt den Aufzug.', 'The car is ready. Board the elevator.'), 2400, 'good'); return; }
  if (game.elevatorCalled) { showToast(tr(`Aufzug unterwegs. Halte durch: ${Math.ceil(game.hold)}s.`, `Elevator inbound. Hold out: ${Math.ceil(game.hold)}s.`), 2200, 'warn'); return; }
  game.elevatorCalled = true; game.hold = 60;
  AudioSys.elevator();
  AudioSys.say('Elevator called. It is coming from the surface. Hold this position for sixty seconds. It knows where we are.', { speaker: 'NORTHSTAR' });
  showToast(tr('AUFZUG GERUFEN. HALTE 60 SEKUNDEN DURCH!', 'ELEVATOR CALLED. SURVIVE 60 SECONDS!'), 4200, 'warn');
  activateMonster(true);
  updateObjectives(true);
}
function boardElevator() {
  if (!game.escapeReady) { showToast(tr('Die Kabine ist noch nicht da. Rufe den Aufzug.', 'The car is not here yet. Call the elevator.'), 2400, 'warn'); return; }
  win();
}
function updateLift(dt) {
  if (game.elevatorCalled && game.hold > 0) {
    game.hold = Math.max(0, game.hold - dt);
    if (game.hold <= 0 && !game.escapeReady) {
      game.escapeReady = true;
      applyLiftState();
      if (liftLight) liftLight.color.set(0x8fd39a);
      AudioSys.elevator();
      AudioSys.say('The car has arrived. Board now. Do not look back.', { speaker: 'NORTHSTAR' });
      showToast(tr('AUFZUG BEREIT. BETRITT DIE KABINE!', 'ELEVATOR READY. BOARD NOW!'), 4200, 'good');
      updateObjectives(true);
    }
  }
  if (game.detonation !== null && !game.ending) {
    game.detonation = Math.max(0, game.detonation - dt);
    if (game.detonation <= 0) die('detonation');
  }
  if (game.breakerWindow > 0 && !game.power) {
    game.breakerWindow = Math.max(0, game.breakerWindow - dt);
    if (game.breakerWindow <= 0 && game.breakers.some(Boolean) && !game.breakers.every(Boolean)) {
      game.breakers = [false, false];
      showToast(tr('Brecherfenster abgelaufen. Beide Brecher zurücksetzen.', 'Breaker window expired. Both breakers reset.'), 3000, 'warn');
      AudioSys.tone(90, 0.5, 'sawtooth', 0.08);
    }
  }
}

/* ── Objectives and HUD ──────────────────────────────────────────────────── */
function currentObjectiveIndex() {
  if (!game.storyDone) return 0;
  if (!game.keys[0]) return 1;
  if (!doorById('med')?.target) return 2;
  if (!game.keys[1]) return 3;
  if (!doorById('lab')?.target) return 4;
  if (!game.keys[2]) return 5;
  if (!game.power) return 6;
  if (!game.escapeReady) return 7;
  return 8;
}
function updateObjectives(force = false) {
  const idx = currentObjectiveIndex();
  const text = objectives[game.lang][idx];
  const el = $('#objective-text'); if (el) el.textContent = text;
  const keyCount = game.keys.filter(Boolean).length;
  const prog = $('#objective-progress');
  if (prog) prog.innerHTML = `KEYCARD ${String(keyCount).padStart(2, '0')} / 03 <span><i class="${game.keys[0] ? 'filled' : ''}"></i><i class="${game.keys[1] ? 'filled' : ''}"></i><i class="${game.keys[2] ? 'filled' : ''}"></i></span>`;
  const log = $('#log-list');
  if (log) log.innerHTML = objectives[game.lang].map((s, i) => `<li class="${i < idx ? 'complete' : ''}">${s}</li>`).join('');
  const squad = $('#squad-count'); if (squad) squad.textContent = String(1 + bots.filter(b => !b.down).length).padStart(2, '0');
  updateSector();
  updateSquadStatus();
  // diegetic objective card: fades away in solo after a few seconds
  const card = $('#objective-card');
  if (card) {
    card.classList.remove('fade');
    clearTimeout(updateObjectives._timer);
    if (game.solo) updateObjectives._timer = setTimeout(() => { if (game.mode === 'playing' && !game.paused) card.classList.add('fade'); }, 7000);
  }
  game.lastObjectiveAt = game.elapsed;
  if (force) game.objectiveVisible = true;
}
function updateSector() {
  const z = player.pos.z;
  let i = 0;
  if (z < -72) i = 4; else if (z < -48) i = 3; else if (z < -27) i = 2; else if (z < -7) i = 1;
  const el = $('#sector-name'); if (el) el.textContent = sectorNames[game.lang][i];
}
function updateSquadStatus() {
  const el = $('#squad-status'); if (!el) return;
  if (game.solo) { el.innerHTML = ''; return; }
  const rows = [];
  rows.push(`<div class="sq ${game.down ? 'down' : ''}"><b>YOU</b><em>${game.down ? 'DOWN' : Math.max(0, Math.round(game.health)) + '%'}</em><i></i></div>`);
  for (const b of bots) rows.push(`<div class="sq ${b.down ? 'down' : ''}"><b>${b.name}</b><em>${b.down ? 'DOWN' : Math.max(0, Math.round(b.health)) + '%'}</em><i></i></div>`);
  el.innerHTML = rows.join('');
}
function updateHud(dt) {
  const battery = $('#battery-meter');
  if (battery) {
    battery.querySelector('b').textContent = `${Math.ceil(game.battery)}%`;
    battery.querySelector('i').style.width = `${clamp(game.battery, 0, 100)}%`;
    battery.classList.toggle('low', game.battery < 20);
  }
  const fear = $('#fear-vignette');
  if (fear) fear.style.opacity = String(clamp(game.fear / 150, 0, 0.72));
  const blood = $('#blood-overlay');
  if (blood) blood.style.opacity = String(clamp((1 - game.health / 100) * 0.92 + game.hurtFlash * 0.25, 0, 0.94));
  const pulse = $('#pulse-overlay');
  if (pulse) pulse.style.opacity = (game.health < 45 || game.fear > 62) ? String(clamp(0.22 + (1 - game.health / 100) * 0.5, 0, 0.72)) : '0';
  game.hurtFlash = Math.max(0, game.hurtFlash - dt * 1.8);
  // timer / lift countdown
  const timer = $('#timer-card'), label = $('#timer-label'), value = $('#timer-value');
  if (timer) {
    let show = false, danger = false, lab = 'DETONATION', val = '';
    if (game.elevatorCalled && !game.escapeReady) {
      show = true; lab = 'LIFT ARRIVAL'; val = `00:${String(Math.ceil(game.hold)).padStart(2, '0')}`; danger = game.hold < 15;
    } else if (game.power && game.detonation !== null && !game.ending) {
      show = true; lab = game.escapeReady ? 'LIFT READY' : 'DETONATION';
      const s = Math.max(0, Math.ceil(game.detonation));
      val = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      danger = game.detonation < 60;
    }
    timer.classList.toggle('show', show);
    timer.classList.toggle('danger', danger);
    if (show) { label.textContent = lab; value.textContent = val; }
  }
  // objective countdown during defense
  if (game.elevatorCalled && game.hold > 0 && game.mode === 'playing') {
    const el = $('#objective-text');
    if (el) el.textContent = `${objectives[game.lang][7]}  ·  ${Math.ceil(game.hold)}s`;
  }
  // down / revive
  if (game.down) {
    const meter = $('#down-overlay .revive-meter i');
    if (meter) meter.style.width = `${clamp(game.revive * 100, 0, 100)}%`;
    if (!bots.some(b => !b.down)) {
      game.deathTimer += dt;
      if (game.deathTimer > 8) die('lost');
    }
  }
  // low battery diegetic warning
  if (game.battery < 15 && !game.lowBatteryWarned) {
    game.lowBatteryWarned = true;
    showToast(tr('TASCHENLAMPE SCHWACH · BATTERIEZELLE SUCHEN', 'FLASHLIGHT LOW · FIND A BATTERY CELL'), 3200, 'warn');
    AudioSys.tone(180, 0.2, 'square', 0.03);
  }
  if (game.battery > 25) game.lowBatteryWarned = false;
  // voice indicator
  const vi = $('#voice-indicator');
  if (vi) {
    const active = game.voiceOn || game.talking;
    vi.classList.toggle('on', active);
    vi.classList.toggle('talking', game.talking || game.micNoise > 0.12);
    const vs = $('#voice-state');
    if (vs) vs.textContent = game.talking ? 'TRANSMITTING' : game.voiceOn ? 'LIVE' : 'PTT · V';
  }
  if (game.down) $('#down-copy').textContent = t('downCopy');
}
function updateMic(dt) {
  if (!game.micAnalyser) return;
  micCheckTimer -= dt;
  if (micCheckTimer > 0) return;
  micCheckTimer = 0.1;
  const data = new Uint8Array(game.micAnalyser.frequencyBinCount);
  game.micAnalyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
  const rms = Math.sqrt(sum / data.length);
  game.micNoise = rms;
  if (rms > 0.12 && monster?.userData.active) monsterHears(0.55, player.pos.x, player.pos.z);
}

/* ── Player update ───────────────────────────────────────────────────────── */
function updatePlayer(dt) {
  if (game.paused || game.mode !== 'playing') return;
  if (game.down) {
    if (keysDown.has('KeyE') || game.touchInteractHeld) {
      if (bots.some(b => !b.down)) game.revive = clamp(game.revive + dt / 7, 0, 0.98);
    }
    camera.position.set(player.pos.x, 0.48, player.pos.z);
    camera.rotation.set(0.25, player.yaw, 0.35, 'YXZ');
    return;
  }
  const forward = (keysDown.has('KeyW') || keysDown.has('ArrowUp') ? 1 : 0) - (keysDown.has('KeyS') || keysDown.has('ArrowDown') ? 1 : 0) + game.touchMove.y;
  const side = (keysDown.has('KeyD') || keysDown.has('ArrowRight') ? 1 : 0) - (keysDown.has('KeyA') || keysDown.has('ArrowLeft') ? 1 : 0) + game.touchMove.x;
  const moving = Math.abs(forward) > 0.01 || Math.abs(side) > 0.01;
  game.crouch = keysDown.has('ControlLeft') || keysDown.has('ControlRight') || keysDown.has('KeyC');
  const wantSprint = (keysDown.has('ShiftLeft') || keysDown.has('ShiftRight')) && !game.crouch && moving;
  game.sprinting = wantSprint && game.stamina > 2;
  if (game.sprinting) game.stamina = Math.max(0, game.stamina - 24 * dt);
  else game.stamina = Math.min(100, game.stamina + 14 * dt);
  const speed = game.crouch ? 1.55 : game.sprinting ? 4.9 : 2.75;
  const f = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const r = new THREE.Vector3(Math.cos(player.yaw), 0, Math.sin(player.yaw));
  const v = f.multiplyScalar(forward).add(r.multiplyScalar(side));
  if (v.lengthSq() > 0) v.normalize().multiplyScalar(speed * dt);
  moveEntity(player, v.x, v.z, player.radius);
  if (moving) {
    const bobRate = game.sprinting ? 12 : game.crouch ? 4.5 : 7.5;
    bob += dt * bobRate;
    footTimer -= dt;
    if (footTimer <= 0) {
      footTimer = game.sprinting ? 0.28 : game.crouch ? 0.75 : 0.48;
      AudioSys.footstep(game.sprinting, 0);
      game.noise = game.sprinting ? 1 : game.crouch ? 0.1 : 0.36;
      if (monster?.userData.active) monsterHears(game.sprinting ? 0.55 : game.crouch ? 0.04 : 0.16, player.pos.x, player.pos.z);
    }
  } else {
    game.noise = Math.max(0, game.noise - dt * 2.5);
  }
  if (game.talking || game.micNoise > 0.12) game.noise = 1;
  const eye = game.crouch ? 1.18 : player.eye;
  camera.position.set(player.pos.x, eye + Math.sin(bob) * (game.crouch ? 0.012 : 0.025), player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  if (game.flashlightOn && game.battery > 0) {
    game.battery = Math.max(0, game.battery - (0.052 + (game.sprinting ? 0.025 : 0)) * dt);
    if (flashlight) flashlight.intensity = FLASH_I * (game.battery < 18 ? (0.55 + Math.random() * 0.45) : 1);
    if (game.battery <= 0) {
      game.flashlightOn = false;
      if (flashlight) flashlight.intensity = 0;
      if (flashlightFill) flashlightFill.intensity = 0;
      showToast(tr('Die Taschenlampe ist erloschen.', 'The flashlight has gone dark.'), 3000, 'warn');
    }
  }
  game.damageCd = Math.max(0, game.damageCd - dt);
  game.radioCd = Math.max(0, game.radioCd - dt);
  updateMic(dt);
  AudioSys.updateListener(camera);
}

/* ── Main update / render loop ───────────────────────────────────────────── */
function update(dt) {
  game.elapsed += dt;
  updatePlayer(dt);
  updateBots(dt);
  updateMonster(dt);
  updateLift(dt);
  updateDoors(dt);
  updateHold(dt);
  updateInteractionUi();
  updateHud(dt);
  updateSector();
}
function updateIntro(dt) {
  game.introT += dt;
  const t = game.introT;
  player.yaw = Math.PI + Math.sin(t * 0.16) * 0.035;
  player.pitch = -0.035 + Math.sin(t * 0.11) * 0.01;
  camera.position.set(Math.sin(t * 0.18) * 0.06, 1.68 + Math.sin(t * 0.4) * 0.008, 2.65);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  const bar = $('#intro-screen .intro-progress span');
  if (bar) bar.style.width = `${clamp(t / 9.5, 0, 1) * 100}%`;
  if (t > 9.5) beginGame(true);
}
function updateMenuCamera(dt) {
  menuCamT += dt;
  camera.position.set(Math.sin(menuCamT * 0.11) * 0.16, 1.7 + Math.sin(menuCamT * 0.2) * 0.01, 2.3);
  camera.rotation.set(-0.035 + Math.sin(menuCamT * 0.13) * 0.008, Math.PI + Math.sin(menuCamT * 0.09) * 0.05, 0, 'YXZ');
}
function updateParticles(dt, now) {
  for (const p of particles) {
    const a = p.points.geometry.attributes.position;
    if (p.type === 'dust') {
      for (let i = 0; i < p.speeds.length; i++) {
        a.array[i * 3 + 1] += Math.sin(now * 0.0004 + i) * 0.03 * dt;
        a.array[i * 3 + 2] += p.speeds[i] * dt;
        if (a.array[i * 3 + 2] > 7) a.array[i * 3 + 2] = -89;
      }
    } else if (p.type === 'steam') {
      for (let i = 0; i < p.speeds.length; i++) {
        a.array[i * 3 + 1] += p.speeds[i] * dt;
        if (a.array[i * 3 + 1] > p.y + 2.4) a.array[i * 3 + 1] = p.y - 0.2;
        a.array[i * 3] += Math.sin(now * 0.0006 + i) * 0.02 * dt;
      }
    }
    a.needsUpdate = true;
  }
}
function animate(now) {
  const dt = Math.min(0.08, Math.max(0, (now - lastTime) / 1000 || 0));
  lastTime = now;
  // flicker practicals
  for (const f of flickers) {
    const wave = 0.88 + 0.12 * Math.sin(now * 0.0018 + f.phase);
    f.light.intensity = f.base * wave * (Math.random() > 0.997 ? 0.1 : 1);
  }
  // spin keycards
  for (const k of keyMeshes) if (k.visible) { k.rotation.y += dt * 1.2; k.position.y += Math.sin(now * 0.002 + k.id) * 0.0006; }
  updateParticles(dt, now);
  if (game.mode === 'menu') updateMenuCamera(dt);
  else if (game.mode === 'intro') updateIntro(dt);
  else if (game.mode === 'playing' && !game.paused) update(dt);
  else if (game.mode === 'playing' && game.paused) updateDoors(dt);
  if (game.mode === 'ending') { camera.rotation.z = Math.sin(now * 0.0004) * 0.006; }
  if (composer) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

/* ── Quality ─────────────────────────────────────────────────────────────── */
function applyQuality() {
  const high = game.quality === 'high';
  renderer.setPixelRatio(high ? Math.min(devicePixelRatio || 1, 1.5) : 1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = high;
  if (flashlight) flashlight.castShadow = high;
  scene.traverse(o => {
    if (o.isMesh && o.material && !o.material.transparent && o.geometry && !o.geometry.type.includes('Plane')) o.castShadow = high;
  });
  if (composer) { try { composer.dispose?.(); } catch {} composer = null; bloomPass = null; filmPass = null; }
  if (high) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.7, 0.24);
      composer.addPass(bloomPass);
      filmPass = new FilmPass(0.1, 0.08, 648, false);
      composer.addPass(filmPass);
      composer.addPass(new OutputPass());
    } catch (e) { console.warn('Post processing unavailable', e); composer = null; }
  }
  $$('[data-quality]').forEach(b => b.classList.toggle('selected', b.dataset.quality === game.quality));
}

/* ── Run lifecycle ───────────────────────────────────────────────────────── */
function prepareRun() {
  AudioSys.stopVoice();
  game.phase = 0; game.keys = [false, false, false]; game.storyDone = false; game.journalRead = false; game.cassettePlayed = false;
  game.power = false; game.breakers = [false, false]; game.breakerWindow = 0;
  game.elevatorCalled = false; game.hold = 0; game.escapeReady = false; game.detonation = null;
  game.health = 100; game.stamina = 100; game.fear = 0; game.battery = 70;
  game.flashlightOn = true; game.hasFlashlight = true; game.hasRadio = true;
  game.noise = 0; game.monsterAlert = 0; game.monsterState = 'dormant'; game.monsterDist = 99; game.monsterSeen = 0;
  game.down = false; game.revive = 0; game.deathTimer = 0; game.damageCd = 0; game.hurtFlash = 0;
  game.paused = false; game.ending = false; game.endingWon = false; game.elapsed = 0; game.introT = 0;
  game.talking = false; game.micNoise = 0; game.lowBatteryWarned = false; game.radioCd = 0;
  game.botCount = game.solo ? 0 : clamp(game.launchBots, 0, 3);
  player.pos.set(0, 0, 2.6); player.vel.set(0, 0, 0); player.yaw = Math.PI; player.pitch = 0;
  bob = 0; footTimer = 0; heartTimer = 0; growlTimer = 5; holdTarget = null; holdT = 0;
  buildWorld();
  if (flashlight) flashlight.intensity = game.flashlightOn ? FLASH_I : 0;
  if (flashlightFill) flashlightFill.intensity = game.flashlightOn ? FILL_I : 0;
  camera.position.set(0, player.eye, 2.6); camera.rotation.set(0, Math.PI, 0, 'YXZ');
  $('#game-ui').classList.toggle('immersive', game.solo);
  $('#game-ui').classList.toggle('coop', !game.solo);
  $('#objective-log').classList.remove('open');
  $('#pause-screen').classList.remove('show');
  $('#ending-screen').classList.remove('show');
  $('#down-overlay').classList.remove('show');
  $('#damage-vignette').style.opacity = '0';
  $('#fear-vignette').style.opacity = '0';
  $('#blood-overlay').style.opacity = '0';
  $('#pulse-overlay').style.opacity = '0';
  $('#timer-card').classList.remove('show');
  $('#interaction').classList.remove('show', 'holding');
  $('#subtitles-line').classList.remove('show');
  $('#objective-card').classList.remove('fade');
  updateEquipment();
  updateObjectives(true);
  updateSquadStatus();
}
function beginGame(prepared = false) {
  if (!prepared) prepareRun();
  game.mode = 'playing'; game.paused = false;
  document.body.classList.add('in-game');
  setScreen(null);
  $('#intro-screen').classList.remove('visible');
  $('#game-ui').classList.add('active');
  $('#loading').classList.add('hide');
  if (coarse) $('#touch-controls').classList.add('on');
  if (!coarse) { try { renderer.domElement.requestPointerLock?.(); } catch {} }
  showToast(tr('EINSATZ 04—17 · FUNKVERBINDUNG INSTABIL', 'OPERATION 04—17 · RADIO LINK UNSTABLE'), 3200);
  setTimeout(() => {
    if (game.mode === 'playing') {
      AudioSys.say('Northstar control, this is Operator. I am in the security office. The facility is dark. The night shift is not answering. Find the journal. Find the cards. Get to the lift.', { speaker: 'RADIO' });
    }
  }, 900);
  lastTime = performance.now();
  updateObjectives(true);
}
function beginIntro() {
  AudioSys.init();
  prepareRun();
  game.mode = 'intro'; game.introT = 0;
  setScreen('intro-screen');
  $('#game-ui').classList.remove('active');
  $('#touch-controls').classList.remove('on');
  $('#loading').classList.add('hide');
  document.exitPointerLock?.();
  player.pos.set(0, 0, 2.6); player.yaw = Math.PI; player.pitch = -0.035;
  camera.position.set(0, 1.68, 2.65);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  $('#intro-title').innerHTML = 'SOMEWHERE BELOW YOU,<br>IT IS ALREADY AWAKE.';
  $('#intro-text').innerHTML = 'The recorder clicks. A voice—hoarse, terrified—fills the dark.<br>“If the lights are dead, don\'t make a sound. It follows the noise.”';
  $('#intro-subtitle').textContent = '';
  const bar = $('#intro-screen .intro-progress span'); if (bar) bar.style.width = '0%';
  AudioSys.radioStatic(0.6);
  setTimeout(() => {
    if (game.mode !== 'intro') return;
    $('#intro-subtitle').textContent = '“If the lights are dead, don\'t make a sound. It follows the noise.”';
    AudioSys.say('If the lights are dead, do not make a sound. It follows the noise. Do not run. Do not let it get close.', { speaker: 'RECORDING' });
  }, 900);
  setTimeout(() => {
    if (game.mode !== 'intro') return;
    $('#intro-subtitle').textContent = '“The keycards are encrypted to separate sectors. Restore the main generator only after all three are recovered.”';
    AudioSys.say('The keycards are encrypted to separate sectors. Restore the main generator only after all three are recovered. The lift is our only way out.', { speaker: 'RECORDING' });
  }, 4700);
}
function quitToMenu() {
  game.mode = 'menu'; game.paused = false; game.ending = false;
  document.body.classList.remove('in-game');
  AudioSys.stopVoice();
  document.exitPointerLock?.();
  setScreen('main-menu');
  $('#game-ui').classList.remove('active');
  $('#touch-controls').classList.remove('on');
  $('#pause-screen').classList.remove('show');
  $('#ending-screen').classList.remove('show');
  $('#down-overlay').classList.remove('show');
  $('#intro-screen').classList.remove('visible');
  $('#objective-log').classList.remove('open');
  $('#loading').classList.add('hide');
  updateMenuCamera(0);
}
function retryRun() {
  $('#ending-screen').classList.remove('show');
  if (game.solo) beginGame();
  else launchRoom();
}
function setPaused(value) {
  if (game.mode !== 'playing') return;
  game.paused = value;
  $('#pause-screen').classList.toggle('show', value);
  if (value) { document.exitPointerLock?.(); game.touchInteractHeld = false; }
  else if (!coarse) { try { renderer.domElement.requestPointerLock?.(); } catch {} }
}

/* ── Localization / room UI ──────────────────────────────────────────────── */
function localize() {
  $$('[data-i18n]').forEach(n => { const k = n.dataset.i18n; if (translations[game.lang][k]) n.textContent = translations[game.lang][k]; });
  document.documentElement.lang = game.lang;
  updateEquipment();
  updateObjectives(true);
  updateMicStatus();
  const down = $('#down-copy'); if (down) down.textContent = t('downCopy');
  renderSquad();
}
function updateMicStatus() {
  const el = $('#mic-status'); if (!el) return;
  el.textContent = game.micReady ? t('micOn') : game.voiceOn ? t('micOn') : t('micOff');
  const btn = $('#mic-toggle');
  if (btn) { btn.classList.toggle('on', game.voiceOn); btn.textContent = game.voiceOn ? 'ON' : 'OFF'; }
}
function renderSquad() {
  const el = $('#squad-list'); if (!el) return;
  const rows = [];
  const players = game.roomPlayers.length ? game.roomPlayers : [{ name: '°-° KING LOOK.S', role: 'HOST · YOU', host: true, you: true, bot: false }];
  for (const p of players) {
    rows.push(`<div class="squad-member"><span class="online-dot ${p.bot ? 'bot-dot' : ''}"></span><b>${p.name}</b><small>${p.role || (p.bot ? 'AI OPERATIVE' : 'OPERATIVE')}</small></div>`);
  }
  for (let i = players.length; i < 4; i++) {
    rows.push(`<div class="squad-member waiting"><span>···</span><b>${i === players.length ? t('waitingOperator') : t('openSlot')}</b><small>—</small></div>`);
  }
  el.innerHTML = rows.join('');
  const code = $('#room-code'); if (code) code.textContent = game.roomCode || '----';
  const count = $('#squad-count'); if (count) count.textContent = String(players.length).padStart(2, '0');
}
function openRoom(mode, codeOverride) {
  const randCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  game.roomCode = codeOverride || (mode === 'offline' ? 'OFFL' : randCode());
  if (mode === 'host') {
    game.roomPlayers = [{ name: '°-° KING LOOK.S', role: 'HOST · YOU', host: true, you: true, bot: false }];
    $('#lobby-status').textContent = t('localRelay');
  } else if (mode === 'offline') {
    game.roomPlayers = [
      { name: '°-° KING LOOK.S', role: 'HOST · YOU', host: true, you: true, bot: false },
      { name: BOT_NAMES[0], role: 'AI FIELD MEDIC', bot: true },
    ];
    $('#lobby-status').textContent = t('botsReady');
  } else if (mode === 'quick') {
    game.roomPlayers = [
      { name: '°-° KING LOOK.S', role: 'HOST · YOU', host: true, you: true, bot: false },
      { name: BOT_NAMES[0], role: 'AI OPERATIVE · CONNECTED', bot: true },
      { name: BOT_NAMES[1], role: 'AI OPERATIVE · CONNECTED', bot: true },
    ];
    $('#lobby-status').textContent = t('foundSquad');
  } else if (mode === 'join') {
    game.roomPlayers = [
      { name: BOT_NAMES[1], role: 'HOST · CONNECTED', host: true, bot: true },
      { name: '°-° KING LOOK.S', role: 'OPERATIVE · YOU', you: true, bot: false },
      { name: BOT_NAMES[2], role: 'AI OPERATIVE · CONNECTED', bot: true },
    ];
    $('#lobby-status').textContent = t('codeLocal');
  }
  renderSquad();
  setScreen('room-screen');
  AudioSys.init();
}
function launchRoom() {
  const botPlayers = game.roomPlayers.filter(p => p.bot).length;
  game.launchBots = Math.min(3, botPlayers);
  game.solo = botPlayers === 0;
  game.botCount = game.launchBots;
  beginGame();
}
function startQuick() {
  $('#lobby-status').textContent = t('searchPublic');
  AudioSys.init(); AudioSys.radioStatic(0.4);
  setTimeout(() => { if (game.mode === 'menu') openRoom('quick'); }, 950);
}
function addBotsToRoom() {
  const names = BOT_NAMES.filter(n => !game.roomPlayers.some(p => p.name === n));
  while (game.roomPlayers.length < 4 && names.length) {
    const n = names.shift();
    game.roomPlayers.push({ name: n, role: 'AI OPERATIVE', bot: true });
  }
  $('#lobby-status').textContent = t('botsReady');
  renderSquad();
  AudioSys.tone(520, 0.08, 'sine', 0.03);
}
async function toggleMic() {
  AudioSys.init();
  if (game.voiceOn) {
    game.micStream?.getTracks().forEach(track => track.stop());
    game.micStream = null; game.micAnalyser = null; game.voiceOn = false; game.micReady = false; game.micNoise = 0;
    updateMicStatus();
    showToast(tr('Mikrofon deaktiviert. Push-to-talk bleibt aktiv.', 'Microphone disabled. Push-to-talk remains active.'), 2400);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    game.micStream = stream;
    const src = AudioSys.ctx.createMediaStreamSource(stream);
    const analyser = AudioSys.ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    game.micAnalyser = analyser; game.voiceOn = true; game.micReady = true;
    updateMicStatus();
    showToast(tr('Nähe-Sprachchat aktiv. Zu lautes Sprechen lockt die Kreatur an.', 'Proximity voice active. Speaking too loudly attracts the creature.'), 3600, 'good');
    AudioSys.say('Voice link open. Keep your voice down.', { speaker: 'RADIO' });
  } catch (e) {
    game.micReady = false;
    updateMicStatus();
    showToast(t('micDenied'), 3200, 'warn');
  }
}

/* ── UI wiring ───────────────────────────────────────────────────────────── */
function handleAction(action) {
  AudioSys.init();
  switch (action) {
    case 'intro': beginIntro(); break;
    case 'settings': setScreen('settings-screen'); break;
    case 'credits': localize(); setScreen('archive-screen'); break;
    case 'lobby': localize(); setScreen('lobby-screen'); break;
    case 'back': setScreen(game.mode === 'menu' ? 'main-menu' : 'lobby-screen'); break;
    case 'backLobby': setScreen('lobby-screen'); break;
    case 'host': openRoom('host'); break;
    case 'quick': startQuick(); break;
    case 'offline': openRoom('offline'); break;
    case 'launch': launchRoom(); break;
    case 'resume': setPaused(false); break;
    case 'quit': quitToMenu(); break;
    case 'menu': quitToMenu(); break;
    case 'retry': retryRun(); break;
  }
}
function setScreen(id) {
  $$('.screen').forEach(x => x.classList.remove('visible'));
  if (id) $('#' + id)?.classList.add('visible');
}
function wireUI() {
  document.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action) { handleAction(action); return; }
    const lang = e.target.closest('[data-lang]')?.dataset.lang;
    if (lang) {
      game.lang = lang;
      $$('[data-lang]').forEach(b => b.classList.toggle('selected', b.dataset.lang === lang));
      localize();
      return;
    }
    const quality = e.target.closest('[data-quality]')?.dataset.quality;
    if (quality) { game.quality = quality; applyQuality(); localize(); return; }
  });
  $('#skip-intro')?.addEventListener('click', () => { AudioSys.init(); beginGame(true); });
  $('#subtitle-toggle')?.addEventListener('click', e => {
    game.subtitles = !game.subtitles;
    e.currentTarget.classList.toggle('on', game.subtitles);
    e.currentTarget.classList.toggle('off', !game.subtitles);
    e.currentTarget.textContent = game.subtitles ? 'ON' : 'OFF';
    if (!game.subtitles) $('#subtitles-line').classList.remove('show');
  });
  $('#volume-slider')?.addEventListener('input', e => { AudioSys.init(); AudioSys.setVolume(Number(e.target.value) / 100); });
  $('#sensitivity-slider')?.addEventListener('input', e => { game.sensitivity = Number(e.target.value) / 80; });
  $('#mic-toggle')?.addEventListener('click', toggleMic);
  $('#sound-toggle')?.addEventListener('click', () => { AudioSys.init(); AudioSys.tone(440, 0.1, 'sine', 0.04); });
  $('#copy-code')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(game.roomCode); showToast(tr('Raumcode kopiert.', 'Room code copied.'), 1800, 'good'); }
    catch { showToast(game.roomCode); }
  });
  $('#fill-bots')?.addEventListener('click', addBotsToRoom);
  $('#join-button')?.addEventListener('click', () => {
    const code = ($('#join-code')?.value || '').trim().toUpperCase();
    if (code.length !== 4) { $('#lobby-status').textContent = t('noCode'); return; }
    openRoom('join', code);
  });
  $('#join-code')?.addEventListener('keydown', e => { if (e.code === 'Enter') $('#join-button')?.click(); });
  canvas.addEventListener('click', () => {
    if (game.mode === 'playing' && !game.paused && !coarse && !document.pointerLockElement) {
      try { renderer.domElement.requestPointerLock?.(); } catch {}
    }
  });
  document.addEventListener('pointerlockchange', () => {});
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === renderer.domElement && game.mode === 'playing' && !game.paused && !game.down) {
      const sens = game.sensitivity * 0.0021;
      player.yaw -= e.movementX * sens;
      player.pitch = clamp(player.pitch - e.movementY * sens, -1.45, 1.45);
    }
  });
  document.addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    keysDown.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Escape') { if (game.mode === 'playing') setPaused(!game.paused); return; }
    if (game.mode !== 'playing' || game.paused) return;
    if (e.code === 'KeyE') { tryInteract(); return; }
    if (e.code === 'KeyF') toggleFlashlight();
    if (e.code === 'KeyJ') { $('#objective-log').classList.toggle('open'); updateObjectives(true); }
    if (e.code === 'KeyQ') useRadio();
    if (e.code === 'KeyV') {
      game.talking = true; game.noise = 1;
      if (monster?.userData.active) monsterHears(0.8, player.pos.x, player.pos.z);
      AudioSys.noiseBurst(0.15, 0.03, 1400, 'bandpass');
    }
  });
  document.addEventListener('keyup', e => {
    keysDown.delete(e.code);
    if (e.code === 'KeyV') game.talking = false;
    if (e.code === 'KeyE') game.touchInteractHeld = false;
  });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    if (composer) composer.setSize(innerWidth, innerHeight);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'playing') setPaused(true); });
  setupTouch();
}
function setupTouch() {
  if (!coarse) return;
  const stick = $('#touch-stick'), knob = $('#touch-stick i'), look = $('#touch-look');
  let stickId = null, lookId = null, lastX = 0, lastY = 0;
  const moveStick = (e) => {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    game.touchMove.x = dx; game.touchMove.y = -dy;
    knob.style.transform = `translate(${dx * 26}px,${dy * 26}px)`;
  };
  stick?.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
  stick?.addEventListener('pointermove', e => { if (e.pointerId === stickId) moveStick(e); });
  const endStick = e => { if (e.pointerId !== stickId) return; stickId = null; game.touchMove.x = game.touchMove.y = 0; knob.style.transform = 'none'; };
  stick?.addEventListener('pointerup', endStick); stick?.addEventListener('pointercancel', endStick);
  look?.addEventListener('pointerdown', e => { lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY; look.setPointerCapture(e.pointerId); });
  look?.addEventListener('pointermove', e => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    player.yaw -= dx * 0.0042;
    player.pitch = clamp(player.pitch - dy * 0.0042, -1.45, 1.45);
  });
  const endLook = e => { if (e.pointerId === lookId) lookId = null; };
  look?.addEventListener('pointerup', endLook); look?.addEventListener('pointercancel', endLook);
  const inter = $('#touch-interact');
  inter?.addEventListener('pointerdown', e => { e.preventDefault(); game.touchInteractHeld = true; tryInteract(); });
  const endInter = () => { game.touchInteractHeld = false; };
  inter?.addEventListener('pointerup', endInter); inter?.addEventListener('pointercancel', endInter);
  $('#touch-flash')?.addEventListener('click', () => toggleFlashlight());
}

/* ── Boot ────────────────────────────────────────────────────────────────── */
applyQuality();
setupPlayerGear();
buildWorld();
localize();
wireUI();
updateMenuCamera(0);
$('#game-ui').classList.remove('active');
$('#loading').classList.add('hide');
lastTime = performance.now();
requestAnimationFrame(animate);

// Debug / test hooks (harmless in production; used by the build verification).
window.__facility = {
  game, player, camera, scene, renderer, colliders, interactables, doors, bots,
  get monster() { return monster; },
  beginGame, prepareRun, beginIntro, quitToMenu, applyQuality, updateObjectives,
  toggleFlashlight, tryDoor, collectKey, restorePower, useLiftPanel, boardElevator,
  openRoom, launchRoom, addBotsToRoom, setPaused,
  tp(x, z, yaw = 0) { player.pos.set(x, 0, z); player.yaw = yaw; camera.position.set(x, player.eye, z); },
  forcePower() { game.keys = [true, true, true]; game.breakers = [true, true]; restorePower(); },
  forceLift() { game.power = true; game.escapeReady = true; applyLiftState(); updateObjectives(true); },
};
