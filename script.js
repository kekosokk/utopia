/* ════════════════════════════════════════════════════════════
   UTOPIA — CORE ENGINE
   ════════════════════════════════════════════════════════════ */

const settings = {
  keys: ['d', 'f', 'j', 'k'],
  colGap: 4, laneOffset: 50, noteSpeed: 5, noteSize: 50, hitLinePos: 88, audioOffset: 0,
  noteStyle: 'circle', colors: ['#5c7cff', '#7b5cff', '#38bdf8', '#a78bff']
};

let songHistory = [];
let currentAudioFile = null; 
let currentAudioBuffer = null; // Buffer de áudio descodificado
let currentChartData = [];
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// SFX Audio
const hitSound = new Audio('src/soft-hitnormal.ogg');
const missSound = new Audio('src/miss-sound.mp3');
let lastMissTime = 0;

function playHitSound() { let s = hitSound.cloneNode(); s.volume = 0.6; s.play().catch(()=>{}); }
function playMissSound() {
  const now = performance.now();
  if (now - lastMissTime > 3000) { let s = missSound.cloneNode(); s.volume = 0.5; s.play().catch(()=>{}); lastMissTime = now; }
}

// CORES DO TÍTULO ALEATÓRIAS
setInterval(() => {
  // Mantém os tons dentro do espectro azul -> roxo (210º a 270º)
  const rHsl = () => `hsl(${210 + Math.random()*60}, ${70 + Math.random()*25}%, ${60 + Math.random()*12}%)`;
  document.documentElement.style.setProperty('--tc1', rHsl());
  document.documentElement.style.setProperty('--tc2', rHsl());
  document.documentElement.style.setProperty('--tc3', rHsl());
  document.documentElement.style.setProperty('--tc4', rHsl());
}, 800);

function loadSettings() {
  try {
    const saved = localStorage.getItem('utopia_settings');
    if (saved) Object.assign(settings, JSON.parse(saved));
    const hist = localStorage.getItem('utopia_history');
    if (hist) songHistory = JSON.parse(hist);
  } catch(e) {}
  applySettings(); renderHistory();
}

function saveSettings() { localStorage.setItem('utopia_settings', JSON.stringify(settings)); applySettings(); }

function saveToHistory(fileName) {
  songHistory = songHistory.filter(name => name !== fileName);
  songHistory.unshift(fileName);
  if (songHistory.length > 5) songHistory.pop();
  localStorage.setItem('utopia_history', JSON.stringify(songHistory));
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list'); if(!list) return;
  list.innerHTML = '';
  if (songHistory.length === 0) { list.innerHTML = '<div style="color:var(--text-dim); font-size:0.8rem; padding: 10px;">Nenhuma música tocada.</div>'; return; }
  songHistory.forEach(song => {
    const div = document.createElement('div'); div.className = 'history-item';
    div.innerHTML = `<span>${song}</span> <span style="color:var(--text-dim)">▶</span>`;
    div.onclick = () => document.getElementById('file-input').click();
    list.appendChild(div);
  });
}

function applySettings() {
  const r = document.documentElement.style;
  r.setProperty('--col-gap', settings.colGap + 'px');
  r.setProperty('--hit-line', settings.hitLinePos + '%');
  r.setProperty('--note-size', settings.noteSize + 'px');
  r.setProperty('--lane-offset', settings.laneOffset + '%');
  
  for(let i=0; i<4; i++) {
    r.setProperty('--col'+(i+1), settings.colors[i]);
    const inputColor = document.getElementById('color-c'+(i+1));
    if(inputColor) inputColor.value = settings.colors[i];
  }

  const lc = document.getElementById('lane-container'); if(lc) lc.className = 'play-container style-' + settings.noteStyle;
  const pb = document.getElementById('preview-lane-container'); if(pb) pb.className = 'play-container style-' + settings.noteStyle;
  const selStyle = document.getElementById('note-style'); if(selStyle) selStyle.value = settings.noteStyle;

  settings.keys.forEach((key, i) => { const b = document.getElementById('key-btn-'+i); if (b) b.textContent = key.toUpperCase(); });

  const map = {
    'colGap': ['col-gap', v => v+'px'], 'laneOffset': ['lane-offset', v => v+'%'], 
    'noteSize': ['note-size', v => v+'px'], 'noteSpeed': ['note-speed', v => parseFloat(v).toFixed(1)+'s'],
    'audioOffset': ['audio-offset', v => v+'ms']
  };

  Object.entries(map).forEach(([key, [id, fmt]]) => {
    const el = document.getElementById(id); const dsp = document.getElementById(key + '-val');
    if (el) el.value = settings[key]; if (dsp) dsp.textContent = fmt(settings[key]);
  });
}

function updateSetting(key, val, unit) {
  settings[key] = parseFloat(val);
  const cssVarName = '--' + key.replace(/([A-Z])/g, "-$1").toLowerCase();
  document.documentElement.style.setProperty(cssVarName, val + unit);
  const dsp = document.getElementById(key + '-val'); if (dsp) dsp.textContent = val + unit;
}

function updateNoteStyle(val) { 
  settings.noteStyle = val; 
  document.getElementById('lane-container').className = 'play-container style-'+val; 
  document.getElementById('preview-lane-container').className = 'play-container style-'+val; 
}
function updateColor(idx, hex) { settings.colors[idx-1] = hex; document.documentElement.style.setProperty('--col'+idx, hex); }

let listeningIndex = -1;
function listenKey(i) {
  listeningIndex = i; const btn = document.getElementById('key-btn-'+i);
  btn.textContent = '…'; btn.classList.add('listening');
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  if (name === 'settings') applySettings();
}

function closeSettings() {
  saveSettings();
  if (game && game.paused) { showScreen('game'); document.getElementById('pause-overlay').classList.add('visible'); } 
  else showScreen('menu');
}

function openSettingsFromPause() { document.getElementById('pause-overlay').classList.remove('visible'); showScreen('settings'); }

// ==========================================
// PREVIEW ENGINE (TESTE NA PISTA)
// ==========================================
let prevRun = false, prevFrame = null, prevStart = 0;
let pNotes = [];

function startPreview() {
  showScreen('preview');
  prevRun = true; prevStart = performance.now() / 1000; pNotes = [];
  prevLoop();
}

function stopPreview() {
  prevRun = false; cancelAnimationFrame(prevFrame);
  document.querySelectorAll('#preview-lane-container .note').forEach(e=>e.remove());
  showScreen('settings');
}

function prevLoop() {
  if(!prevRun) return;
  const time = (performance.now() / 1000) - prevStart;
  const speed = settings.noteSpeed, hlPct = settings.hitLinePos / 100;
  const spawnT = speed * hlPct + 0.15;

  if (pNotes.length === 0 || time > pNotes[pNotes.length-1].spawnTime + 0.4) {
    pNotes.push({ time: time + spawnT, col: Math.floor(Math.random()*4), spawnTime: time, el: null, hit: false, missed: false });
  }

  for (const n of pNotes) {
    if (n.hit || n.missed) continue;
    if (!n.el && time >= n.time - spawnT) {
      const l = document.getElementById('p-lane-'+n.col);
      if(l) { const el = document.createElement('div'); el.className = 'note'; l.appendChild(el); n.el = el; }
    }
    if (n.el) {
      const elap = time - n.time; const topPct = (hlPct + elap/speed) * 100;
      n.el.style.top = topPct + '%';
      if (elap >= 0 && !n.hit) {
        n.hit = true;
        const rec = document.querySelector('#p-lane-'+n.col+' .receptor');
        if(rec) { rec.classList.add('active'); setTimeout(()=>rec.classList.remove('active'), 120); }
        n.el.style.opacity = '0'; setTimeout(()=>{ if(n.el)n.el.remove(); }, 120);
      }
    }
  }
  pNotes = pNotes.filter(n => !n.hit || (time - n.time < 1));
  prevFrame = requestAnimationFrame(prevLoop);
}

// --- PARTÍCULAS ---
const pCanvas = document.getElementById('particles'); const pCtx = pCanvas.getContext('2d'); let particles = [];
function initParticles() {
  if(!pCanvas) return; pCanvas.width = innerWidth; pCanvas.height = innerHeight;
  particles = Array.from({length:40}, () => ({ x: Math.random()*innerWidth, y: Math.random()*innerHeight, r: Math.random()*1.5+0.5, vy: -(Math.random()*0.3+0.1), alpha: Math.random()*0.3+0.1 }));
}
function animParticles() {
  if(!pCtx) return; pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);
  particles.forEach(p => { p.y += p.vy; if (p.y < 0) { p.y = innerHeight; p.x = Math.random()*innerWidth; } pCtx.beginPath(); pCtx.arc(p.x,p.y,p.r,0,Math.PI*2); pCtx.fillStyle = `rgba(255,255,255,${p.alpha})`; pCtx.fill(); });
  requestAnimationFrame(animParticles);
}
window.addEventListener('resize', initParticles); initParticles(); animParticles();

// --- PROCESSAMENTO E CHART ---
const fileInput = document.getElementById('file-input');
if(fileInput) { fileInput.addEventListener('click', function() { this.value = null; }); fileInput.addEventListener('change', e => { if (e.target.files[0]) processAudioFile(e.target.files[0]); }); }

function setStatus(msg, isErr=false) { const el = document.getElementById('load-status'); if(el) { el.textContent = msg; el.style.color = isErr ? '#a78bff' : '#38bdf8'; } }
function setProgress(pct) { const bar = document.getElementById('progress-bar'), fill = document.getElementById('progress-fill'); if(bar && fill) { bar.style.display = 'block'; fill.style.width = pct + '%'; if (pct >= 100) setTimeout(() => { bar.style.display = 'none'; }, 600); } }

async function processAudioFile(file) {
  currentAudioFile = file; const fileName = file.name.replace(/\.[^.]+$/, ''); saveToHistory(fileName);
  setStatus('Descodificando áudio...'); setProgress(20);
  try {
    if(audioCtx.state === 'closed') audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer(); const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    currentAudioBuffer = buffer;  // Guarda o buffer para a gameplay
    setStatus('Gerando Chart...'); setProgress(50);
    currentChartData = await generateChartSpectralFlux(buffer, p => setProgress(50 + p * 50));
    setProgress(100); setStatus('Concluído!');
    setTimeout(() => startCountdown(fileName), 600);
  } catch(err) { setStatus('Erro no formato.', true); setProgress(0); }
}

async function generateChartSpectralFlux(buffer, onProgress) {
  return new Promise(resolve => {
    const sampleRate = buffer.sampleRate;
    let mono = buffer.numberOfChannels === 1 ? buffer.getChannelData(0) : new Float32Array(buffer.getChannelData(0).length);
    if(buffer.numberOfChannels > 1) { const L = buffer.getChannelData(0), R = buffer.getChannelData(1); for(let i=0; i<L.length; i++) mono[i] = (L[i]+R[i])*0.5; }

    const FFT_SIZE = 2048, HOP_SIZE = 512, HALF_FFT = FFT_SIZE/2;
    const hann = new Float32Array(FFT_SIZE); for(let i=0;i<FFT_SIZE;i++) hann[i] = 0.5*(1-Math.cos(2*Math.PI*i/(FFT_SIZE-1)));
    function hzToBin(hz) { return Math.round(hz / (sampleRate / FFT_SIZE)); }
    
    const BANDS = [ { lo: hzToBin(20), hi: hzToBin(250), col: 0 }, { lo: hzToBin(250), hi: hzToBin(800), col: 1 }, { lo: hzToBin(800), hi: hzToBin(3500), col: 2 }, { lo: hzToBin(3500), hi: Math.min(hzToBin(20000), HALF_FFT-1), col: 3 } ];
    const numFrames = Math.floor((mono.length - FFT_SIZE)/HOP_SIZE) + 1;
    const flux = Array.from({length:4}, () => new Float32Array(numFrames));
    
    function computeMag(signal) {
      const re = new Float32Array(signal), im = new Float32Array(FFT_SIZE); let j = 0;
      for (let i = 1; i < FFT_SIZE; i++) { let bit = FFT_SIZE >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= FFT_SIZE; len <<= 1) {
        const half = len >> 1, ang = -2 * Math.PI / len, wRe = Math.cos(ang), wIm = Math.sin(ang);
        for (let i = 0; i < FFT_SIZE; i += len) {
          let curRe = 1, curIm = 0;
          for (let k = 0; k < half; k++) {
            const uRe = re[i+k], uIm = im[i+k], vRe = re[i+k+half]*curRe - im[i+k+half]*curIm, vIm = re[i+k+half]*curIm + im[i+k+half]*curRe;
            re[i+k] = uRe+vRe; im[i+k] = uIm+vIm; re[i+k+half] = uRe-vRe; im[i+k+half] = uIm-vIm;
            const newRe = curRe*wRe - curIm*wIm; curIm = curRe*wIm + curIm*wRe; curRe = newRe;
          }
        }
      }
      const mag = new Float32Array(HALF_FFT); for (let i=0; i<HALF_FFT; i++) mag[i] = Math.sqrt(re[i]*re[i] + im[i]*im[i]); return mag;
    }

    const windowed = new Float32Array(FFT_SIZE); let prevMag = Array.from({length:4}, () => new Float32Array(HALF_FFT)); let frameIdx = 0;

    function processChunk() {
      const chunkEnd = Math.min(frameIdx + 250, numFrames);
      for(let f = frameIdx; f < chunkEnd; f++) {
        const start = f * HOP_SIZE; for(let i=0; i<FFT_SIZE; i++) windowed[i] = (start+i < mono.length ? mono[start+i] : 0) * hann[i];
        const mag = computeMag(windowed);
        for(let b=0; b<4; b++) { let sf = 0; for(let k = BANDS[b].lo; k <= BANDS[b].hi; k++) { const diff = mag[k] - prevMag[b][k]; if(diff > 0) sf += diff; prevMag[b][k] = mag[k]; } flux[b][f] = sf; }
      }
      frameIdx = chunkEnd; if(onProgress) onProgress(frameIdx/numFrames);
      if(frameIdx < numFrames) setTimeout(processChunk, 0); else resolve(buildOsuChart(flux, numFrames, HOP_SIZE, sampleRate));
    }
    processChunk();
  });
}

function buildOsuChart(flux, frames, HOP, sr) {
  const onsets = []; 
  for (let b=0; b<4; b++) {
    const f=flux[b], avg=new Float32Array(frames);
    for (let i=0; i<frames; i++) { let s=0, c=0; for (let k=Math.max(0,i-30); k<=Math.min(frames-1,i+30); k++) { s+=f[k]; c++; } avg[i]=s/c; }
    let lp = -9999;
    for (let i=1; i<frames-1; i++) { 
      // 1.8x Média garante que apenas batidas limpas passam
      if (f[i]>f[i-1] && f[i]>f[i+1] && f[i]>avg[i]*1.8 && (i-lp)>(0.15*sr/HOP)) { onsets.push({ frame:i, col:b }); lp=i; } 
    }
  }
  onsets.sort((a,b)=>a.frame-b.frame);
  
  const chart=[]; 
  let lastFrame = -9999; 
  let notesInFrame = 0;
  
  for(let i=0; i<onsets.length; i++) { 
    const frame = onsets[i].frame;
    
    // Se a nota cai exatamente na mesma hora (Acorde)
    if (frame === lastFrame) {
        notesInFrame++;
        // Limita os acordes a no máximo 2 teclas juntas. Apaga 3ª ou 4ª teclas simultâneas.
        if (notesInFrame > 2) continue; 
    } else {
        // Se a nota é num tempo diferente, tem de ter um espaçamento de 0.10s
        if (frame - lastFrame < (0.10*sr/HOP)) continue;
        notesInFrame = 1;
    }
    
    chart.push({ time: frame*HOP/sr, col: onsets[i].col }); 
    lastFrame = frame; 
  }
  return chart;
}

// ==========================================
// GAMEPLAY ENGINE
// ==========================================
let game = null, animFrame = null;

function retryGame() {
  if(currentAudioFile && currentChartData.length > 0) { document.getElementById('pause-overlay').classList.remove('visible'); startCountdown(currentAudioFile.name.replace(/\.[^.]+$/, '')); } 
  else showScreen('load');
}

function startCountdown(fileName) {
  showScreen('countdown'); document.getElementById('countdown-song').textContent = fileName;
  const el = document.getElementById('countdown-num'); el.textContent = '3'; let n = 3;
  const tick = () => { n--; if(n===0) { el.textContent='GO!'; setTimeout(startGame, 700); return; } el.textContent=n; el.style.animation='none'; void el.offsetWidth; el.style.animation='countdown-pop 1s ease-out'; setTimeout(tick, 1000); };
  el.style.animation='countdown-pop 1s ease-out'; setTimeout(tick, 1000);
}

function startGame() {
  showScreen('game');
  for (let i=0; i<4; i++) document.getElementById('lane-'+i).querySelectorAll('.note,.hit-feedback').forEach(e=>e.remove());

  if (!currentAudioBuffer) return;   // segurança

  // Guarda o instante em que o áudio deve começar (2 segundos de espera)
  const startDelay = 2; // segundos
  const audioStartTime = audioCtx.currentTime + startDelay;

  // Cria o source e agenda
  const source = audioCtx.createBufferSource();
  source.buffer = currentAudioBuffer;
  source.connect(audioCtx.destination);
  source.start(audioStartTime);

  game = {
    chart: JSON.parse(JSON.stringify(currentChartData)).map(n => ({...n, hit: false, missed: false, el: null})),
    source: source,                // guardamos o nó para pausa
    startAudioTime: audioStartTime,// referência temporal da música
    score: 0, combo: 0, maxCombo: 0, hp: 100,
    p: 0, g: 0, m: 0, paused: false, run: true
  };

  updHUD();
  // O evento 'ended' agora é do source
  source.onended = () => {
    if(game && game.run && audioCtx.currentTime >= game.startAudioTime + currentAudioBuffer.duration - 0.1)
      endGame();
  };
  loop();
}

function loop() {
  if (!game || !game.run) return;
  if (game.paused || prevRun) { animFrame = requestAnimationFrame(loop); return; }

  // O tempo é calculado a partir do relógio de áudio, sincronizado perfeitamente
  let time = audioCtx.currentTime - game.startAudioTime;
  // Ajuste manual opcional (settings.audioOffset)
  time += settings.audioOffset / 1000;

  const speed = settings.noteSpeed, hlPct = settings.hitLinePos / 100;
  const spawnT = speed * hlPct + 0.15;

  for (const n of game.chart) {
    if (n.hit || n.missed || n.el) continue;
    if (time >= n.time - spawnT) { const lane = document.getElementById('lane-'+n.col); if(lane) { const el = document.createElement('div'); el.className = 'note'; lane.appendChild(el); n.el = el; } }
  }

  for (const n of game.chart) {
    if (!n.el || n.hit) continue;
    const elap = time - n.time, topPct = (hlPct + elap/speed) * 100;
    n.el.style.top = topPct + '%';

    if (!n.missed && elap > 0.25) {
      n.missed = true; n.el.classList.add('miss'); game.combo = 0; game.m++; game.hp -= 8;
      playMissSound(); showFB(n.col, 'ERRO', 'miss'); updHUD();
      setTimeout(() => { if(n.el){n.el.remove(); n.el=null;} }, 200);
    }
    if (topPct > 110) { if(n.el){n.el.remove(); n.el=null;} }
  }

  if (game.hp <= 0) { game.hp = 0; updHUD(); endGame(); return; }
  animFrame = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (listeningIndex >= 0) { settings.keys[listeningIndex] = e.key.toLowerCase(); const btn = document.getElementById('key-btn-'+listeningIndex); if(btn) { btn.textContent = e.key.toUpperCase(); btn.classList.remove('listening'); } listeningIndex = -1; e.preventDefault(); return; }
  
  if (e.key === 'Escape' && document.getElementById('screen-settings').classList.contains('active') && game && game.paused) { closeSettings(); return; }
  if (e.key === 'Escape' && prevRun) { stopPreview(); return; }
  if (!game || !game.run || game.paused) { if(e.key==='Escape' && document.getElementById('pause-overlay').classList.contains('visible')) resumeGame(); return; }
  if (e.key === 'Escape') { pauseGame(); return; }
  if (e.repeat) return;
  
  const col = settings.keys.indexOf(e.key.toLowerCase()); 
  if (col !== -1) {
    e.preventDefault(); 
    const lane = document.getElementById('lane-'+col); const rec = lane.querySelector('.receptor');
    rec.classList.add('active'); setTimeout(() => rec.classList.remove('active'), 150); hit(col);
  }
});

document.addEventListener('keyup', e => { 
  const col = settings.keys.indexOf(e.key.toLowerCase()); 
  if(col!==-1) {
    e.preventDefault();
    const lane = document.getElementById('lane-'+col); 
    if(lane) lane.querySelector('.receptor')?.classList.remove('active'); 
  }
});

function hit(col) {
  if(!game) return; 
  // Agora utiliza o audioCtx.currentTime para total sincronia
  let time = audioCtx.currentTime - game.startAudioTime;
  time += settings.audioOffset / 1000;
  
  let target = null;
  for (const n of game.chart) { 
    if(n.col!==col || n.hit || n.missed) continue; 
    if (Math.abs(time - n.time) <= 0.25) { if (!target || n.time < target.time) target = n; }
  }
  if(!target) return;

  const bDiff = Math.abs(time - target.time);
  
  if (bDiff <= 0.09) {
    target.hit = true; game.combo++; game.p++; game.hp += 3; game.score += 300*(1+Math.floor(game.combo/10)); playHitSound(); showFB(col, 'PERFEITO', 'perfect');
  } else if (bDiff <= 0.18) {
    target.hit = true; game.combo++; game.g++; game.hp += 1; game.score += 100*(1+Math.floor(game.combo/10)); playHitSound(); showFB(col, 'BOM', 'good');
  } else {
    target.hit = true; game.combo=0; game.m++; game.hp -= 8; playMissSound(); showFB(col, 'ERRO', 'miss');
  }
  
  game.maxCombo = Math.max(game.maxCombo, game.combo); game.hp = Math.min(100, game.hp);
  if(target.hit && target.el) { target.el.style.opacity='0'; setTimeout(()=>target.el?.remove(), 120); } updHUD();
}

function showFB(col, txt, type) {
  const l = document.getElementById('lane-'+col); if(!l) return; const e = document.createElement('div'); e.className = `hit-feedback ${type}`; e.textContent = txt;
  if(type==='perfect') e.style.color = settings.colors[2]; 
  if(type==='good') e.style.color = settings.colors[3]; 
  if(type==='miss') e.style.color = settings.colors[1]; 
  l.appendChild(e); setTimeout(()=>e.remove(), 400);
}

function updHUD() {
  document.getElementById('score-val').textContent = String(game.score).padStart(6,'0');
  const c = document.getElementById('combo-val'); c.textContent = game.combo+'x';
  document.getElementById('perfect-val').textContent = game.p; document.getElementById('good-val').textContent = game.g; document.getElementById('miss-val').textContent = game.m;
  const tot = game.p+game.g+game.m; document.getElementById('acc-val').textContent = tot===0 ? '100%' : Math.round((game.p*100 + game.g*50)/(tot*100)*100)+'%';
  
  document.getElementById('hp-fill').style.width = game.hp+'%';
  document.getElementById('hp-fill').style.background = game.hp > 50 ? settings.colors[2] : (game.hp > 20 ? settings.colors[3] : settings.colors[1]);
}

function pauseGame() {
  if(!game||!game.run)return;
  game.paused = true;
  game.pauseOffset = audioCtx.currentTime - game.startAudioTime;  // tempo já tocado
  try { game.source.stop(); } catch(e) {}
  document.getElementById('pause-overlay').classList.add('visible');
}

function resumeGame() {
  if(!game)return;
  // Cria novo source a partir do offset
  const source = audioCtx.createBufferSource();
  source.buffer = currentAudioBuffer;
  source.connect(audioCtx.destination);
  // Recalcula o novo startAudioTime para que o áudio prossiga do ponto onde parou
  game.startAudioTime = audioCtx.currentTime - game.pauseOffset;
  source.start(0, game.pauseOffset);   // inicia logo, mas a partir do offset
  game.source = source;
  game.paused = false;
  source.onended = () => {
    if(game && game.run && audioCtx.currentTime >= game.startAudioTime + currentAudioBuffer.duration - 0.1)
      endGame();
  };
  document.getElementById('pause-overlay').classList.remove('visible');
}

function quitGame() {
  if(game && game.source) {
    try { game.source.stop(); } catch(e) {}
  }
  document.getElementById('pause-overlay').classList.remove('visible');
  endGame();
}

function endGame() {
  if(!game) return;
  game.run = false;
  cancelAnimationFrame(animFrame);
  try { game.source.stop(); } catch(e) {}
  
  const tot = game.p+game.g+game.m; const acc = tot===0 ? 100 : Math.round((game.p*100 + game.g*50)/(tot*100)*100); let gr = 'D', cl = '#8b8b9e';
  if(game.hp<=0) { gr='F'; cl=settings.colors[1]; } else if(acc>=95 && game.m===0) { gr='S'; cl='#ffd700'; } else if(acc>=90) { gr='A'; cl=settings.colors[2]; } else if(acc>=80) { gr='B'; cl=settings.colors[0]; } else if(acc>=60) { gr='C'; cl=settings.colors[3]; }
  document.getElementById('results-grade').textContent = gr; document.getElementById('results-grade').style.color = cl;
  document.getElementById('r-score').textContent = String(game.score).padStart(6,'0'); document.getElementById('r-acc').textContent = acc+'%'; document.getElementById('r-combo').textContent = game.maxCombo;
  game = null;
  showScreen('results');
}

loadSettings();
