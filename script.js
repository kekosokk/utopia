/* ════════════════════════════════════════════════════════════
   UTOPIA — CORE ENGINE
   ════════════════════════════════════════════════════════════ */

const settings = {
  keys: ['d', 'f', 'j', 'k'],
  colWidth: 80,
  colGap: 4,
  laneOffset: 50,
  noteSpeed: 5,      
  noteSize: 30, // Controla a altura da barra ou diâmetro do círculo
  timingWindow: 80,  
  hitLinePos: 88,
  noteStyle: 'circle', // bar ou circle
  colors: ['#7c5cfc', '#fc5c7d', '#5cfc9a', '#fcb75c']
};

let songHistory = [];
let currentAudioFile = null; // Guardado na sessão para permitir REPETIR
let currentChartData = [];
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- INICIALIZAÇÃO E HISTÓRICO ---
function loadSettings() {
  try {
    const saved = localStorage.getItem('utopia_settings');
    if (saved) Object.assign(settings, JSON.parse(saved));
    const hist = localStorage.getItem('utopia_history');
    if (hist) songHistory = JSON.parse(hist);
  } catch(e) {}
  applySettings();
  renderHistory();
}

function saveSettings() {
  localStorage.setItem('utopia_settings', JSON.stringify(settings));
  applySettings();
}

function saveToHistory(fileName) {
  // Evita duplicatas diretas e mantém apenas as 5 últimas
  songHistory = songHistory.filter(name => name !== fileName);
  songHistory.unshift(fileName);
  if (songHistory.length > 5) songHistory.pop();
  localStorage.setItem('utopia_history', JSON.stringify(songHistory));
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  if (songHistory.length === 0) {
    list.innerHTML = '<div style="color:var(--text-dim); font-size:0.8rem; padding: 10px;">Nenhuma música tocada.</div>';
    return;
  }
  songHistory.forEach(song => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `<span>${song}</span> <span style="color:var(--text-dim)">▶</span>`;
    // Navegadores não permitem acesso local sem input do usuário.
    div.onclick = () => {
      document.getElementById('file-input').click(); 
    };
    list.appendChild(div);
  });
}

// --- APLICAÇÃO DINÂMICA (CSS E UI) ---
function applySettings() {
  const r = document.documentElement.style;
  r.setProperty('--col-width', settings.colWidth + 'px');
  r.setProperty('--col-gap', settings.colGap + 'px');
  r.setProperty('--hit-line', settings.hitLinePos + '%');
  r.setProperty('--note-size', settings.noteSize + 'px');
  r.setProperty('--lane-offset', settings.laneOffset + '%');
  
  for(let i=0; i<4; i++) {
    r.setProperty('--col'+(i+1), settings.colors[i]);
    const inputColor = document.getElementById('color-c'+(i+1));
    if(inputColor) inputColor.value = settings.colors[i];
  }

  const lc = document.getElementById('lane-container');
  if(lc) lc.className = 'style-' + settings.noteStyle;
  
  const selStyle = document.getElementById('note-style');
  if(selStyle) selStyle.value = settings.noteStyle;

  settings.keys.forEach((key, i) => {
    const b = document.getElementById('key-btn-'+i);
    if (b) b.textContent = key.toUpperCase();
  });

  const map = {
    'colWidth':   ['col-width',   v => v+'px'],
    'colGap':     ['col-gap',     v => v+'px'],
    'laneOffset': ['lane-offset', v => v+'%'],
    'noteSize':   ['note-size',   v => v+'px'],
    'noteSpeed':  ['note-speed',  v => parseFloat(v).toFixed(1)+'s'],
    'hitLinePos': ['hit-line-pos',v => v+'%']
  };

  Object.entries(map).forEach(([key, [id, fmt]]) => {
    const el = document.getElementById(id);
    const dsp = document.getElementById(id + '-val');
    if (el) el.value = settings[key];
    if (dsp) dsp.textContent = fmt(settings[key]);
  });
}

function updateSetting(key, val, unit) {
  settings[key] = parseFloat(val);
  document.documentElement.style.setProperty('--' + key.replace(/([A-Z])/g, "-$1").toLowerCase(), val + unit);
  document.getElementById(key.replace(/([A-Z])/g, "-$1").toLowerCase() + '-val').textContent = val + unit;
}
function updateNoteStyle(val) { settings.noteStyle = val; document.getElementById('lane-container').className = 'style-'+val; }
function updateColor(idx, hex) { settings.colors[idx-1] = hex; document.documentElement.style.setProperty('--col'+idx, hex); }

let listeningIndex = -1;
function listenKey(i) {
  listeningIndex = i;
  const btn = document.getElementById('key-btn-'+i);
  btn.textContent = '…'; btn.classList.add('listening');
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  if (name === 'settings') applySettings();
}

// --- PARTÍCULAS BACKGROUND ---
const pCanvas = document.getElementById('particles');
const pCtx = pCanvas.getContext('2d');
let particles = [];
function initParticles() {
  pCanvas.width = innerWidth; pCanvas.height = innerHeight;
  particles = Array.from({length:40}, () => ({
    x: Math.random()*innerWidth, y: Math.random()*innerHeight,
    r: Math.random()*1.5+0.5, vy: -(Math.random()*0.3+0.1), alpha: Math.random()*0.3+0.1
  }));
}
function animParticles() {
  pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);
  particles.forEach(p => {
    p.y += p.vy; if (p.y < 0) { p.y = innerHeight; p.x = Math.random()*innerWidth; }
    pCtx.beginPath(); pCtx.arc(p.x,p.y,p.r,0,Math.PI*2);
    pCtx.fillStyle = `rgba(255,255,255,${p.alpha})`; pCtx.fill();
  });
  requestAnimationFrame(animParticles);
}
window.addEventListener('resize', initParticles); initParticles(); animParticles();

// --- PROCESSAMENTO DE ARQUIVO ---
const fileInput = document.getElementById('file-input');
// CORREÇÃO: Limpar o valor ao clicar permite que o usuário selecione a MESMA música de novo e o jogo inicie
fileInput.addEventListener('click', function() { this.value = null; });
fileInput.addEventListener('change', e => { if (e.target.files[0]) processAudioFile(e.target.files[0]); });

function setStatus(msg, isErr=false) {
  const el = document.getElementById('load-status');
  el.textContent = msg; el.style.color = isErr ? '#fc5c7d' : '#5cfc9a';
}
function setProgress(pct) {
  const bar = document.getElementById('progress-bar'), fill = document.getElementById('progress-fill');
  bar.style.display = 'block'; fill.style.width = pct + '%';
  if (pct >= 100) setTimeout(() => { bar.style.display = 'none'; }, 600);
}

async function processAudioFile(file) {
  currentAudioFile = file; // Salva para o botão Repetir
  const fileName = file.name.replace(/\.[^.]+$/, '');
  saveToHistory(fileName);

  setStatus('Descodificando áudio...'); setProgress(20);
  try {
    if(audioCtx.state === 'closed') audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    setStatus('Gerando Chart...'); setProgress(50);
    currentChartData = await generateChartSpectralFlux(buffer, p => setProgress(50 + p * 50));
    
    setProgress(100); setStatus('Concluído!');
    setTimeout(() => startCountdown(fileName), 600);
  } catch(err) {
    console.error(err); setStatus('Erro no formato.', true); setProgress(0);
  }
}

// Algoritmo Matemático de Fluxo Espectral (Original)
async function generateChartSpectralFlux(buffer, onProgress) {
  return new Promise(resolve => {
    const sampleRate = buffer.sampleRate;
    let mono = buffer.numberOfChannels === 1 ? buffer.getChannelData(0) : new Float32Array(buffer.getChannelData(0).length);
    if(buffer.numberOfChannels > 1) {
      const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
      for(let i=0; i<L.length; i++) mono[i] = (L[i]+R[i])*0.5;
    }

    const FFT_SIZE = 2048, HOP_SIZE = 512, HALF_FFT = FFT_SIZE/2;
    const hann = new Float32Array(FFT_SIZE);
    for(let i=0;i<FFT_SIZE;i++) hann[i] = 0.5*(1-Math.cos(2*Math.PI*i/(FFT_SIZE-1)));

    function hzToBin(hz) { return Math.round(hz / (sampleRate / FFT_SIZE)); }
    const BANDS = [
      { lo: hzToBin(20), hi: hzToBin(250), col: 0 },
      { lo: hzToBin(250), hi: hzToBin(800), col: 1 },
      { lo: hzToBin(800), hi: hzToBin(3500), col: 2 },
      { lo: hzToBin(3500), hi: Math.min(hzToBin(20000), HALF_FFT-1), col: 3 }
    ];
    
    const numFrames = Math.floor((mono.length - FFT_SIZE)/HOP_SIZE) + 1;
    const flux = Array.from({length:4}, () => new Float32Array(numFrames));
    
    function computeMag(signal) {
      const re = new Float32Array(signal), im = new Float32Array(FFT_SIZE);
      let j = 0;
      for (let i = 1; i < FFT_SIZE; i++) {
        let bit = FFT_SIZE >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
      }
      for (let len = 2; len <= FFT_SIZE; len <<= 1) {
        const half = len >> 1, ang = -2 * Math.PI / len, wRe = Math.cos(ang), wIm = Math.sin(ang);
        for (let i = 0; i < FFT_SIZE; i += len) {
          let curRe = 1, curIm = 0;
          for (let k = 0; k < half; k++) {
            const uRe = re[i+k], uIm = im[i+k];
            const vRe = re[i+k+half]*curRe - im[i+k+half]*curIm, vIm = re[i+k+half]*curIm + im[i+k+half]*curRe;
            re[i+k] = uRe+vRe; im[i+k] = uIm+vIm; re[i+k+half] = uRe-vRe; im[i+k+half] = uIm-vIm;
            const newRe = curRe*wRe - curIm*wIm; curIm = curRe*wIm + curIm*wRe; curRe = newRe;
          }
        }
      }
      const mag = new Float32Array(HALF_FFT);
      for (let i=0; i<HALF_FFT; i++) mag[i] = Math.sqrt(re[i]*re[i] + im[i]*im[i]);
      return mag;
    }

    const windowed = new Float32Array(FFT_SIZE);
    let prevMag = Array.from({length:4}, () => new Float32Array(HALF_FFT));
    let frameIdx = 0;

    function processChunk() {
      const chunkEnd = Math.min(frameIdx + 250, numFrames);
      for(let f = frameIdx; f < chunkEnd; f++) {
        const start = f * HOP_SIZE;
        for(let i=0; i<FFT_SIZE; i++) windowed[i] = (start+i < mono.length ? mono[start+i] : 0) * hann[i];
        const mag = computeMag(windowed);
        for(let b=0; b<4; b++) {
          let sf = 0;
          for(let k = BANDS[b].lo; k <= BANDS[b].hi; k++) {
            const diff = mag[k] - prevMag[b][k]; if(diff > 0) sf += diff;
            prevMag[b][k] = mag[k];
          }
          flux[b][f] = sf;
        }
      }
      frameIdx = chunkEnd;
      if(onProgress) onProgress(frameIdx/numFrames);
      if(frameIdx < numFrames) setTimeout(processChunk, 0); 
      else resolve(buildChart(flux, numFrames, HOP_SIZE, sampleRate));
    }
    processChunk();
  });
}

function buildChart(flux, numFrames, HOP_SIZE, sampleRate) {
  const allOnsets = []; 
  for (let b = 0; b < 4; b++) {
    const f = flux[b], avg = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      let s = 0, count = 0;
      for (let k = Math.max(0, i-40); k <= Math.min(numFrames-1, i+40); k++) { s += f[k]; count++; }
      avg[i] = s / count;
    }
    let lastPeak = -9999;
    for (let i = 1; i < numFrames-1; i++) {
      if (f[i] > f[i-1] && f[i] > f[i+1] && f[i] > avg[i] * 1.6 && (i - lastPeak) > (0.12 * sampleRate / HOP_SIZE)) {
        allOnsets.push({ frame: i, col: b, strength: f[i] }); lastPeak = i;
      }
    }
  }

  allOnsets.sort((a,b) => a.frame - b.frame);
  const chart = []; let lastAnyFrame = -9999;
  
  for(let i=0; i<allOnsets.length; i++) {
    if(allOnsets[i].frame - lastAnyFrame < (0.07 * sampleRate / HOP_SIZE)) continue;
    chart.push({ time: allOnsets[i].frame * HOP_SIZE / sampleRate, col: allOnsets[i].col });
    lastAnyFrame = allOnsets[i].frame;
  }
  return chart;
}

// --- GAME LOOP & LÓGICA ---
let gameState = null, animFrame = null;

// Lógica nova para o botão REPETIR (Reutiliza os dados salvos)
function retryGame() {
  if(currentAudioFile && currentChartData.length > 0) {
    document.getElementById('pause-overlay').classList.remove('visible');
    startCountdown(currentAudioFile.name.replace(/\.[^.]+$/, ''));
  } else {
    showScreen('load');
  }
}

function startCountdown(fileName) {
  showScreen('countdown');
  document.getElementById('countdown-song').textContent = fileName;
  const el = document.getElementById('countdown-num'); el.textContent = '3';
  let n = 3;
  const tick = () => {
    n--;
    if (n === 0) { el.textContent = 'GO!'; setTimeout(startGame, 700); return; }
    el.textContent = n; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'countdown-pop 1s ease-out';
    setTimeout(tick, 1000);
  };
  el.style.animation = 'countdown-pop 1s ease-out'; setTimeout(tick, 1000);
}

function startGame() {
  showScreen('game');
  for (let i = 0; i < 4; i++) document.getElementById('lane-'+i).querySelectorAll('.note,.hit-feedback').forEach(e => e.remove());

  const url = URL.createObjectURL(currentAudioFile);
  const audioEl = new Audio(url); audioEl.crossOrigin = 'anonymous';

  gameState = {
    chart: JSON.parse(JSON.stringify(currentChartData)).map(n => ({...n, hit: false, missed: false, el: null})),
    audio: audioEl, startTime: null, score: 0, combo: 0, maxCombo: 0, hp: 100,
    perfect: 0, good: 0, miss: 0, paused: false, pauseTime: 0, running: true
  };

  updateHUD();
  audioEl.play().then(() => { gameState.startTime = performance.now() / 1000 - 0.05; gameLoop(); });
  audioEl.addEventListener('ended', () => { if (gameState && gameState.running) endGame(); });
}

function gameLoop() {
  if (!gameState || !gameState.running) return;
  if (gameState.paused) { animFrame = requestAnimationFrame(gameLoop); return; }

  const now = performance.now() / 1000, songTime = now - gameState.startTime;
  const speed = settings.noteSpeed, hitLinePct = settings.hitLinePos / 100;
  const spawnThresh = speed * hitLinePct + 0.15;

  for (const note of gameState.chart) {
    if (note.hit || note.missed || note.el) continue;
    if (songTime >= note.time - spawnThresh) {
      const lane = document.getElementById('lane-'+note.col);
      if(lane) { const el = document.createElement('div'); el.className = 'note'; lane.appendChild(el); note.el = el; }
    }
  }

  for (const note of gameState.chart) {
    if (!note.el || note.hit) continue;
    const elapsed = songTime - note.time;
    // Multiplica por 100 para converter o offset de tempo na percentagem top do CSS
    const topPct = (hitLinePct + elapsed / speed) * 100;
    note.el.style.top = topPct + '%';

    if (!note.missed && elapsed > 0.15) {
      note.missed = true; note.el.classList.add('miss');
      gameState.combo = 0; gameState.miss++; gameState.hp -= 8;
      showFeedback(note.col, 'MISS', 'miss'); updateHUD();
      setTimeout(() => { if (note.el) { note.el.remove(); note.el = null; } }, 200);
    }
    if (topPct > 110) { if (note.el) { note.el.remove(); note.el = null; } }
  }

  if (gameState.hp <= 0) { gameState.hp = 0; updateHUD(); endGame(); return; }
  animFrame = requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', e => {
  if (listeningIndex >= 0) {
    settings.keys[listeningIndex] = e.key.toLowerCase();
    const btn = document.getElementById('key-btn-'+listeningIndex);
    if(btn) { btn.textContent = e.key.toUpperCase(); btn.classList.remove('listening'); }
    listeningIndex = -1; e.preventDefault(); return;
  }
  if (!gameState || !gameState.running || gameState.paused) { 
    if(e.key === 'Escape' && document.getElementById('pause-overlay').classList.contains('visible')) resumeGame(); 
    return; 
  }
  if (e.key === 'Escape') { pauseGame(); return; }
  if (e.repeat) return;

  const col = settings.keys.indexOf(e.key.toLowerCase()); if (col === -1) return;
  const lane = document.getElementById('lane-'+col);
  const receptor = lane.querySelector('.receptor');
  receptor.classList.add('active'); lane.classList.add('pressed');
  setTimeout(() => { receptor.classList.remove('active'); lane.classList.remove('pressed'); }, 150);
  processHit(col);
});

document.addEventListener('keyup', e => {
  const col = settings.keys.indexOf(e.key.toLowerCase()); if (col === -1) return;
  const lane = document.getElementById('lane-'+col); if (lane) lane.querySelector('.receptor')?.classList.remove('active');
});

function processHit(col) {
  if (!gameState) return;
  const songTime = performance.now()/1000 - gameState.startTime;
  const perfWin = 0.05, goodWin = 0.1;

  let best = null, bestDiff = Infinity;
  for (const note of gameState.chart) {
    if (note.col !== col || note.hit || note.missed) continue;
    const d = Math.abs(songTime - note.time); if (d < bestDiff) { bestDiff = d; best = note; }
  }
  if (!best || bestDiff > goodWin * 1.5) return;

  const diff = songTime - best.time, absDiff = Math.abs(diff);

  if (absDiff <= perfWin) {
    best.hit = true; gameState.combo++; gameState.perfect++; gameState.hp += 2;
    gameState.score += 300 * (1 + Math.floor(gameState.combo/10));
    showFeedback(col, 'PERFEITO', 'perfect');
  } else if (absDiff <= goodWin) {
    best.hit = true; gameState.combo++; gameState.good++; gameState.hp += 0.5;
    gameState.score += 100 * (1 + Math.floor(gameState.combo/10));
    showFeedback(col, diff < 0 ? 'CEDO' : 'BOM', 'good');
  } else {
    best.hit = true; gameState.combo = 0; gameState.miss++; gameState.hp -= 8;
    showFeedback(col, 'ERRO', 'miss');
  }

  gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
  gameState.hp = Math.min(100, gameState.hp);

  if (best.hit && best.el) { best.el.style.opacity = '0'; setTimeout(() => { if(best.el) best.el.remove(); }, 120); }
  updateHUD();
}

function showFeedback(col, text, type) {
  const lane = document.getElementById('lane-'+col); if (!lane) return;
  const el = document.createElement('div'); el.className = `hit-feedback ${type}`; el.textContent = text;
  lane.appendChild(el); setTimeout(() => el.remove(), 400);
}

function updateHUD() {
  document.getElementById('score-val').textContent = String(gameState.score).padStart(6, '0');
  const comboEl = document.getElementById('combo-val'); comboEl.textContent = gameState.combo + 'x';
  comboEl.classList.remove('bump'); void comboEl.offsetWidth; comboEl.classList.add('bump');
  
  document.getElementById('perfect-val').textContent = gameState.perfect;
  document.getElementById('good-val').textContent = gameState.good;
  document.getElementById('miss-val').textContent = gameState.miss;
  
  const total = gameState.perfect + gameState.good + gameState.miss;
  document.getElementById('acc-val').textContent = total === 0 ? '100%' : Math.round((gameState.perfect*100 + gameState.good*50) / (total*100) * 100) + '%';
  document.getElementById('hp-fill').style.width = gameState.hp + '%';
  document.getElementById('hp-fill').style.background = gameState.hp > 50 ? 'var(--col3)' : (gameState.hp > 20 ? 'var(--col4)' : 'var(--col2)');
}

function pauseGame() {
  if (!gameState || !gameState.running) return;
  gameState.paused = true; gameState.pauseTime = performance.now(); gameState.audio.pause();
  document.getElementById('pause-overlay').classList.add('visible');
}
function resumeGame() {
  if(!gameState) return;
  gameState.startTime += (performance.now() - gameState.pauseTime)/1000;
  gameState.paused = false; gameState.audio.play();
  document.getElementById('pause-overlay').classList.remove('visible');
}
function quitGame() { document.getElementById('pause-overlay').classList.remove('visible'); endGame(); }

function endGame() {
  if(!gameState) return;
  gameState.running = false; cancelAnimationFrame(animFrame); gameState.audio.pause();

  const total = gameState.perfect + gameState.good + gameState.miss;
  const acc = total === 0 ? 100 : Math.round((gameState.perfect*100 + gameState.good*50) / (total*100) * 100);
  
  let grade = 'D', gClass = 'grade-d';
  if(gameState.hp <= 0) { grade='F'; gClass='grade-c'; }
  else if(acc >= 95 && gameState.miss===0) { grade='S'; gClass='grade-s'; }
  else if(acc >= 90) { grade='A'; gClass='grade-a'; }
  else if(acc >= 80) { grade='B'; gClass='grade-b'; }
  else if(acc >= 60) { grade='C'; gClass='grade-c'; }

  document.getElementById('results-grade').textContent = grade;
  document.getElementById('results-grade').className = `results-grade ${gClass}`;
  document.getElementById('r-score').textContent = String(gameState.score).padStart(6, '0');
  document.getElementById('r-acc').textContent = acc + '%';
  document.getElementById('r-combo').textContent = gameState.maxCombo;
  document.getElementById('r-perfect').textContent = gameState.perfect;
  document.getElementById('r-good').textContent = gameState.good;
  document.getElementById('r-miss').textContent = gameState.miss;

  gameState = null; showScreen('results');
}

loadSettings();