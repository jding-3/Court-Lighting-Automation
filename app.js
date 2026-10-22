/**
 * Tennis Court Motion Lighting — Simulation Logic
 * Clean, natural design without emojis.
 * Features:
 *  - Theme adjuster to switch between Light and Dark modes
 *  - Accurate relative day bar tickers: 12 PM left, 6 PM middle, 12 AM right, and relative curfew
 *  - Dragging time to curfew and back automatically turns lights back on
 *  - Dynamic curfew time highlight outlined in red matching user-configured time
 *  - Dual-player reliable bench placement & 10m countdown
 *  - 1-minute warning dim with 3s notification & persistent on-screen countdown
 *  - Movement interruption restores 100% illumination
 */

// ============================================================================
// 1. Procedural Audio Engine
// ============================================================================
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio not available:', e);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  playClick() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(350, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playTennisHit() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(105, now + 0.06);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playChime(isUrgent = false) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const f1 = isUrgent ? 587.33 : 523.25;
    const f2 = isUrgent ? 440.00 : 659.25;

    [{ freq: f1, delay: 0 }, { freq: f2, delay: 0.14 }].forEach(t => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(t.freq, now + t.delay);

      gain.gain.setValueAtTime(0.001, now + t.delay);
      gain.gain.linearRampToValueAtTime(0.14, now + t.delay + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.delay + 0.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + t.delay);
      osc.stop(now + t.delay + 0.5);
    });
  }

  playLightsOnHum() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(65, now);
    osc.frequency.linearRampToValueAtTime(130, now + 0.8);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.3);
    gain.gain.linearRampToValueAtTime(0.001, now + 1.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 1.2);
  }

  playPowerDown() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.4);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }
}

// ============================================================================
// 2. Application State Store
// ============================================================================
const state = {
  // Theme state: 'dark' or 'light'
  currentTheme: 'dark',

  // Configurable Parameters
  autoOffTimeMinutes: 1320, // 22:00 = 10:00 PM default
  inactivityWaitMinutes: 10, // 10 minutes wait before dimming
  dimGracePeriodSeconds: 60, // Exactly 1 minute (60s) of warning dim

  // Current Simulated Time
  currentTimeMinutes: 1290, // 9:30 PM default

  // Curfew Shutoff State Tracking
  turnedOffByCurfew: false,

  // Lighting System State: 'FULL' (100%), 'DIM' (30%), 'OFF' (0%)
  lightStatus: 'FULL',

  // Countdown Timers
  inactivityRemainingSeconds: 600, // 10 minutes countdown
  dimRemainingSeconds: 60, // 1-minute dim countdown
  isBenchCountdownActive: false, // Tracks if players are idle on bench

  // Alert Timer Ref (for 3-second auto dismiss)
  alertDismissTimer: null,

  // Draggable Player Positions (Bench is at x: 310 to 490, y: 18 to 50)
  players: {
    p1: { x: 230, y: 250, onBench: false },
    p2: { x: 570, y: 250, onBench: false }
  },

  rallyActive: false
};

const audio = new AudioEngine();

// ============================================================================
// 3. Theme Toggle & User Input Handlers
// ============================================================================
function setupThemeToggle() {
  const themeBtn = document.getElementById('btn-theme-toggle');
  const sunIcon = document.getElementById('icon-theme-sun');
  const moonIcon = document.getElementById('icon-theme-moon');
  const themeLabel = document.getElementById('theme-label');

  // Check saved theme
  const savedTheme = localStorage.getItem('court-sim-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    state.currentTheme = savedTheme;
  }
  applyTheme(state.currentTheme);

  themeBtn.addEventListener('click', () => {
    audio.playClick();
    state.currentTheme = state.currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('court-sim-theme', state.currentTheme);
    applyTheme(state.currentTheme);
  });

  function applyTheme(theme) {
    const isLight = theme === 'light';
    document.body.classList.toggle('theme-light', isLight);
    document.body.classList.toggle('theme-night', !isLight);

    if (isLight) {
      // Light theme: display Sun icon
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
      themeLabel.textContent = 'Theme: Light';
    } else {
      // Dark theme: display Moon icon
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
      themeLabel.textContent = 'Theme: Dark';
    }
  }
}

function setupUserInputs() {
  // 1. Scheduled Auto-Off Time Input
  const autoOffInput = document.getElementById('input-auto-off-time');
  autoOffInput.addEventListener('change', (e) => {
    audio.playClick();
    const [h, m] = e.target.value.split(':').map(Number);
    state.autoOffTimeMinutes = (h * 60) + m;
    
    // Dynamically update the red curfew highlight and relative position on the whole day bar
    updateCurfewHighlightUI();
    updateLightingAndEnvironment();
  });

  // 2. Inactivity Wait Duration Input
  const inactivityInput = document.getElementById('input-inactivity-wait');
  inactivityInput.addEventListener('change', (e) => {
    audio.playClick();
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 60) val = 60;
    state.inactivityWaitMinutes = val;
    e.target.value = val;
    state.inactivityRemainingSeconds = val * 60;
    updateLightingAndEnvironment();
  });

  // 3. Time Slider Scrubber
  const timeSlider = document.getElementById('time-slider');
  timeSlider.addEventListener('input', (e) => {
    state.currentTimeMinutes = parseInt(e.target.value, 10);
    updateLightingAndEnvironment();
  });

  // Relative Ticks listener (12 PM left, 6 PM middle, 12 AM right, Curfew relative)
  const ticksContainer = document.getElementById('slider-ticks');
  ticksContainer.addEventListener('click', (e) => {
    const tick = e.target.closest('span[data-val]');
    if (!tick) return;
    audio.playClick();
    const val = parseInt(tick.getAttribute('data-val'), 10);
    state.currentTimeMinutes = val;
    timeSlider.value = val;
    updateLightingAndEnvironment();
  });

  // 4. Audio Mute Toggle
  document.getElementById('btn-audio-toggle').addEventListener('click', () => {
    const isMuted = audio.toggleMute();
    document.getElementById('icon-sound-on').classList.toggle('hidden', isMuted);
    document.getElementById('icon-sound-off').classList.toggle('hidden', !isMuted);
    document.getElementById('sound-label').textContent = isMuted ? 'Audio: OFF' : 'Audio: ON';
  });

  // 5. Alert Quick Button ("Move Player")
  document.getElementById('btn-quick-move-alert').addEventListener('click', () => {
    triggerPlayerMovement();
  });
}

// Dynamically update red curfew highlights and position relative to the whole day bar
function updateCurfewHighlightUI() {
  const curfewMin = state.autoOffTimeMinutes;
  const formattedCurfew = formatMinutesTo12Hour(curfewMin);

  // Slider range: min=720 (12:00 PM), max=1440 (12:00 AM Midnight), span = 720 minutes
  const clamped = Math.max(720, Math.min(1440, curfewMin));
  const pct = ((clamped - 720) / 720) * 100;

  // 1. Update the Curfew Tick mark position and label relative to the whole day bar
  const curfewTick = document.getElementById('tick-curfew');
  if (curfewTick) {
    curfewTick.style.left = `${pct}%`;
    curfewTick.setAttribute('data-val', curfewMin);
    curfewTick.textContent = `${formattedCurfew} (Curfew)`;

    // Adjust horizontal anchor so tick never clips on far edges
    const shift = pct > 88 ? -85 : (pct < 12 ? -15 : -50);
    curfewTick.style.transform = `translateX(${shift}%)`;
  }

  // 2. Position the Red Curfew Pin on the slider track
  const marker = document.getElementById('curfew-marker');
  if (marker) {
    marker.style.left = `${pct}%`;
    marker.setAttribute('title', `Curfew: ${formattedCurfew}`);
  }

  // 3. Highlight the input field
  const autoOffInput = document.getElementById('input-auto-off-time');
  if (autoOffInput) {
    autoOffInput.classList.add('curfew-highlight');
  }
}

// ============================================================================
// 4. Environment & Lighting Updates
// ============================================================================
function updateLightingAndEnvironment() {
  const currentMin = state.currentTimeMinutes;
  const hours = Math.floor(currentMin / 60);
  const remMin = currentMin % 60;
  const h12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  const ampm = hours >= 12 && hours < 24 ? 'PM' : 'AM';
  const padMin = String(remMin).padStart(2, '0');
  const clockStr = `${String(h12).padStart(2, '0')}:${padMin} ${ampm}`;

  // Update clock display
  document.getElementById('clock-display').textContent = clockStr;

  // Check Scheduled Curfew Time
  const isPastScheduledOff = currentMin >= state.autoOffTimeMinutes;

  if (isPastScheduledOff) {
    // Curfew active: turn lights off
    state.lightStatus = 'OFF';
    state.turnedOffByCurfew = true;
    applyLightingVisuals('OFF', 'Scheduled Curfew');
    updateLiveTimerDisplay('Curfew: Lights Off', false);
    return;
  }

  // If time was dragged BACK before curfew and lights were off due to curfew:
  // Turn the lights back on automatically!
  if (state.turnedOffByCurfew) {
    state.turnedOffByCurfew = false;
    state.lightStatus = 'FULL';
    state.inactivityRemainingSeconds = state.inactivityWaitMinutes * 60;
    state.dimRemainingSeconds = state.dimGracePeriodSeconds;
    audio.playLightsOnHum();
  }

  // Not in curfew: Render based on current light status
  if (state.lightStatus === 'FULL') {
    applyLightingVisuals('FULL', '100% Full Illumination');
    const m = Math.floor(state.inactivityRemainingSeconds / 60);
    const s = state.inactivityRemainingSeconds % 60;
    const timeFormatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    
    if (state.isBenchCountdownActive) {
      updateLiveTimerDisplay(`Bench Idle Countdown: ${timeFormatted}`, false);
    } else {
      updateLiveTimerDisplay(`Inactivity Timer: ${timeFormatted}`, false);
    }
  } else if (state.lightStatus === 'DIM') {
    applyLightingVisuals('DIM', `30% Dim (${state.dimRemainingSeconds}s)`);
    // Live countdown continued on screen!
    updateLiveTimerDisplay(`Warning Dim: ${state.dimRemainingSeconds}s until shutoff`, true);
  } else if (state.lightStatus === 'OFF') {
    applyLightingVisuals('OFF', '0% Off (Inactivity Timeout)');
    updateLiveTimerDisplay('Inactivity Timeout: Lights Off', false);
  }
}

function applyLightingVisuals(status, labelText) {
  const darknessOverlay = document.getElementById('darkness-overlay');
  const floodlightBeams = document.getElementById('floodlight-beams');
  const statusPill = document.getElementById('lighting-status-pill');
  const statusText = document.getElementById('lighting-status-text');
  const statusSubtext = document.getElementById('status-timer-countdown');

  statusText.textContent = labelText;

  if (status === 'FULL') {
    darknessOverlay.style.background = 'rgba(2, 6, 23, 0.05)';
    floodlightBeams.style.opacity = '1';
    statusPill.setAttribute('data-state', 'full');
    const m = Math.floor(state.inactivityRemainingSeconds / 60);
    const s = state.inactivityRemainingSeconds % 60;
    statusSubtext.textContent = `Inactivity: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  } else if (status === 'DIM') {
    darknessOverlay.style.background = 'rgba(2, 6, 23, 0.65)';
    floodlightBeams.style.opacity = '0.35';
    statusPill.setAttribute('data-state', 'dim');
    statusSubtext.textContent = `Dim Grace: ${state.dimRemainingSeconds}s remaining`;
  } else if (status === 'OFF') {
    darknessOverlay.style.background = 'rgba(2, 6, 23, 0.94)';
    floodlightBeams.style.opacity = '0.02';
    statusPill.setAttribute('data-state', 'off');
    statusSubtext.textContent = `Lights Off`;
  }
}

function updateLiveTimerDisplay(text, isDimWarning) {
  const timerBadge = document.getElementById('court-live-timer');
  const timerText = document.getElementById('court-live-timer-text');
  timerText.textContent = text;
  timerBadge.classList.toggle('dim-active', isDimWarning);
}

// Show alert message for exactly 3 seconds
function show3SecondAlert(title, message) {
  const alertEl = document.getElementById('court-alert-banner');
  document.getElementById('alert-title').textContent = title;
  document.getElementById('alert-message').textContent = message;
  alertEl.classList.remove('hidden');

  if (state.alertDismissTimer) {
    clearTimeout(state.alertDismissTimer);
  }

  state.alertDismissTimer = setTimeout(() => {
    alertEl.classList.add('hidden');
    state.alertDismissTimer = null;
  }, 3000);
}

function hideAlertImmediately() {
  if (state.alertDismissTimer) {
    clearTimeout(state.alertDismissTimer);
    state.alertDismissTimer = null;
  }
  const alertEl = document.getElementById('court-alert-banner');
  if (alertEl) alertEl.classList.add('hidden');
}

function formatMinutesTo12Hour(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ============================================================================
// 5. Inactivity Countdown & 1-Minute Warning Dim Loop
// ============================================================================
function startInactivityEngine() {
  setInterval(() => {
    // If in curfew, lights stay off
    if (state.currentTimeMinutes >= state.autoOffTimeMinutes) {
      return;
    }

    // When lights are FULL and bench countdown is active:
    if (state.lightStatus === 'FULL') {
      if (state.isBenchCountdownActive) {
        if (state.inactivityRemainingSeconds > 0) {
          state.inactivityRemainingSeconds--;
        }

        // When 10-minute wait expires -> dim to 30% for 60s
        if (state.inactivityRemainingSeconds === 0) {
          state.lightStatus = 'DIM';
          state.dimRemainingSeconds = state.dimGracePeriodSeconds; // 60s
          audio.playChime(true);

          // Display notification for exactly 3 seconds
          show3SecondAlert('Lights will turn off in 60s', 'Move either player to keep lights on');
        }
      }
    } 
    // When lights are in the 1-minute DIM warning period:
    else if (state.lightStatus === 'DIM') {
      if (state.dimRemainingSeconds > 0) {
        state.dimRemainingSeconds--;
      }

      // If the 60s dimming window expires without movement -> shut off completely
      if (state.dimRemainingSeconds === 0) {
        state.lightStatus = 'OFF';
        audio.playPowerDown();
        show3SecondAlert('Lights Off (Inactivity Timeout)', 'Drag either player to turn lights back on');
      }
    }

    updateLightingAndEnvironment();
  }, 1000);
}

// ============================================================================
// 6. Player Movement & Interruption Logic
// ============================================================================
function triggerPlayerMovement() {
  // If in curfew, movement does not turn on lights past curfew
  if (state.currentTimeMinutes >= state.autoOffTimeMinutes) {
    return;
  }

  const wasDimOrOff = state.lightStatus !== 'FULL';

  // Moving either player stops dimming timer immediately and restores 100% lights
  state.lightStatus = 'FULL';
  state.dimRemainingSeconds = state.dimGracePeriodSeconds;
  state.inactivityRemainingSeconds = state.inactivityWaitMinutes * 60;
  state.isBenchCountdownActive = false;
  state.players.p1.onBench = false;
  state.players.p2.onBench = false;

  hideAlertImmediately();

  if (wasDimOrOff) {
    audio.playLightsOnHum();
  }

  updateLightingAndEnvironment();
}

// Sets both CSS transform and SVG presentation attribute consistently
function setPlayerPosition(key, x, y, animate = false) {
  state.players[key].x = x;
  state.players[key].y = y;
  const token = document.getElementById(key === 'p1' ? 'player-1' : 'player-2');
  if (!token) return;

  if (animate) {
    token.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
  } else {
    token.style.transition = 'none';
  }

  token.style.transform = `translate(${x}px, ${y}px)`;
  token.setAttribute('transform', `translate(${x}, ${y})`);
}

function setupDraggablePlayers() {
  const svg = document.getElementById('court-svg');
  let activeToken = null;
  let activePlayerKey = null;

  function getSvgCoords(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX || (e.touches && e.touches[0].clientX);
    pt.y = e.clientY || (e.touches && e.touches[0].clientY);
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function startDrag(e, playerKey, elemId) {
    e.preventDefault();
    audio.playClick();
    activeToken = document.getElementById(elemId);
    activePlayerKey = playerKey;
    state.rallyActive = false;
    document.getElementById('btn-rally-play').textContent = 'Simulate Play (Movement)';
    const ball = document.getElementById('sim-ball');
    if (ball) ball.setAttribute('opacity', '0');

    // Dragging either player turns lights on and stops dimming timer
    triggerPlayerMovement();
  }

  const p1 = document.getElementById('player-1');
  p1.addEventListener('mousedown', (e) => startDrag(e, 'p1', 'player-1'));
  p1.addEventListener('touchstart', (e) => startDrag(e, 'p1', 'player-1'), { passive: false });

  const p2 = document.getElementById('player-2');
  p2.addEventListener('mousedown', (e) => startDrag(e, 'p2', 'player-2'));
  p2.addEventListener('touchstart', (e) => startDrag(e, 'p2', 'player-2'), { passive: false });

  window.addEventListener('mousemove', onDrag);
  window.addEventListener('touchmove', onDrag, { passive: false });
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('touchend', endDrag);

  function onDrag(e) {
    if (!activeToken || !activePlayerKey) return;
    const coords = getSvgCoords(e);
    const cx = Math.max(25, Math.min(775, coords.x));
    const cy = Math.max(25, Math.min(475, coords.y));

    setPlayerPosition(activePlayerKey, cx, cy, false);
    if (activePlayerKey === 'p1') {
      rallyState.p1.x = cx;
      rallyState.p1.y = cy;
      rallyState.p1.targetX = cx;
      rallyState.p1.targetY = cy;
    } else {
      rallyState.p2.x = cx;
      rallyState.p2.y = cy;
      rallyState.p2.targetX = cx;
      rallyState.p2.targetY = cy;
    }
    triggerPlayerMovement();
  }

  function endDrag() {
    activeToken = null;
    activePlayerKey = null;
  }
}

// ============================================================================
// 7. Quick Action Controls
// ============================================================================
function setupQuickActions() {
  // 1. "Sit on Bench": Places BOTH players reliably side-by-side on the bench
  document.getElementById('btn-rest-bench').addEventListener('click', () => {
    audio.playClick();
    
    // Stop rally simulation immediately
    state.rallyActive = false;
    document.getElementById('btn-rally-play').textContent = 'Simulate Play (Movement)';
    const ball = document.getElementById('sim-ball');
    if (ball) ball.setAttribute('opacity', '0');

    // Move BOTH players side-by-side onto the bench (bench x: 310 to 490, y: 18 to 50)
    setPlayerPosition('p1', 355, 34, true);
    setPlayerPosition('p2', 445, 34, true);

    state.players.p1.onBench = true;
    state.players.p2.onBench = true;

    // Start 10-minute timer
    state.isBenchCountdownActive = true;
    state.inactivityRemainingSeconds = state.inactivityWaitMinutes * 60; // 600 seconds
    state.dimRemainingSeconds = state.dimGracePeriodSeconds;
    state.lightStatus = 'FULL';

    hideAlertImmediately();
    updateLightingAndEnvironment();
  });

  // 2. "Simulate Play (Movement)"
  const rallyBtn = document.getElementById('btn-rally-play');
  rallyBtn.addEventListener('click', () => {
    audio.playClick();
    state.rallyActive = !state.rallyActive;
    if (state.rallyActive) {
      rallyBtn.textContent = 'Pause Play';
      // Bring players back to court if on bench
      state.players.p1.onBench = false;
      state.players.p2.onBench = false;
      rallyState.p1.x = 230;
      rallyState.p1.y = 250;
      rallyState.p2.x = 570;
      rallyState.p2.y = 250;
      resetRallyShot('p1');
      triggerPlayerMovement();
    } else {
      rallyBtn.textContent = 'Simulate Play (Movement)';
      const ball = document.getElementById('sim-ball');
      if (ball) ball.setAttribute('opacity', '0');
    }
  });

  // 3. "Move Player (Lights On)"
  document.getElementById('btn-wake-move').addEventListener('click', () => {
    audio.playClick();
    state.rallyActive = false;
    document.getElementById('btn-rally-play').textContent = 'Simulate Play (Movement)';
    const ball = document.getElementById('sim-ball');
    if (ball) ball.setAttribute('opacity', '0');
    setPlayerPosition('p1', 230, 250, true);
    setPlayerPosition('p2', 570, 250, true);
    triggerPlayerMovement();
  });

  // 4. "Fast-Forward to 1m Dim"
  document.getElementById('btn-fast-forward-idle').addEventListener('click', () => {
    audio.playClick();
    if (state.currentTimeMinutes >= state.autoOffTimeMinutes) return;

    // Stop rally when going idle
    state.rallyActive = false;
    document.getElementById('btn-rally-play').textContent = 'Simulate Play (Movement)';
    const ball = document.getElementById('sim-ball');
    if (ball) ball.setAttribute('opacity', '0');

    // Place both on bench
    setPlayerPosition('p1', 355, 34, true);
    setPlayerPosition('p2', 445, 34, true);
    state.players.p1.onBench = true;
    state.players.p2.onBench = true;

    // Jump straight to the 1-minute warning dim
    state.isBenchCountdownActive = true;
    state.inactivityRemainingSeconds = 0;
    state.lightStatus = 'DIM';
    state.dimRemainingSeconds = state.dimGracePeriodSeconds; // 60s
    audio.playChime(true);

    // Show notice for 3 seconds
    show3SecondAlert('Lights will turn off in 60s', 'Move either player to keep lights on');
    updateLightingAndEnvironment();
  });
}

// ============================================================================
// 7. Smooth, Indefinite Tennis Rally Engine (No Teleportation)
// ============================================================================
const rallyState = {
  direction: 1, // 1: ball traveling towards P2; -1: ball traveling towards P1
  progress: 0,
  speed: 0.016, // duration ~ 1.0s per stroke
  startX: 230,
  startY: 250,
  targetX: 570,
  targetY: 250,
  p1: { x: 230, y: 250, targetX: 230, targetY: 250 },
  p2: { x: 570, y: 250, targetX: 570, targetY: 250 }
};

function resetRallyShot(fromPlayer) {
  if (fromPlayer === 'p1') {
    rallyState.direction = 1;
    rallyState.startX = rallyState.p1.x;
    rallyState.startY = rallyState.p1.y;
    // P2 side: target strictly inside court (x: 560..605, y: 145..355)
    rallyState.targetX = 560 + Math.random() * 45;
    rallyState.targetY = 145 + Math.random() * 210;
    // Set receiver's target directly where the ball will arrive
    rallyState.p2.targetX = rallyState.targetX;
    rallyState.p2.targetY = rallyState.targetY;
  } else {
    rallyState.direction = -1;
    rallyState.startX = rallyState.p2.x;
    rallyState.startY = rallyState.p2.y;
    // P1 side: target strictly inside court (x: 195..240, y: 145..355)
    rallyState.targetX = 195 + Math.random() * 45;
    rallyState.targetY = 145 + Math.random() * 210;
    // Set receiver's target directly where the ball will arrive
    rallyState.p1.targetX = rallyState.targetX;
    rallyState.p1.targetY = rallyState.targetY;
  }
  rallyState.progress = 0;
  // Natural variation in shot speed
  rallyState.speed = 0.015 + (Math.random() * 0.005);
}

function startBallSimulation() {
  const ball = document.getElementById('sim-ball');
  let lastTime = performance.now();

  function rallyLoop(now) {
    requestAnimationFrame(rallyLoop);

    const dt = Math.min(50, now - lastTime);
    lastTime = now;

    // Check if rally should be actively running
    const isCurfew = state.currentTimeMinutes >= state.autoOffTimeMinutes;
    if (!state.rallyActive || isCurfew || state.players.p1.onBench || state.players.p2.onBench) {
      if (ball) ball.setAttribute('opacity', '0');
      return;
    }

    if (ball) ball.setAttribute('opacity', '1');

    // Normalized progress delta based on 60fps (16.67ms)
    const stepMultiplier = Math.max(0.5, Math.min(2.5, dt / 16.67));
    rallyState.progress += rallyState.speed * stepMultiplier;

    // Failsafe watchdog: ensure progress and coordinates never produce NaN or drift
    if (isNaN(rallyState.progress) || rallyState.progress < 0) {
      rallyState.progress = 0;
    }

    const t = Math.min(1, Math.max(0, rallyState.progress));

    // Smooth interpolated ball position
    const bx = rallyState.startX + (rallyState.targetX - rallyState.startX) * t;
    const by = rallyState.startY + (rallyState.targetY - rallyState.startY) * t;
    const arcHeight = -Math.sin(t * Math.PI) * 22; // Parabolic arc clearing the net

    if (ball) {
      ball.setAttribute('cx', bx);
      ball.setAttribute('cy', by + arcHeight);
      ball.setAttribute('r', 5 + Math.sin(t * Math.PI) * 2.2);
    }

    // CONTINUOUS, CONSTANT PLAYER MOVEMENT (NO TELEPORTATION)
    // Receiver runs smoothly towards ball arrival point
    // Striker recovers smoothly back to center baseline
    const footworkTick = now * 0.006;

    if (rallyState.direction === 1) {
      // Ball is traveling to Player 2
      const p2TrackRate = 0.075 * stepMultiplier;
      rallyState.p2.x += (rallyState.p2.targetX - rallyState.p2.x) * p2TrackRate;
      rallyState.p2.y += (rallyState.p2.targetY - rallyState.p2.y) * p2TrackRate;

      const p1RecoverRate = 0.035 * stepMultiplier;
      rallyState.p1.x += (225 - rallyState.p1.x) * p1RecoverRate;
      rallyState.p1.y += (250 - rallyState.p1.y) * p1RecoverRate;
    } else {
      // Ball is traveling to Player 1
      const p1TrackRate = 0.075 * stepMultiplier;
      rallyState.p1.x += (rallyState.p1.targetX - rallyState.p1.x) * p1TrackRate;
      rallyState.p1.y += (rallyState.p1.targetY - rallyState.p1.y) * p1TrackRate;

      const p2RecoverRate = 0.035 * stepMultiplier;
      rallyState.p2.x += (575 - rallyState.p2.x) * p2RecoverRate;
      rallyState.p2.y += (250 - rallyState.p2.y) * p2RecoverRate;
    }

    // Micro-footwork bounce for fluid athletic posture
    const p1Bounce = Math.sin(footworkTick) * 1.5;
    const p2Bounce = Math.cos(footworkTick) * 1.5;

    // Strict boundary clamping so players always remain safely within their court side
    rallyState.p1.x = Math.max(180, Math.min(270, rallyState.p1.x));
    rallyState.p1.y = Math.max(120, Math.min(380, rallyState.p1.y));
    rallyState.p2.x = Math.max(530, Math.min(620, rallyState.p2.x));
    rallyState.p2.y = Math.max(120, Math.min(380, rallyState.p2.y));

    // Update player tokens continuously every frame (butter smooth, zero teleportation)
    setPlayerPosition('p1', rallyState.p1.x, rallyState.p1.y + p1Bounce, false);
    setPlayerPosition('p2', rallyState.p2.x, rallyState.p2.y + p2Bounce, false);

    // Ball has arrived at receiver - strike the return
    if (rallyState.progress >= 1) {
      audio.playTennisHit();
      triggerPlayerMovement(); // keep floodlights on and reset inactivity timer

      if (rallyState.direction === 1) {
        resetRallyShot('p2');
      } else {
        resetRallyShot('p1');
      }
    }
  }

  requestAnimationFrame(rallyLoop);
}

// ============================================================================
// 8. Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  setupUserInputs();
  setupDraggablePlayers();
  setupQuickActions();
  startBallSimulation();
  startInactivityEngine();

  // Set initial player positions
  setPlayerPosition('p1', 230, 250, false);
  setPlayerPosition('p2', 570, 250, false);

  // Initialize dynamic relative curfew highlight on whole day bar
  updateCurfewHighlightUI();

  // Initialize display
  updateLightingAndEnvironment();
});
