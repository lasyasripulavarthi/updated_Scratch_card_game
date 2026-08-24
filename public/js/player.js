/* ==========================================================
   Nutri Delight – Player Portal  v10
   
   ROOT CAUSE FIXES in this version:
   ──────────────────────────────────
   BUG 1 (main): @mediapipe/camera_utils Camera() was passed the
     hidden 1×1 mpVideo element. Camera() internally calls
     getUserMedia() and REPLACES the video's srcObject, so
     MediaPipe was receiving 1×1 blank frames → zero detections.
     FIX: Removed Camera utility entirely. Drive MediaPipe with
     a requestAnimationFrame loop reading bgVideo directly.
     bgVideo is full-size, always playing. CSS transforms don't
     affect pixel data sent to MediaPipe.
   
   BUG 2: DEB_OFF=18 meant "Hand Detected" stayed visible for
     ~900ms after hand left frame (stale handPresent=true).
     FIX: Show/hide cursor & status IMMEDIATELY on each frame
     based on current `got` value. Debounce only prevents
     flickering on brief tracking loss within scratch logic.
   
   BUG 3: Open palm detection used wrist-distance comparison
     which fails when hand is tilted. 
     FIX: Use fingertip-y < pip-y (tip above pip = extended)
     for a front-facing upward/forward hand, with fallback.
   
   BUG 4: Palm centroid (average of wrist+5 tips) placed the
     scratch point at palm base, projecting behind the card top
     edge → `over=false` → never scratched.
     FIX: Use middle fingertip (lm[12]) as the scratch point.
     It's the highest/most-forward point of an open palm.
   
   mpVideo element is no longer used (kept in HTML for compat).
   ========================================================== */
(function () {
  'use strict';

  /* ── DOM ──────────────────────────────────────────────── */
  const welcomeScreen = document.getElementById('welcomeScreen');
  const gameScreen    = document.getElementById('gameScreen');
  const startBtn      = document.getElementById('startGameBtn');
  const welcomeLogo   = document.getElementById('welcomeLogo');
  const bgVideo       = document.getElementById('bgVideo');   // full-screen mirrored display
  const gpPalm        = document.getElementById('gpPalm');
  const gpFinger      = document.getElementById('gpFinger');
  const gestureStatus = document.getElementById('gestureStatus');
  const cardCanvas    = document.getElementById('cardCanvas');
  const rewardOverlay = document.getElementById('rewardOverlay');
  const rewardName    = document.getElementById('rewardName');
  const backHomeBtn   = document.getElementById('backHomeBtn');
  const handCursor    = document.getElementById('handCursor');
  const ctx           = cardCanvas.getContext('2d');

  /* ── Offscreen scratch canvas ─────────────────────────── */
  const scratch = document.createElement('canvas');
  const sctx    = scratch.getContext('2d');

  /* ── Tuning ───────────────────────────────────────────── */
  const MIN_PX       = 2;     // min card-px movement to draw a mark
  const MOVE_PX      = 8;     // min screen-px movement to count as active motion
  const BRUSH_RATIO  = 0.07;  // scratch brush radius / card width
  const REVEAL_AT    = 45;    // % cleared → auto reveal
  const PALM_THRESH  = 3;     // consecutive frames of open palm to confirm
  const CLOSE_THRESH = 5;     // consecutive closed-hand frames to stop

  /* ── State ────────────────────────────────────────────── */
  let started      = false;
  let revealed     = false;
  let pctTotal     = 0;
  let pctTick      = 0;
  let uiState      = '';
  let lastSpoken   = '';
  let isPalm       = false;   // debounced open-palm flag
  let palmFrames   = 0;
  let closeFrames  = 0;
  let px           = null;    // last scratch X on card canvas
  let py           = null;    // last scratch Y on card canvas
  let rafId        = null;
  let stream       = null;
  let lastSendTime = 0;
  let reloadLogoTimer = null;
  let sendInFlight = false;
  let cameraStarting = false;
  let resizeBound = false;
  let cursorVisible = false;
  let scratchActive = false;
  let lastCursorScreen = null;
  let lastCursorCard = null;
  let lastCursorLogAt = 0;
  let lastHandCount = -1;
  let handLandmarksSeen = false;
  let palmLogged = false;
  const SEND_FPS   = 30;      // how many frames/sec we send to MediaPipe

  /* ── Logo ─────────────────────────────────────────────── */
  const logo   = new Image();
  let   logoOk = false;
  let   pal    = { h:145, s:58, l:28 };
  const DEBUG_PREFIX = '[Player]';

  welcomeLogo.src = '/api/logo?t=' + Date.now();

  /* ══════════════════════════════════════════════════════
     BACK TO HOME — full reset
  ══════════════════════════════════════════════════════ */
  backHomeBtn.addEventListener('click', goHome);

  function goHome() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    sendInFlight = false;
    cameraStarting = false;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (reloadLogoTimer) { clearInterval(reloadLogoTimer); reloadLogoTimer = null; }
    if (bgVideo.srcObject) bgVideo.pause();
    bgVideo.srcObject = null;

    started = revealed = isPalm = false;
    palmFrames = closeFrames = pctTotal = pctTick = 0;
    uiState = lastSpoken = '';
    px = py = null;
    lastCursorScreen = null;
    lastCursorCard = null;
    lastCursorLogAt = 0;
    lastHandCount = -1;
    handLandmarksSeen = false;
    palmLogged = false;
    scratchActive = false;
    cursorVisible = false;

    rewardOverlay.style.display = 'none';
    handCursor.style.display    = 'none';
    gameScreen.style.display    = 'none';
    welcomeScreen.style.display = 'flex';
    welcomeLogo.src = '/api/logo?t=' + Date.now();
  }

  /* ══════════════════════════════════════════════════════
     START GAME
  ══════════════════════════════════════════════════════ */
  startBtn.addEventListener('click', () => {
    welcomeScreen.style.display = 'none';
    gameScreen.style.display    = 'block';
    started = true;
    init();
  });

  function init() {
    scratch.width = scratch.height = 1;
    document.fonts.ready.then(() => {
      loadLogo();
      setUI('noHand');
    });
    if (!resizeBound) {
      window.addEventListener('resize', handleResize, { passive: true });
      resizeBound = true;
    }
    startCamera();
    if (reloadLogoTimer) clearInterval(reloadLogoTimer);
    reloadLogoTimer = setInterval(() => { if (!revealed && started) loadLogo(); }, 15000);
  }

  function handleResize() {
    if (!revealed) sizeCard();
  }

  /* ══════════════════════════════════════════════════════
     CARD SIZING
  ══════════════════════════════════════════════════════ */
  function sizeCard() {
    const w = Math.round(Math.max(280, Math.min(520, window.innerWidth  * 0.38)));
    const h = Math.round(Math.max(360, Math.min(560, window.innerHeight * 0.62)));
    cardCanvas.width  = w; cardCanvas.height  = h;
    scratch.width     = w; scratch.height     = h;
    drawBase();
    if (!revealed) buildScratch();
    renderCard();
  }

  /* ══════════════════════════════════════════════════════
     SCRATCH LAYER — silver foil
  ══════════════════════════════════════════════════════ */
  function buildScratch() {
    const w = scratch.width, h = scratch.height;
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, w, h);

    /* silver gradient */
    const g = sctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0,    '#b8b8b8');
    g.addColorStop(0.20, '#ebebeb');
    g.addColorStop(0.50, '#cccccc');
    g.addColorStop(0.80, '#dedede');
    g.addColorStop(1,    '#a2a2a2');
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, w, h);

    /* noise */
    sctx.fillStyle = 'rgba(255,255,255,0.09)';
    for (let i = 0; i < 5000; i++) sctx.fillRect(Math.random()*w, Math.random()*h, 1, 1);
    sctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < 2500; i++) sctx.fillRect(Math.random()*w, Math.random()*h, 1, 1);

    /* diagonal foil lines */
    sctx.save();
    sctx.globalAlpha = 0.12; sctx.strokeStyle = '#fff'; sctx.lineWidth = 1;
    for (let i = -h; i < w+h; i += 6) { sctx.beginPath(); sctx.moveTo(i,0); sctx.lineTo(i+h,h); sctx.stroke(); }
    sctx.restore();

    /* horizontal sheen */
    sctx.strokeStyle = 'rgba(255,255,255,0.35)'; sctx.lineWidth = 1;
    for (let y = 4; y < h; y += 9) { sctx.beginPath(); sctx.moveTo(0,y); sctx.lineTo(w,y); sctx.stroke(); }

    /* logo baked into foil */
    if (logoOk && logo.naturalWidth > 0) {
      const pad = 20, maxW = w - pad*2, maxH = h * 0.55;
      const r   = Math.min(maxW/logo.naturalWidth, maxH/logo.naturalHeight);
      const lw  = logo.naturalWidth*r, lh = logo.naturalHeight*r;
      sctx.globalAlpha = 0.25;
      sctx.drawImage(logo, (w-lw)/2, (h-lh)/2, lw, lh);
      sctx.globalAlpha = 1;
    }

    /* SCRATCH HERE text */
    const fs = Math.round(w * 0.060), hs = Math.round(w * 0.030);
    sctx.fillStyle = 'rgba(30,30,30,0.70)';
    sctx.font = `bold ${fs}px Poppins,sans-serif`;
    sctx.textAlign = 'center';
    sctx.fillText('SCRATCH HERE', w/2, h*0.72);
    sctx.font = `500 ${hs}px Poppins,sans-serif`;
    sctx.fillStyle = 'rgba(40,40,40,0.52)';
    sctx.fillText('✋ Show open palm and move your hand', w/2, h*0.72 + fs*1.4);
    sctx.textAlign = 'start';

    sctx.globalCompositeOperation = 'destination-out';
    pctTotal = pctTick = 0;
    px = py = null;
  }

  /* ══════════════════════════════════════════════════════
     LOGO
  ══════════════════════════════════════════════════════ */
  function loadLogo() {
    logo.crossOrigin = 'anonymous';
    logo.onload  = () => { logoOk = true;  extractPalette(); sizeCard(); };
    logo.onerror = () => { logoOk = false; renderCard(); };
    logo.src = '/api/logo?t=' + Date.now();
  }

  function extractPalette() {
    try {
      const sz = 48, tmp = document.createElement('canvas');
      tmp.width = tmp.height = sz;
      const tc = tmp.getContext('2d');
      tc.drawImage(logo, 0, 0, sz, sz);
      const d = tc.getImageData(0,0,sz,sz).data;
      let rS=0,gS=0,bS=0,n=0;
      for (let i=0;i<d.length;i+=4){if(d[i+3]<100)continue;rS+=d[i];gS+=d[i+1];bS+=d[i+2];n++;}
      if (!n) return;
      const r=rS/n/255, gv=gS/n/255, b=bS/n/255;
      const mx=Math.max(r,gv,b), mn=Math.min(r,gv,b), lv=(mx+mn)/2;
      let h=0, s=0;
      if (mx!==mn) {
        const dd=mx-mn;
        s = lv>0.5 ? dd/(2-mx-mn) : dd/(mx+mn);
        if      (mx===r)  h=((gv-b)/dd+(gv<b?6:0))/6;
        else if (mx===gv) h=((b-r)/dd+2)/6;
        else              h=((r-gv)/dd+4)/6;
      }
      pal = { h:Math.round(h*360), s:Math.round(Math.max(30,Math.min(80,s*100))), l:Math.round(Math.max(20,Math.min(45,lv*100))) };
    } catch(_) {}
  }

  function pc(la, sa=0) {
    const {h,s,l}=pal;
    return `hsl(${h},${Math.min(100,s+sa)}%,${Math.max(5,Math.min(95,l+la))}%)`;
  }

  /* ══════════════════════════════════════════════════════
     CARD BASE
  ══════════════════════════════════════════════════════ */
  function drawBase() {
    const w=cardCanvas.width, h=cardCanvas.height;
    ctx.clearRect(0,0,w,h);

    const bg=ctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,   pc(+32,+6));
    bg.addColorStop(0.5, pc(+14));
    bg.addColorStop(1,   pc(-4,-4));
    ctx.fillStyle=bg; rrect(ctx,0,0,w,h,18); ctx.fill();

    ctx.save(); ctx.globalAlpha=0.055; ctx.strokeStyle='#fff'; ctx.lineWidth=10;
    for (let x=-h;x<w+h;x+=26){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+h,h);ctx.stroke();}
    ctx.restore();

    ctx.strokeStyle='rgba(255,215,0,0.72)'; ctx.lineWidth=3;
    rrect(ctx,4,4,w-8,h-8,15); ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.20)'; ctx.lineWidth=1;
    rrect(ctx,10,10,w-20,h-20,11); ctx.stroke();

    const ts=Math.max(14,Math.round(w*0.056)), ss=Math.max(10,Math.round(w*0.038));
    ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=5;
    ctx.fillStyle='#fff'; ctx.font=`800 ${ts}px Poppins,sans-serif`;
    ctx.fillText('NUTRI DELIGHT', 22, 28+ts);
    ctx.fillStyle='rgba(255,228,60,0.96)'; ctx.font=`700 ${ss}px Poppins,sans-serif`;
    ctx.fillText('SCRATCH & WIN', 22, 34+ts+ss);
    ctx.shadowBlur=0;

    if (logoOk && logo.naturalWidth>0) {
      const pad=20, top=44+ts+ss+12, bot=16;
      const mw=w-pad*2, mh=h-top-bot;
      const rat=Math.min(mw/logo.naturalWidth, mh/logo.naturalHeight);
      const lw=logo.naturalWidth*rat, lh=logo.naturalHeight*rat;
      ctx.drawImage(logo, (w-lw)/2, top+(mh-lh)/2, lw, lh);
    }
  }

  function renderCard() {
    drawBase();
    if (scratch.width>1) ctx.drawImage(scratch,0,0);
  }

  function debugLog(...args) {
    console.log(DEBUG_PREFIX, ...args);
  }

  function setCursorVisible(visible) {
    if (!visible) {
      handCursor.style.display = 'none';
      cursorVisible = false;
      return;
    }
    handCursor.style.display = 'block';
    cursorVisible = true;
  }

  function stopScratch(reason) {
    if (scratchActive) debugLog('Scratch stopped:', reason);
    scratchActive = false;
    breakStroke();
  }

  function startScratch() {
    if (!scratchActive) debugLog('Scratch started');
    scratchActive = true;
  }

  function dist2(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  /* ══════════════════════════════════════════════════════
     OPEN PALM DETECTION  (fixed algorithm)
     
     For a hand held up facing the camera:
       - Fingers point upward → tip.y < pip.y  (screen coords,
         y increases downward, so tip has SMALLER y than pip)
       - We check each finger: tip.y < pip.y AND
         tip.y < mcp.y (tip above the knuckle base too)
     
     Thumb is special: it extends sideways.
       Compare tip.x distance from palm center vs pip.x distance.
     
     Open palm: ≥ 4 fingers pass their extension test.
  ══════════════════════════════════════════════════════ */
  function detectOpenPalm(lm) {
    const fingers = [
      { tip: 8,  pip: 6,  mcp: 5  },
      { tip: 12, pip: 10, mcp: 9  },
      { tip: 16, pip: 14, mcp: 13 },
      { tip: 20, pip: 18, mcp: 17 },
    ];
    let extendedFingers = 0;

    for (const finger of fingers) {
      const tip = lm[finger.tip];
      const pip = lm[finger.pip];
      const mcp = lm[finger.mcp];
      const verticalOpen = tip.y < pip.y - 0.025 && pip.y < mcp.y - 0.01;
      const lengthOpen = dist2(tip, mcp) > dist2(pip, mcp) * 1.12;
      if (verticalOpen && lengthOpen) extendedFingers++;
    }

    const palmWidth = Math.max(dist2(lm[5], lm[17]), 0.001);
    const thumbSpread = dist2(lm[4], lm[5]) / palmWidth;
    const tipSpread =
      (dist2(lm[8], lm[12]) + dist2(lm[12], lm[16]) + dist2(lm[16], lm[20])) /
      (3 * palmWidth);

    return extendedFingers >= 4 && (thumbSpread > 0.5 || tipSpread > 0.32);
  }

  /* ══════════════════════════════════════════════════════
     SCRATCH DRAWING
  ══════════════════════════════════════════════════════ */
  function scratchAt(cx, cy) {
    if (revealed) return;
    if (px !== null) {
      const dx=cx-px, dy=cy-py;
      if (dx*dx+dy*dy < MIN_PX*MIN_PX) return;
    }
    const r = Math.round(scratch.width * BRUSH_RATIO);
    sctx.globalCompositeOperation = 'destination-out';
    if (px !== null) {
      sctx.beginPath();
      sctx.lineWidth=r*2; sctx.lineCap='round'; sctx.lineJoin='round';
      sctx.strokeStyle='rgba(0,0,0,1)';
      sctx.moveTo(px,py); sctx.lineTo(cx,cy);
      sctx.stroke();
    } else {
      sctx.beginPath();
      sctx.arc(cx,cy,r,0,Math.PI*2);
      sctx.fillStyle='rgba(0,0,0,1)'; sctx.fill();
    }
    px=cx; py=cy;
  }

  function breakStroke() { px=py=null; }

  function scratchPct() {
    if (++pctTick < 3) return pctTotal;
    pctTick=0;
    if (scratch.width<=1) return 0;
    const d=sctx.getImageData(0,0,scratch.width,scratch.height).data;
    let c=0;
    for (let i=3;i<d.length;i+=16){if(d[i]===0)c++;}
    pctTotal=(c/(d.length/16))*100;
    return pctTotal;
  }

  /* ══════════════════════════════════════════════════════
     REVEAL
  ══════════════════════════════════════════════════════ */
  async function doReveal() {
    if (revealed) return;
    revealed=true; breakStroke();
    sctx.globalCompositeOperation='source-over';
    sctx.clearRect(0,0,scratch.width,scratch.height);
    renderCard();
    handCursor.style.display='none';
    const rw=await fetchReward();
    rewardName.textContent=rw?rw.name:'Congratulations!';
    rewardOverlay.style.display='flex';
    setUI('done');
    if (typeof confetti==='function')
      confetti({spread:90,particleCount:220,origin:{y:0.55}});
  }

  async function fetchReward() {
    try { const r=await fetch('/api/rewards/random'); return r.ok?await r.json():null; }
    catch(_){ return null; }
  }

  /* ══════════════════════════════════════════════════════
     UI STATE
  ══════════════════════════════════════════════════════ */
  const STATUS = {
    noHand:     { text:'Hand not detected — place your hand in the camera view', cls:'gp-status-waiting', palm:false, finger:false },
    detected:   { text:'Hand detected — show your open palm ✋ to scratch',       cls:'gp-status-info',    palm:false, finger:true  },
    palmReady:  { text:'✋ Open palm detected — move over the card to scratch',    cls:'gp-status-ready',   palm:true,  finger:false },
    scratching: { text:'✋ Keep your palm open and move your hand to scratch!',    cls:'gp-status-active',  palm:true,  finger:false },
    progress:   { text:'✋ Keep scratching to reveal your reward!',                cls:'gp-status-active',  palm:true,  finger:false },
    done:       { text:'🎉 Your reward has been revealed!',                        cls:'gp-status-done',    palm:false, finger:false },
  };

  function setUI(s) {
    if (s===uiState) return;
    uiState=s;
    const cfg=STATUS[s]; if(!cfg) return;
    gestureStatus.textContent=cfg.text;
    gestureStatus.className='gp-status '+cfg.cls;
    gpPalm.classList.toggle('gp-active',   cfg.palm);
    gpFinger.classList.toggle('gp-active', cfg.finger);
    speakOnce(cfg.text);
  }

  /* ══════════════════════════════════════════════════════
     VOICE
  ══════════════════════════════════════════════════════ */
  const synth=window.speechSynthesis||null;
  if(synth){synth.getVoices();if(synth.onvoiceschanged!==undefined)synth.onvoiceschanged=()=>synth.getVoices();}

  function speakOnce(t){
    if(!synth||t===lastSpoken)return;
    lastSpoken=t; synth.cancel();
    const u=new SpeechSynthesisUtterance(t);
    u.rate=0.88;u.pitch=1;u.volume=1;
    const vs=synth.getVoices();
    const v=vs.find(v=>/en[-_]GB/i.test(v.lang)&&!v.localService)||vs.find(v=>/en[-_]US/i.test(v.lang)&&!v.localService)||vs.find(v=>v.lang.startsWith('en'));
    if(v)u.voice=v;
    synth.speak(u);
  }

  /* ══════════════════════════════════════════════════════
     MEDIAPIPE HANDS
  ══════════════════════════════════════════════════════ */
  const handsModel = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}`,
  });
  handsModel.setOptions({
    maxNumHands:            1,
    modelComplexity:        1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence:  0.5,
  });
  handsModel.onResults(onHandResults);

  /* ══════════════════════════════════════════════════════
     CAMERA — single stream, bgVideo only
     
     FIX: No Camera utility. We drive MediaPipe ourselves
     via requestAnimationFrame reading bgVideo directly.
     bgVideo is the only video element that matters.
     CSS transform:scaleX(-1) does NOT affect pixel data.
  ══════════════════════════════════════════════════════ */
  async function startCamera() {
    if (cameraStarting) return;
    cameraStarting = true;
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      sendInFlight = false;
      lastSendTime = 0;

      stream = await navigator.mediaDevices.getUserMedia({
        video: { width:{ideal:1280}, height:{ideal:720}, facingMode:'user' },
        audio: false,
      });
      debugLog('Camera stream started');
      bgVideo.srcObject = stream;
      await bgVideo.play();
      await waitForVideoReady();
      debugLog('Video dimensions ready:', `${bgVideo.videoWidth}x${bgVideo.videoHeight}`);
      startRAF();
    } catch(e) {
      console.error('Camera error:', e);
      if (gestureStatus) gestureStatus.textContent = 'Camera access denied. Allow camera and refresh.';
    } finally {
      cameraStarting = false;
    }
  }

  async function waitForVideoReady() {
    const startedAt = performance.now();
    while (performance.now() - startedAt < 5000) {
      if (
        bgVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !bgVideo.paused &&
        bgVideo.videoWidth > 0 &&
        bgVideo.videoHeight > 0
      ) {
        return;
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    throw new Error('Video dimensions were not ready in time.');
  }

  /* ── RAF loop: throttled to SEND_FPS, sends bgVideo to MP ─ */
  function startRAF() {
    if (rafId) cancelAnimationFrame(rafId);
    debugLog('Hand tracking started');
    function tick(ts) {
      rafId = requestAnimationFrame(tick);
      if (!started || revealed) return;
      if (
        bgVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        bgVideo.paused ||
        bgVideo.videoWidth === 0 ||
        bgVideo.videoHeight === 0
      ) {
        return;
      }
      if (sendInFlight) return;
      if (ts - lastSendTime < 1000 / SEND_FPS) return;
      lastSendTime = ts;
      sendInFlight = true;
      handsModel.send({ image: bgVideo })
        .catch(e => console.warn('MP send error:', e))
        .finally(() => { sendInFlight = false; });
    }
    rafId = requestAnimationFrame(tick);
  }

  /* ══════════════════════════════════════════════════════
     COORDINATE MAPPING
     
     bgVideo is displayed with CSS scaleX(-1) (mirror).
     Its getBoundingClientRect() returns the VISUAL rect
     (full viewport: position:absolute, inset:0, object-fit:cover).
     
     MediaPipe gives landmark (nx, ny) in [0,1] of the RAW
     (unmirrored) camera frame. bgVideo also receives the raw
     frame as pixel data — CSS transform is visual only.
     
     To find where a landmark appears ON SCREEN:
       Because bgVideo is visually mirrored (scaleX -1):
         screenX = vrLeft + (1 - nx) * vrWidth
         screenY = vrTop  + ny * vrHeight
     
     object-fit:cover may crop the video. We correct for this:
       If viewport is wider than video AR → pillarbox (no crop Y)
       If viewport is taller than video AR → letterbox (no crop X)
     
     Then map screen → card canvas via getBoundingClientRect.
  ══════════════════════════════════════════════════════ */
  function lmToScreen(nx, ny) {
    const vr    = bgVideo.getBoundingClientRect();
    const vW    = bgVideo.videoWidth  || 640;
    const vH    = bgVideo.videoHeight || 480;
    const vrAR  = vr.width / vr.height;
    const vidAR = vW / vH;

    const scale = Math.max(vr.width / vW, vr.height / vH);
    const cW = vW * scale;
    const cH = vH * scale;
    const oX = (vr.width  - cW) / 2;
    const oY = (vr.height - cH) / 2;

    return {
      sx: vr.left + oX + (1 - nx) * cW,   // mirror X
      sy: vr.top  + oY +       ny  * cH,
    };
  }

  function lmToCard(nx, ny) {
    const {sx, sy} = lmToScreen(nx, ny);
    const cr  = cardCanvas.getBoundingClientRect();
    const rx  = sx - cr.left;
    const ry  = sy - cr.top;
    return {
      cx:   (rx / cr.width)  * cardCanvas.width,
      cy:   (ry / cr.height) * cardCanvas.height,
      over: rx >= -20 && rx <= cr.width + 20 && ry >= -20 && ry <= cr.height + 20,
    };
  }

  /* ══════════════════════════════════════════════════════
     HAND RESULT HANDLER  — called on every processed frame
  ══════════════════════════════════════════════════════ */
  function onHandResults(results) {
    if (!started || revealed) return;

    const handCount = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
    const got = handCount > 0;

    if (handCount !== lastHandCount) {
      debugLog('Hands detected:', handCount);
      lastHandCount = handCount;
    }

    /* ── IMMEDIATE visibility update (no debounce for UI/cursor) ──
       This fixes the "Hand Detected when no hand is present" bug.
       The cursor and status respond to every single frame result.   */
    if (!got) {
      if (handLandmarksSeen) debugLog('No hand detected');
      setCursorVisible(false);
      isPalm = false;
      palmFrames = closeFrames = 0;
      palmLogged = false;
      handLandmarksSeen = false;
      lastCursorScreen = null;
      lastCursorCard = null;
      stopScratch('hand lost');
      setUI('noHand');
      return;
    }

    /* ── Hand IS present in this frame ── */
    const lm       = results.multiHandLandmarks[0];
    const openNow  = detectOpenPalm(lm);

    if (!handLandmarksSeen) {
      debugLog('Hand landmarks received');
      handLandmarksSeen = true;
    }
    if (openNow && !palmLogged) {
      debugLog('Open palm detected');
      palmLogged = true;
    } else if (!openNow && palmLogged) {
      debugLog('Open palm released');
      palmLogged = false;
    }

    /* Debounce palm state to prevent flickering */
    if (openNow)  { palmFrames++;  closeFrames=0; }
    else          { closeFrames++; palmFrames=0;  }
    if (!isPalm && palmFrames  >= PALM_THRESH)  isPalm=true;
    if ( isPalm && closeFrames >= CLOSE_THRESH) { isPalm=false; stopScratch('open palm released'); }

    /* ── Cursor: use middle fingertip (lm[12]) when palm open,
       index fingertip (lm[8]) otherwise ──
       Middle fingertip is the topmost point of an open palm,
       giving the most natural "this is where I'm pointing" feel. */
    const cursorLm  = isPalm ? lm[12] : lm[8];
    const {sx, sy}  = lmToScreen(cursorLm.x, cursorLm.y);
    const movementPx = lastCursorScreen
      ? Math.hypot(sx - lastCursorScreen.sx, sy - lastCursorScreen.sy)
      : 0;
    lastCursorScreen = { sx, sy };
    handCursor.style.left    = sx + 'px';
    handCursor.style.top     = sy + 'px';
    setCursorVisible(true);
    if (performance.now() - lastCursorLogAt > 500) {
      debugLog('Cursor coordinates:', Math.round(sx), Math.round(sy));
      lastCursorLogAt = performance.now();
    }

    if (!isPalm) {
      lastCursorCard = null;
      stopScratch('palm not active');
      setUI('detected');
      return;
    }

    /* ── Open palm confirmed — map to card ── */
    const {cx, cy, over} = lmToCard(lm[12].x, lm[12].y);
    const movementCard = lastCursorCard
      ? Math.hypot(cx - lastCursorCard.cx, cy - lastCursorCard.cy)
      : 0;
    lastCursorCard = { cx, cy };

    if (!over) {
      stopScratch('cursor outside card');
      setUI('palmReady');
      return;
    }

    if (movementPx < MOVE_PX || movementCard < MIN_PX) {
      stopScratch('cursor stationary');
      setUI('palmReady');
      return;
    }

    /* ── SCRATCH — open palm over card ── */
    startScratch();
    scratchAt(cx, cy);
    renderCard();

    const pct = scratchPct();
    setUI(pct < 5 ? 'scratching' : 'progress');
    if (pct >= REVEAL_AT) doReveal();
  }

  /* ══════════════════════════════════════════════════════
     CANVAS HELPER
  ══════════════════════════════════════════════════════ */
  function rrect(c,x,y,w,h,r){
    c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);
    c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);
    c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();
  }

  /* ══════════════════════════════════════════════════════
     MOUSE / TOUCH FALLBACK (for testing without camera)
  ══════════════════════════════════════════════════════ */
  let md=false;
  cardCanvas.addEventListener('pointerdown', e=>{
    if(revealed)return; md=true; px=null;
    scratchAt(e.offsetX,e.offsetY); setUI('scratching'); renderCard();
  });
  cardCanvas.addEventListener('pointermove', e=>{
    if(!md||revealed)return;
    scratchAt(e.offsetX,e.offsetY);
    const p=scratchPct();
    if(p>=REVEAL_AT){doReveal();return;}
    setUI(p>5?'progress':'scratching'); renderCard();
  });
  cardCanvas.addEventListener('pointerup',   ()=>{ md=false; breakStroke(); if(!revealed&&scratchPct()>=REVEAL_AT)doReveal(); });
  cardCanvas.addEventListener('pointerleave',()=>{ if(md)breakStroke(); md=false; });

})();
