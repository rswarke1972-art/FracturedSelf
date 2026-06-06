// ==========================================
// FRACTURED SELF: DEFINITIVE EDITION ENGINE
// ==========================================

// ------------------------------------------
// ENGINE STATE
// ------------------------------------------
let storyData = [];
let currentScene = 0;
let isTyping = false;
let typingInterval = null;
let currentText = "";
let isAutoPlay = false;
let autoTimer = null;
let isSkipMode = false;
let isModalOpen = false;
let playTimeTimer = null;

// Game Statistics & Achievements
let stats = {
  playTime: 0,
  scenesRead: 0,
  choicesMade: 0,
  unlockedCGs: [],
  unlockedScenes: [],
  unlockedMusic: []
};

// Choice Flags System
let flags = {
  trust: 0,
  guilt: 0,
  hope: 0,
  fear: 0,
  relationship: 0
};

// Accessibility & UI Settings
let settings = {
  theme: 'dark',
  font: 'georgia',
  size: 'medium',
  speed: 'medium',
  autoSpeed: 2500,
  volume: 50,
  sfxVolume: 50,
  mute: false
};

// History for Back / Rewind state stack
let stateHistory = [];

// Dialogue Log Transcript (for History Modal)
let dialogueTranscript = [];

// Performance: Prefetch & Cache Manager
const PREFETCH_LIMIT = 5;
let preloadedImages = {}; // Map of src -> Image element to prevent GC

// Environmental Effects System
let activeEffect = "none";
let particleSystem = null;
let cancelParticleFrame = null;

// Choice Points Registry
const CHOICE_POINTS = {
  34: {
    question: "Do you believe you can change him?",
    options: [
      { text: "Yes, I will break his pride.", flags: { hope: 1, trust: -1 } },
      { text: "No, he is too far gone.", flags: { fear: 1, guilt: 1 } }
    ]
  },
  77: {
    question: "Sabah warns you about your father. What do you say?",
    options: [
      { text: "Tell her to mind her own business.", flags: { trust: 1, relationship: -1 } },
      { text: "Acknowledge the danger quietly.", flags: { guilt: 1, hope: 1 } }
    ]
  },
  130: {
    question: "Fawzy is calling you a useless boy. Your reaction:",
    options: [
      { text: "Defy him with silence and glare.", flags: { trust: -1, fear: 1 } },
      { text: "Speak submissively and apologize.", flags: { guilt: 1, relationship: 1 } }
    ]
  },
  394: {
    question: "You meet Haidy for the first time. How do you behave?",
    options: [
      { text: "Adopt an arrogant and flirtatious tone.", flags: { trust: -1, relationship: -1 } },
      { text: "Show respect and speak formally.", flags: { hope: 1, relationship: 1 } }
    ]
  },
  500: {
    question: "Do you regret the path of pride you have walked?",
    options: [
      { text: "Yes, I feel the weight of my mistakes.", flags: { guilt: 2, hope: 2 } },
      { text: "No, a king bows to no one.", flags: { trust: 2, fear: 2 } }
    ]
  }
};

// Environmental Keywords parser mapping
const ENVIRONMENTAL_KEYWORDS = [
  { keywords: ["rain", "storm", "wet", "cloudy", "cries", "halls"], effect: "rain" },
  { keywords: ["snow", "cold", "winter", "freeze", "white"], effect: "snow" },
  { keywords: ["dust", "particles", "glow", "fly", "mansion", "bed"], effect: "dust" },
  { keywords: ["fog", "mist", "smoke", "haze", "dim"], effect: "fog" }
];

// Audio Themes Configuration
const AUDIO_THEMES = {
  intro: { id: "intro", title: "Intro Theme" },
  chapter1: { id: "chapter1", title: "Chapter 1 Theme" },
  chapter2: { id: "chapter2", title: "Chapter 2 Theme" },
  tension: { id: "tension", title: "Regret (Tension)" }
};

// Web Audio API Synthesis state
let audioCtx = null;
let currentSynth = null;
let currentTrackId = null;

// DOM Elements cache
let primaryImg, secondaryImg, speakerName, storyText, continueIndicator, choiceContainer, choiceQuestion, choiceButtonsGrid, canvas, overlayFade;

// ------------------------------------------
// INITIALIZATION
// ------------------------------------------
window.addEventListener("load", () => {
  // Bind DOM elements
  primaryImg = document.getElementById("scene-image-primary");
  secondaryImg = document.getElementById("scene-image-secondary");
  speakerName = document.getElementById("speaker-name");
  storyText = document.getElementById("story-text");
  continueIndicator = document.getElementById("continue-indicator");
  choiceContainer = document.getElementById("choice-container");
  choiceQuestion = document.getElementById("choice-question");
  choiceButtonsGrid = document.getElementById("choice-buttons-grid");
  canvas = document.getElementById("immersion-canvas");
  overlayFade = document.getElementById("cinematic-overlay");

  // Prevent right clicks for cinematic visual novels
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // Load Saved Game Settings, Flags and Play statistics
  loadStateFromStorage();

  // Bind Keyboard controls
  setupKeyboardAccessibility();

  // Register main document click shielding logic
  document.addEventListener("click", (e) => {
    // If clicking on modals, HUD controls or choices, shield the background click
    if (isModalOpen || isChoiceActive() || e.target.closest(".hud-control-dock") || e.target.closest(".modal-box")) {
      return;
    }
    handleDialogueAdvance();
  });

  // Track player time in seconds
  playTimeTimer = setInterval(() => {
    if (!isModalOpen && !isChoiceActive()) {
      stats.playTime++;
      // Save stats occasionally
      if (stats.playTime % 10 === 0) {
        localStorage.setItem("fractured_self_stats", JSON.stringify(stats));
      }
    }
  }, 1000);

  // Setup environmental canvas size
  setupCanvasSize();
  window.addEventListener("resize", setupCanvasSize);

  // Start Loading the JSON script
  loadStory();

  // Register service worker if supported
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then((reg) => console.log('[Service Worker] Registered from story page:', reg.scope))
      .catch((err) => console.error('[Service Worker] Registration failed from story page:', err));
  }
});

// ------------------------------------------
// SAVED STATE DATABASE MANAGER
// ------------------------------------------
function loadStateFromStorage() {
  // 1. Settings
  const savedSettings = localStorage.getItem("fractured_self_settings");
  if (savedSettings) {
    try {
      settings = { ...settings, ...JSON.parse(savedSettings) };
    } catch (e) {}
  }
  applySettingsToDOM();

  // 2. Statistics
  const savedStats = localStorage.getItem("fractured_self_stats");
  if (savedStats) {
    try {
      stats = { ...stats, ...JSON.parse(savedStats) };
    } catch (e) {}
  } else {
    stats.unlockedCGs = ["assets/images/intro/scene1.webp"]; // Unlock first by default
    stats.unlockedMusic = ["intro"];
  }

  // 3. Choice Flags
  const savedFlags = localStorage.getItem("fractured_self_flags");
  if (savedFlags) {
    try {
      flags = { ...flags, ...JSON.parse(savedFlags) };
    } catch (e) {}
  }
}

function applySettingsToDOM() {
  document.body.className = `theme-${settings.theme} font-${settings.font} size-${settings.size}`;
  
  // Sync Settings Dialog inputs
  const fontSelect = document.getElementById("setting-font");
  if (fontSelect) fontSelect.value = settings.font;

  const themeRadios = document.getElementsByName("theme");
  themeRadios.forEach(radio => {
    radio.checked = (radio.value === settings.theme);
    const parentLabel = radio.closest(".theme-option");
    if (parentLabel) {
      parentLabel.classList.remove("active");
      if (radio.checked) parentLabel.classList.add("active");
    }
  });

  // Sync volume fields
  const volMusic = document.getElementById("setting-vol-music");
  if (volMusic) volMusic.value = settings.volume;
  const volMusicVal = document.getElementById("vol-music-val");
  if (volMusicVal) volMusicVal.textContent = `${settings.volume}%`;

  const volSfx = document.getElementById("setting-vol-sfx");
  if (volSfx) volSfx.value = settings.sfxVolume;
  const volSfxVal = document.getElementById("vol-sfx-val");
  if (volSfxVal) volSfxVal.textContent = `${settings.sfxVolume}%`;

  const muteCheck = document.getElementById("setting-mute");
  if (muteCheck) muteCheck.checked = settings.mute;

  // Delay slider
  const delaySec = (settings.autoSpeed / 1000).toFixed(1);
  const autoDelayInput = document.getElementById("setting-auto-delay");
  if (autoDelayInput) autoDelayInput.value = delaySec;
  const delayLabel = document.getElementById("delay-label");
  if (delayLabel) delayLabel.textContent = `${delaySec}s`;

  // Apply volume updates to current audio context
  updateSynthVolume();
}

function updateSettingsFromUI() {
  settings.font = document.getElementById("setting-font").value;
  settings.volume = parseInt(document.getElementById("setting-vol-music").value);
  settings.sfxVolume = parseInt(document.getElementById("setting-vol-sfx").value);
  settings.mute = document.getElementById("setting-mute").checked;

  const delayVal = parseFloat(document.getElementById("setting-auto-delay").value);
  settings.autoSpeed = Math.round(delayVal * 1000);

  localStorage.setItem("fractured_self_settings", JSON.stringify(settings));
  applySettingsToDOM();
}

function setThemeOption(theme) {
  settings.theme = theme;
  updateSettingsFromUI();
}

function setTextSizeOption(size) {
  settings.size = size;
  updateSettingsFromUI();
}

function setTextSpeedOption(speed) {
  settings.speed = speed;
  updateSettingsFromUI();
}

function updateDelayLabel(val) {
  const lbl = document.getElementById("delay-label");
  if (lbl) lbl.textContent = `${val}s`;
}

// ------------------------------------------
// AUDIO CONTROLLER (WEB AUDIO drone synth)
// ------------------------------------------
function getTrackFrequency(trackId) {
  switch (trackId) {
    case "intro": return 98.00; // G2 (Ethereal drone)
    case "chapter1": return 130.81; // C3 (Deeper, darker tone)
    case "chapter2": return 87.31; // F2 (Warm chord)
    case "tension": return 110.00; // A2 (Clashing friction drone)
    default: return 98.00;
  }
}

function playAmbientTrack(trackId) {
  if (settings.mute) return;
  if (currentTrackId === trackId && currentSynth) return;

  fadeAndStopCurrentTrack();

  currentTrackId = trackId;

  // Unlock audio context
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  // Record stats unlocked music
  if (!stats.unlockedMusic.includes(trackId)) {
    stats.unlockedMusic.push(trackId);
    localStorage.setItem("fractured_self_stats", JSON.stringify(stats));
  }

  const baseFreq = getTrackFrequency(trackId);

  // Setup oscillators
  const oscRoot = audioCtx.createOscillator();
  const oscSub = audioCtx.createOscillator();
  const oscFifth = audioCtx.createOscillator();
  const oscThird = audioCtx.createOscillator();

  const filter = audioCtx.createBiquadFilter();
  const gainNode = audioCtx.createGain();

  oscRoot.type = "triangle";
  oscSub.type = "sawtooth";
  oscFifth.type = "sine";
  oscThird.type = "triangle";

  oscRoot.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
  oscSub.frequency.setValueAtTime(baseFreq * 0.5, audioCtx.currentTime);
  oscFifth.frequency.setValueAtTime(baseFreq * 1.5, audioCtx.currentTime);

  const thirdMultiplier = (trackId === "chapter2") ? 1.25 : 1.2; // Major third vs Minor third
  oscThird.frequency.setValueAtTime(baseFreq * thirdMultiplier, audioCtx.currentTime);

  // Lowpass warm sound
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(400, audioCtx.currentTime);
  filter.Q.setValueAtTime(1, audioCtx.currentTime);

  // Detune for chorusing
  oscRoot.detune.setValueAtTime(-8, audioCtx.currentTime);
  oscFifth.detune.setValueAtTime(8, audioCtx.currentTime);

  // Connections
  oscRoot.connect(filter);
  oscSub.connect(filter);
  oscFifth.connect(filter);
  oscThird.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // Vol gain envelopes
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  const volumeFactor = settings.volume / 100;
  const targetGain = volumeFactor * 0.12;
  gainNode.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 3.0); // 3 second crossfade

  oscRoot.start();
  oscSub.start();
  oscFifth.start();
  oscThird.start();

  currentSynth = {
    ctx: audioCtx,
    nodes: [oscRoot, oscSub, oscFifth, oscThird],
    gainNode: gainNode,
    targetVolume: targetGain
  };
}

function updateSynthVolume() {
  if (currentSynth && currentSynth.gainNode) {
    const volumeFactor = settings.mute ? 0 : (settings.volume / 100);
    const targetGain = volumeFactor * 0.12;
    currentSynth.gainNode.gain.setValueAtTime(currentSynth.gainNode.gain.value, currentSynth.ctx.currentTime);
    currentSynth.gainNode.gain.linearRampToValueAtTime(targetGain, currentSynth.ctx.currentTime + 0.3);
  }
}

function fadeAndStopCurrentTrack() {
  if (currentSynth) {
    const localSynth = currentSynth;
    localSynth.gainNode.gain.setValueAtTime(localSynth.gainNode.gain.value, localSynth.ctx.currentTime);
    localSynth.gainNode.gain.linearRampToValueAtTime(0, localSynth.ctx.currentTime + 2.0); // fade out over 2s
    setTimeout(() => {
      try {
        localSynth.nodes.forEach(n => n.stop());
      } catch (e) {}
    }, 2100);
    currentSynth = null;
  }
}

function playTypewriterClickSound() {
  if (settings.mute || settings.sfxVolume === 0) return;
  try {
    const sfxCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = sfxCtx.createOscillator();
    const gain = sfxCtx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200 + Math.random() * 400, sfxCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, sfxCtx.currentTime + 0.04);
    
    gain.gain.setValueAtTime((settings.sfxVolume / 100) * 0.02, sfxCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, sfxCtx.currentTime + 0.04);
    
    osc.connect(gain);
    gain.connect(sfxCtx.destination);
    
    osc.start();
    osc.stop(sfxCtx.currentTime + 0.05);
  } catch (e) {}
}

function playChoiceClickSound() {
  if (settings.mute || settings.sfxVolume === 0) return;
  try {
    const sfxCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = sfxCtx.createOscillator();
    const gain = sfxCtx.createGain();
    
    osc.type = "triangle";
    osc.frequency.setValueAtTime(330, sfxCtx.currentTime);
    osc.frequency.setValueAtTime(440, sfxCtx.currentTime + 0.08);
    
    gain.gain.setValueAtTime((settings.sfxVolume / 100) * 0.1, sfxCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, sfxCtx.currentTime + 0.25);
    
    osc.connect(gain);
    gain.connect(sfxCtx.destination);
    
    osc.start();
    osc.stop(sfxCtx.currentTime + 0.3);
  } catch (e) {}
}

// ------------------------------------------
// SCRIPT LOAD ENGINE
// ------------------------------------------
async function loadStory() {
  try {
    const response = await fetch("stories.json");
    const data = await response.json();

    storyData = [
      ...data.intro,
      ...data.chapter1,
      ...data.chapter2
    ];

    // Determine initial index
    const params = new URLSearchParams(window.location.search);
    const startParam = params.get("start");
    const loadParam = params.get("load");

    if (loadParam === "autosave") {
      const autosaveData = localStorage.getItem("fractured_self_autosave");
      if (autosaveData) {
        const state = JSON.parse(autosaveData);
        currentScene = state.currentScene || 0;
        flags = state.flags || flags;
        stateHistory = state.stateHistory || [];
      }
    } else if (startParam !== null) {
      currentScene = parseInt(startParam) || 0;
    } else {
      // Look for current local session
      const tempState = localStorage.getItem("fractured_self_current_state");
      if (tempState) {
        const state = JSON.parse(tempState);
        currentScene = state.currentScene || 0;
        flags = state.flags || flags;
        stateHistory = state.stateHistory || [];
      }
    }

    // Load initial scene
    showScene();

  } catch (error) {
    console.error("Failed to load story script:", error);
    storyText.textContent = "Error loading story script JSON. Please check manifest configuration.";
  }
}

// ------------------------------------------
// VISUAL NOVEL SCENE RENDERER
// ------------------------------------------
function showScene(isRewind = false) {
  if (storyData.length === 0) return;

  const scene = storyData[currentScene];

  if (!scene) {
    // End of visual novel: Cinematic black transition to Outro
    triggerCinematicBlackFade(() => {
      window.location.href = "outro.html";
    });
    return;
  }

  // Pre-load next assets for performance queue
  preloadNextImages();

  // Dynamic Audio tracks logic based on chapters
  handleDynamicAudioTracks(currentScene);

  // Dynamic Environmental particles canvas trigger
  handleEnvironmentalEffects(scene);

  // Render cross-faded image
  renderSceneImage(scene.image);

  // Speaker Badge Display
  if (scene.speaker === "") {
    speakerName.parentElement.style.display = "none";
  } else {
    speakerName.parentElement.style.display = "inline-block";
    speakerName.textContent = scene.speaker;
    
    // Add tiny slide-in bounce effect to speaker tag if not rewinding
    if (!isRewind) {
      speakerName.parentElement.classList.remove("pop-tag");
      void speakerName.parentElement.offsetWidth; // reflow trigger
      speakerName.parentElement.classList.add("pop-tag");
    }
  }

  // Reset typewriter indicators
  continueIndicator.classList.remove("visible");

  // Load dialogue history transcript
  const entry = { speaker: scene.speaker || "Narrator", text: scene.text };
  dialogueTranscript.push(entry);
  if (dialogueTranscript.length > 80) dialogueTranscript.shift();

  // Typewriter presentation
  startTypewriterText(scene.text, isRewind);

  // Update read statistics and autosaves
  if (!stats.unlockedScenes.includes(currentScene)) {
    stats.unlockedScenes.push(currentScene);
    stats.scenesRead = stats.unlockedScenes.length;
    localStorage.setItem("fractured_self_stats", JSON.stringify(stats));
  }

  // Add CG to gallery unlocks list if not already there
  if (scene.image && !stats.unlockedCGs.includes(scene.image)) {
    stats.unlockedCGs.push(scene.image);
    localStorage.setItem("fractured_self_stats", JSON.stringify(stats));
  }

  // Trigger Local Storage Autosave
  triggerAutosave();
}

// DUAL IMAGE CROSS-FADER
function renderSceneImage(newSrc) {
  const activeImg = primaryImg.classList.contains("active") ? primaryImg : secondaryImg;
  const inactiveImg = activeImg === primaryImg ? secondaryImg : primaryImg;

  // If source is already correct, do nothing
  if (activeImg.src.includes(newSrc)) return;

  // Prepare next image
  inactiveImg.src = newSrc;

  // When image finishes downloading, trigger the smooth opacity fade transition
  inactiveImg.onload = () => {
    activeImg.classList.remove("active");
    inactiveImg.classList.add("fade-out-image"); // optional extra class
    inactiveImg.classList.add("active");
    inactiveImg.classList.remove("fade-out-image");
  };

  // Safe timeout in case network fails to trigger onload
  setTimeout(() => {
    if (!inactiveImg.classList.contains("active")) {
      activeImg.classList.remove("active");
      inactiveImg.classList.add("active");
    }
  }, 1500);
}

// ------------------------------------------
// ENVIRONMENTAL PARTICLES CANVAS SYSTEM
// ------------------------------------------
function handleEnvironmentalEffects(scene) {
  let targetEffect = "none";

  // Check scene text for keywords matching effects
  const textLower = scene.text.toLowerCase();
  for (const mapping of ENVIRONMENTAL_KEYWORDS) {
    if (mapping.keywords.some(word => textLower.includes(word))) {
      targetEffect = mapping.effect;
      break;
    }
  }

  // Override or check chapters
  if (targetEffect === "none") {
    if (currentScene >= 0 && currentScene < 35) targetEffect = "dust";
    else if (currentScene >= 35 && currentScene < 80) targetEffect = "fog";
    else if (currentScene >= 110 && currentScene < 135) targetEffect = "vignette"; // high drama
  }

  setEnvironmentalEffect(targetEffect);
}

function setupCanvasSize() {
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}

function setEnvironmentalEffect(effectName) {
  if (activeEffect === effectName) return;
  activeEffect = effectName;

  // Clear previous animation loop
  if (cancelParticleFrame) {
    cancelAnimationFrame(cancelParticleFrame);
    cancelParticleFrame = null;
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (effectName === "none") {
    return;
  }

  const particles = [];
  let maxParticles = 60;

  if (effectName === "rain") {
    maxParticles = 100;
    for (let i = 0; i < maxParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        len: Math.random() * 20 + 10,
        yspeed: Math.random() * 8 + 6,
        xspeed: -2
      });
    }
  } else if (effectName === "snow") {
    maxParticles = 50;
    for (let i = 0; i < maxParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 3 + 1,
        d: Math.random() * maxParticles,
        yspeed: Math.random() * 1.5 + 0.5,
        xspeed: Math.random() * 1 - 0.5
      });
    }
  } else if (effectName === "dust") {
    maxParticles = 40;
    for (let i = 0; i < maxParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        yspeed: Math.random() * -0.5 - 0.1,
        xspeed: Math.random() * 0.4 - 0.2,
        alpha: Math.random() * 0.5 + 0.2
      });
    }
  } else if (effectName === "fog") {
    maxParticles = 4;
    for (let i = 0; i < maxParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width - canvas.width * 0.5,
        y: canvas.height * 0.6 + Math.random() * canvas.height * 0.4,
        vx: Math.random() * 0.3 + 0.1,
        size: Math.random() * 400 + 300,
        alpha: Math.random() * 0.15 + 0.05
      });
    }
  }

  function renderParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (effectName === "rain") {
      ctx.strokeStyle = "rgba(174, 194, 224, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < maxParticles; i++) {
        const p = particles[i];
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.xspeed, p.y + p.len);
        
        p.y += p.yspeed;
        p.x += p.xspeed;

        if (p.y > canvas.height) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      }
      ctx.stroke();
    } else if (effectName === "snow") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.beginPath();
      for (let i = 0; i < maxParticles; i++) {
        const p = particles[i];
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2, true);

        p.y += p.yspeed;
        p.x += p.xspeed;

        if (p.y > canvas.height) {
          p.y = -10;
          p.x = Math.random() * canvas.width;
        }
      }
      ctx.fill();
    } else if (effectName === "dust") {
      ctx.fillStyle = "rgba(212, 175, 55, 0.35)"; // Gold sparkles
      ctx.beginPath();
      for (let i = 0; i < maxParticles; i++) {
        const p = particles[i];
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2, true);

        p.y += p.yspeed;
        p.x += p.xspeed;

        if (p.y < 0) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
        }
      }
      ctx.fill();
    } else if (effectName === "fog") {
      for (let i = 0; i < maxParticles; i++) {
        const p = particles[i];
        const grad = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, p.size);
        grad.addColorStop(0, `rgba(180, 180, 180, ${p.alpha})`);
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        p.x += p.vx;
        if (p.x > canvas.width + p.size) {
          p.x = -p.size;
        }
      }
    }

    cancelParticleFrame = requestAnimationFrame(renderParticles);
  }

  renderParticles();
}

// ------------------------------------------
// AUDIO THEME MANAGER
// ------------------------------------------
function handleDynamicAudioTracks(sceneIndex) {
  // Prologue
  if (sceneIndex >= 0 && sceneIndex < 35) {
    playAmbientTrack("intro");
  } 
  // Chapter 1
  else if (sceneIndex >= 35 && sceneIndex < 226) {
    // Fawzy confrontation tension track
    if (sceneIndex >= 110 && sceneIndex < 135) {
      playAmbientTrack("tension");
    } else {
      playAmbientTrack("chapter1");
    }
  } 
  // Chapter 2
  else if (sceneIndex >= 226) {
    playAmbientTrack("chapter2");
  }
}

// ------------------------------------------
// TYPEWRITER ENGINE
// ------------------------------------------
function getTypewriterDelay() {
  switch (settings.speed) {
    case "slow": return 55;
    case "medium": return 28;
    case "fast": return 10;
    case "instant": return 0;
    default: return 28;
  }
}

function startTypewriterText(text, instantReveal = false) {
  clearInterval(typingInterval);
  isTyping = true;
  currentText = text;
  storyText.textContent = "";

  const delay = getTypewriterDelay();

  if (instantReveal || delay === 0 || isSkipMode) {
    completeTypewriter();
    return;
  }

  let charIndex = 0;
  
  typingInterval = setInterval(() => {
    if (charIndex < text.length) {
      storyText.textContent += text.charAt(charIndex);
      // Play a very quick keyboard tick sound for immersion
      if (charIndex % 3 === 0) {
        playTypewriterClickSound();
      }
      charIndex++;
    } else {
      completeTypewriter();
    }
  }, delay);
}

function completeTypewriter() {
  clearInterval(typingInterval);
  storyText.textContent = currentText;
  isTyping = false;
  continueIndicator.classList.add("visible");
  
  // Trigger Auto play timing if auto mode is enabled
  if (isAutoPlay) {
    startAutoPlayTimer();
  }
}

// ------------------------------------------
// DIALOGUE CONTROLLER & SHIELDS
// ------------------------------------------
function handleDialogueAdvance() {
  // If typing: clicking completes text
  if (isTyping) {
    completeTypewriter();
    return;
  }

  // If choice is active, block advances
  if (isChoiceActive()) return;

  // Before advancing, push state onto back rewind history stack
  stateHistory.push({
    sceneIndex: currentScene,
    flags: { ...flags }
  });
  if (stateHistory.length > 50) stateHistory.shift();

  // If next scene has choice point, trigger choices
  if (CHOICE_POINTS[currentScene + 1]) {
    currentScene++;
    showChoiceModal(CHOICE_POINTS[currentScene]);
    return;
  }

  currentScene++;
  showScene();
}

function rewindScene() {
  if (stateHistory.length === 0 || isChoiceActive()) return;

  const prevState = stateHistory.pop();
  currentScene = prevState.sceneIndex;
  flags = prevState.flags;

  // Disable auto/skip modes on rewind
  disableAutoAndSkip();

  // Load screen immediately without scrolling transition
  showScene(true);
}

// ------------------------------------------
// DYNAMIC CHOICE MODAL OVERLAYS
// ------------------------------------------
function isChoiceActive() {
  return !choiceContainer.classList.contains("hidden");
}

function showChoiceModal(choiceData) {
  disableAutoAndSkip();
  
  // Hide advance arrows
  continueIndicator.classList.remove("visible");

  choiceQuestion.textContent = choiceData.question;
  choiceButtonsGrid.innerHTML = "";

  choiceData.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn glass-panel ripple";
    btn.textContent = opt.text;
    btn.onclick = () => selectChoiceOption(opt);
    choiceButtonsGrid.appendChild(btn);
  });

  choiceContainer.classList.remove("hidden");
  
  // Make speaker box blank during choices
  speakerName.parentElement.style.display = "none";
  storyText.textContent = "...";
}

function selectChoiceOption(option) {
  playChoiceClickSound();
  choiceContainer.classList.add("hidden");

  // Modify Flags
  if (option.flags) {
    for (const key in option.flags) {
      if (flags[key] !== undefined) {
        flags[key] += option.flags[key];
      }
    }
  }

  stats.choicesMade++;
  localStorage.setItem("fractured_self_stats", JSON.stringify(stats));
  localStorage.setItem("fractured_self_flags", JSON.stringify(flags));

  // Advance scene
  currentScene++;
  showScene();
}

// ------------------------------------------
// AUTOMODE & SKIP MODE MANAGER
// ------------------------------------------
function toggleAutoPlay() {
  isAutoPlay = !isAutoPlay;
  const autoBtn = document.getElementById("hud-auto");

  if (isAutoPlay) {
    isSkipMode = false;
    document.getElementById("hud-skip").classList.remove("active-mode");
    autoBtn.classList.add("active-mode");
    autoBtn.textContent = "⏸ Auto";
    
    if (!isTyping) {
      startAutoPlayTimer();
    }
  } else {
    autoBtn.classList.remove("active-mode");
    autoBtn.textContent = "▶ Auto";
    clearTimeout(autoTimer);
  }
}

function startAutoPlayTimer() {
  clearTimeout(autoTimer);
  if (!isAutoPlay || isTyping) return;

  autoTimer = setTimeout(() => {
    handleDialogueAdvance();
  }, settings.autoSpeed);
}

function toggleSkip() {
  isSkipMode = !isSkipMode;
  const skipBtn = document.getElementById("hud-skip");

  if (isSkipMode) {
    isAutoPlay = false;
    document.getElementById("hud-auto").classList.remove("active-mode");
    document.getElementById("hud-auto").textContent = "▶ Auto";
    clearTimeout(autoTimer);

    skipBtn.classList.add("active-mode");
    
    // In skip mode, we advance extremely fast
    skipDialogueLoop();
  } else {
    skipBtn.classList.remove("active-mode");
  }
}

function skipDialogueLoop() {
  if (!isSkipMode || isChoiceActive()) return;

  if (isTyping) {
    completeTypewriter();
  }
  
  setTimeout(() => {
    if (isSkipMode && !isChoiceActive()) {
      handleDialogueAdvance();
      skipDialogueLoop();
    }
  }, 120); // 120ms tick rate for fast skip
}

function disableAutoAndSkip() {
  isAutoPlay = false;
  isSkipMode = false;
  clearTimeout(autoTimer);

  const autoBtn = document.getElementById("hud-auto");
  if (autoBtn) {
    autoBtn.classList.remove("active-mode");
    autoBtn.textContent = "▶ Auto";
  }

  const skipBtn = document.getElementById("hud-skip");
  if (skipBtn) {
    skipBtn.classList.remove("active-mode");
  }
}

// ------------------------------------------
// AUTOSAVE & STATE STORAGE
// ------------------------------------------
function triggerAutosave() {
  // Current chapter calculation
  let chapterName = "Prologue";
  if (currentScene >= 35 && currentScene < 226) chapterName = "Chapter I";
  else if (currentScene >= 226) chapterName = "Chapter II";

  const autosaveState = {
    currentScene: currentScene,
    date: new Date().toISOString(),
    chapterName: chapterName,
    flags: flags,
    stateHistory: stateHistory
  };

  localStorage.setItem("fractured_self_autosave", JSON.stringify(autosaveState));
  // Keep local session pointer
  localStorage.setItem("fractured_self_current_state", JSON.stringify(autosaveState));
}

// ------------------------------------------
// SAVES & LOADS OVERLAYS SLOTS ENGINE
// ------------------------------------------
function openSaveModal() {
  disableAutoAndSkip();
  populateSaveSlotUI("save");
  openStoryModal("modal-save");
}

function openLoadModal() {
  disableAutoAndSkip();
  populateSaveSlotUI("load");
  openStoryModal("modal-load");
}

function populateSaveSlotUI(prefix) {
  for (let i = 1; i <= 3; i++) {
    const slotData = localStorage.getItem(`fractured_self_slot_${i}`);
    const box = document.getElementById(`${prefix}-slot-${i}-info`);
    if (box) {
      if (slotData) {
        const state = JSON.parse(slotData);
        const dateStr = new Date(state.date).toLocaleString();
        box.innerHTML = `<span class="slot-desc">${state.chapterName} - Scene ${state.currentScene}</span><br><span class="slot-time">${dateStr}</span>`;
      } else {
        box.innerHTML = `<span class="slot-empty">Empty Slot</span>`;
      }
    }
  }
}

function saveToSlot(slotId) {
  let chapterName = "Prologue";
  if (currentScene >= 35 && currentScene < 226) chapterName = "Chapter I";
  else if (currentScene >= 226) chapterName = "Chapter II";

  const saveState = {
    currentScene: currentScene,
    date: new Date().toISOString(),
    chapterName: chapterName,
    flags: flags,
    stateHistory: stateHistory
  };

  localStorage.setItem(`fractured_self_slot_${slotId}`, JSON.stringify(saveState));
  playChoiceClickSound();
  closeStoryModal("modal-save");
}

function loadFromSlot(slotId) {
  const slotData = localStorage.getItem(`fractured_self_slot_${slotId}`);
  if (!slotData) {
    alert("This slot is empty!");
    return;
  }

  const state = JSON.parse(slotData);
  currentScene = state.currentScene;
  flags = state.flags || flags;
  stateHistory = state.stateHistory || [];

  playChoiceClickSound();
  closeStoryModal("modal-load");
  
  // Render
  showScene(true);
}

// ------------------------------------------
// MODAL PRESENTERS
// ------------------------------------------
function openStoryModal(id) {
  disableAutoAndSkip();
  isModalOpen = true;
  document.getElementById(id).classList.add("active");

  if (id === "modal-history") {
    populateDialogueTranscriptHistory();
  }
}

function closeStoryModal(id) {
  document.getElementById(id).classList.remove("active");
  isModalOpen = false;
}

function closeStoryModalOnBackdrop(e) {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("active");
    isModalOpen = false;
  }
}

function confirmExitMenu() {
  openStoryModal("modal-confirm");
}

function exitToMenu() {
  clearInterval(playTimeTimer);
  fadeAndStopCurrentTrack();
  document.body.style.opacity = "0";
  setTimeout(() => {
    window.location.href = "index.html";
  }, 400);
}

// TRANSCRIPT LOGGER
function populateDialogueTranscriptHistory() {
  const box = document.getElementById("history-modal-body");
  if (!box) return;
  box.innerHTML = "";

  if (dialogueTranscript.length === 0) {
    box.innerHTML = `<div style="text-align:center; padding: 20px; color: #888;">No history recorded yet.</div>`;
    return;
  }

  dialogueTranscript.forEach((t) => {
    const p = document.createElement("p");
    p.className = "history-log-item";
    
    const speakerText = t.speaker ? `<strong class="text-gold">${t.speaker}:</strong> ` : `<em>Narrator:</em> `;
    p.innerHTML = `${speakerText} ${t.text}`;
    box.appendChild(p);
  });

  // Scroll to bottom
  setTimeout(() => {
    box.scrollTop = box.scrollHeight;
  }, 100);
}

// ------------------------------------------
// CINEMATIC FADES
// ------------------------------------------
function triggerCinematicBlackFade(callback) {
  overlayFade.classList.remove("fade-out");
  overlayFade.classList.add("fade-in");
  setTimeout(() => {
    if (callback) callback();
  }, 1200);
}

// ------------------------------------------
// PERFORMANCE PREFETCH & CACHE MANAGER
// ------------------------------------------
function preloadNextImages() {
  if (storyData.length === 0) return;

  for (let i = 1; i <= PREFETCH_LIMIT; i++) {
    const nextScene = storyData[currentScene + i];
    if (nextScene && nextScene.image) {
      const src = nextScene.image;
      // If not already preloaded, cache it
      if (!preloadedImages[src]) {
        const img = new Image();
        img.src = src;
        preloadedImages[src] = img;

        // Maintain clean memory size, purge older items if exceeds limits
        const keys = Object.keys(preloadedImages);
        if (keys.length > 15) {
          delete preloadedImages[keys[0]];
        }
      }
    }
  }
}

// ------------------------------------------
// KEYBOARD CONTROLS (ACCESSIBILITY)
// ------------------------------------------
function setupKeyboardAccessibility() {
  document.addEventListener("keydown", (e) => {
    if (isModalOpen) {
      if (e.key === "Escape") {
        // Close all active modals
        const activeModals = document.querySelectorAll(".modal-overlay.active");
        activeModals.forEach(m => closeStoryModal(m.id));
      }
      return;
    }

    // Story hotkeys
    switch (e.key) {
      case " ":
      case "Enter":
      case "ArrowRight":
        e.preventDefault();
        handleDialogueAdvance();
        break;
      case "ArrowLeft":
        e.preventDefault();
        rewindScene();
        break;
      case "Escape":
        e.preventDefault();
        openStoryModal("modal-settings");
        break;
      case "h":
      case "H":
        openStoryModal("modal-history");
        break;
      case "a":
      case "A":
        toggleAutoPlay();
        break;
    }
  });
}