/* Floating Kota Banjar — clouds, cloud shadows and birds */
(() => {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Low golden-hour sun from the top-left: shadows fall toward the bottom-right.
  const SHADOW_DIR = { x: 0.62, y: 0.78 };
  // Gentle breeze drifting left and slightly down.
  const WIND = { x: -0.96, y: 0.27 };

  const map = document.getElementById("map");
  const ground = document.getElementById("ground");
  const cvS = document.getElementById("shadows");
  const cvM = document.getElementById("mid");
  const cvN = document.getElementById("near");
  const ctxS = cvS.getContext("2d");
  const ctxM = cvM.getContext("2d");
  const ctxN = cvN.getContext("2d");

  // start the title entrance once fonts are in (max 1.5s wait)
  const ready = () => document.documentElement.classList.add("ready");
  Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).then(ready);

  const reveal = () => map.classList.add("loaded");
  if (map.complete) reveal(); else map.addEventListener("load", reveal);

  let W = 0, H = 0, DPR = 1, BIG = 1, SCALE = 1;

  // Cloud layers, far (low parallax, small) to near (big, fast, over the title).
  const LAYERS = [
    { count: 4, size: [0.20, 0.30], speed: 10, alt: 0.45, alpha: 0.75, par: 18, shadow: 0.8, target: "mid" },
    { count: 3, size: [0.32, 0.46], speed: 17, alt: 0.7,  alpha: 0.9,  par: 30, shadow: 0.9, target: "mid" },
    { count: 1, size: [0.55, 0.75], speed: 30, alt: 1.0,  alpha: 0.7,  par: 55, shadow: 0.9, target: "near" },
  ];

  let clouds = [];
  let flocks = [];
  let nextFlock = 1.2;

  // ---------- cloud sprites ----------
  function makeCloudSprites(w) {
    const q = 0.75; // render below full res; clouds are soft anyway
    const h = w * 0.62;
    const mk = () => {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.ceil(w * q));
      c.height = Math.max(1, Math.ceil(h * q));
      const g = c.getContext("2d");
      g.scale(q, q);
      g.translate(w / 2, h / 2);
      return { c, g };
    };
    // cumulus: a few clusters of puffs, bigger toward each cluster's middle
    const puffs = [];
    const clusters = 3 + ((Math.random() * 3) | 0);
    for (let k = 0; k < clusters; k++) {
      const cx = rand(-0.24, 0.24) * w;
      const cy = rand(-0.06, 0.06) * w;
      const cr = w * rand(0.09, 0.14);
      const n = 6 + ((Math.random() * 6) | 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const d = Math.pow(Math.random(), 0.8);
        puffs.push({
          x: cx + Math.cos(a) * d * cr * 1.3,
          y: cy + Math.sin(a) * d * cr * 0.8,
          r: cr * (0.65 + 0.45 * (1 - d)) * rand(0.8, 1.15),
        });
      }
    }
    const puff = (g, x, y, r, stops) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    };

    const body = mk();
    // shaded underside, pushed away from the sun
    for (const p of puffs) puff(body.g, p.x + p.r * 0.22, p.y + p.r * 0.28, p.r * 1.05,
      [[0, "rgba(226,196,192,.5)"], [0.55, "rgba(216,184,182,.3)"], [1, "rgba(206,174,172,0)"]]);
    // sunlit tops
    for (const p of puffs) puff(body.g, p.x - p.r * 0.12, p.y - p.r * 0.15, p.r * 0.92,
      [[0, "rgba(255,250,242,.8)"], [0.35, "rgba(255,240,222,.55)"], [0.7, "rgba(255,226,196,.18)"], [1, "rgba(255,216,180,0)"]]);
    // warm rim light on the sun side
    for (const p of puffs) if (Math.random() < 0.5) puff(body.g, p.x - p.r * 0.4, p.y - p.r * 0.45, p.r * 0.55,
      [[0, "rgba(255,206,140,.45)"], [1, "rgba(255,190,120,0)"]]);

    const shadow = mk();
    for (const p of puffs) puff(shadow.g, p.x, p.y, p.r * 1.2,
      [[0, "rgba(44,24,56,.5)"], [0.55, "rgba(44,24,56,.3)"], [1, "rgba(44,24,56,0)"]]);

    return { body: body.c, shadow: shadow.c, w, h };
  }

  function shadowOffset(alt) {
    const d = alt * 0.2 * BIG;
    return { x: SHADOW_DIR.x * d, y: SHADOW_DIR.y * d };
  }

  function spawnCloud(layer, initial) {
    const w = rand(layer.size[0], layer.size[1]) * BIG;
    const s = makeCloudSprites(w);
    const off = shadowOffset(layer.alt);
    const cloud = { layer, ...s, off, x: 0, y: 0, speed: layer.speed * SCALE * rand(0.85, 1.15) };
    if (initial) {
      cloud.x = rand(-0.2 * W, 1.2 * W);
      cloud.y = rand(-0.2 * H, 1.1 * H);
    } else {
      // enter from the upwind (right) side, far enough that the shadow is also hidden
      cloud.x = W + w / 2 + rand(20, 0.3 * W);
      cloud.y = rand(-0.5 * H, 1.0 * H);
    }
    return cloud;
  }

  function cloudGone(c) {
    const left = Math.max(c.x, c.x + c.off.x) + c.w / 2 < -80;
    const below = Math.min(c.y, c.y + c.off.y) - c.h / 2 > H + 80;
    return left || below;
  }

  // ---------- birds (white egrets seen from above) ----------
  function spawnFlock() {
    const diag = Math.hypot(W, H);
    const heading = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.45, 0.45);
    const dx = Math.cos(heading), dy = Math.sin(heading);
    const along = rand(-0.3, 0.3) * H;
    const x = W / 2 - dx * (diag / 2 + 120) - dy * along;
    const y = H / 2 - dy * (diag / 2 + 120) + dx * along;
    const lone = Math.random() < 0.15;
    const n = lone ? 1 : 3 + ((Math.random() * 6) | 0);
    const vForm = !lone && Math.random() < 0.55;
    const alt = lone ? rand(0.3, 0.42) : rand(0.14, 0.26); // a lone bird flies closer to the camera
    const size = (lone ? rand(15, 19) : rand(10, 13)) * SCALE; // half wingspan, px
    const speed = rand(55, 80) * SCALE * (lone ? 1.15 : 1);
    const spacing = size * 2.4;
    const birds = [];
    for (let i = 0; i < n; i++) {
      let ox = 0, oy = 0;
      if (vForm && i > 0) {
        const k = Math.ceil(i / 2);
        ox = -k * spacing * rand(0.85, 1.15);
        oy = (i % 2 ? 1 : -1) * k * spacing * 0.75 * rand(0.85, 1.15);
      } else if (i > 0) {
        ox = rand(-3, 0.5) * spacing;
        oy = rand(-1.8, 1.8) * spacing;
      }
      birds.push({
        ox, oy, spacing,
        s1: Math.random() * TAU, s2: Math.random() * TAU, s3: Math.random() * TAU,
        phase: Math.random() * TAU,
        freq: rand(2.3, 3.0),
        size: size * rand(0.92, 1.06),
        gliding: Math.random() < 0.3,
        timer: rand(0.5, 3.5),
        t: 0,
      });
    }
    return { x, y, heading, turn: 0, turnTarget: rand(-0.08, 0.08), turnTimer: rand(2, 5),
      speed, alt, birds, t: 0, life: (diag + 800) / speed };
  }

  function updateFlock(f, dt) {
    f.t += dt;
    f.turnTimer -= dt;
    if (f.turnTimer <= 0) { f.turnTarget = rand(-0.1, 0.1); f.turnTimer = rand(2, 5); }
    f.turn += (f.turnTarget - f.turn) * Math.min(1, dt * 0.8);
    f.heading += f.turn * dt;
    f.x += Math.cos(f.heading) * f.speed * dt;
    f.y += Math.sin(f.heading) * f.speed * dt;
    for (const b of f.birds) {
      b.t += dt;
      b.timer -= dt;
      if (b.timer <= 0) {
        b.gliding = !b.gliding;
        b.timer = b.gliding ? rand(0.5, 1.4) : rand(1.8, 4.5);
      }
      if (b.gliding) {
        // settle with wings fully spread (mid-downstroke)
        const target = Math.ceil((b.phase - Math.PI / 2) / TAU) * TAU + Math.PI / 2;
        b.phase += Math.min(target - b.phase, b.freq * TAU * dt);
      } else {
        b.phase += b.freq * TAU * dt;
      }
    }
  }

  function birdPose(f, b) {
    // loose formation: each bird drifts slowly around its slot and yaws a little
    const ox = b.ox + Math.sin(b.t * 0.33 + b.s1) * b.spacing * 0.22;
    const oy = b.oy + Math.sin(b.t * 0.27 + b.s2) * b.spacing * 0.3;
    const c = Math.cos(f.heading), s = Math.sin(f.heading);
    return {
      x: f.x + c * ox - s * oy,
      y: f.y + s * ox + c * oy,
      ang: f.heading + Math.sin(b.t * 0.6 + b.s3) * 0.07,
    };
  }

  function flockGone(f) {
    if (f.t < f.life) return false;
    const m = 200;
    return f.x < -m || f.x > W + m || f.y < -m || f.y > H + m || f.t > f.life * 2;
  }

  // forward is +x; s = half wingspan
  function drawBird(ctx, x, y, ang, s, phase, isShadow) {
    // From above the wings look widest mid-stroke; on the upstroke they flex and fold in.
    const sn = Math.sin(phase);
    const ext = sn >= 0 ? 0.7 + 0.3 * sn : 0.7 - 0.14 * -sn;
    const fold = 1 - ext;
    const span = s * ext;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);

    if (!isShadow) {
      // legs trail behind the tail
      ctx.strokeStyle = "rgba(40,28,18,.7)";
      ctx.lineWidth = Math.max(0.5, s * 0.022);
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, -s * 0.02); ctx.lineTo(-s * 0.64, -s * 0.03);
      ctx.moveTo(-s * 0.24, s * 0.02);  ctx.lineTo(-s * 0.64, s * 0.03);
      ctx.stroke();
    }

    ctx.beginPath();
    for (const g of [-1, 1]) {
      const wx = s * 0.05 - fold * s * 0.1, wy = g * span * 0.55;
      const tx = -s * 0.1 - fold * s * 0.3, ty = g * span;
      ctx.moveTo(s * 0.1, g * s * 0.05);
      ctx.quadraticCurveTo(s * 0.13, g * span * 0.3, wx, wy);                // leading edge to wrist
      ctx.bezierCurveTo(wx - s * 0.01, g * span * 0.8, tx + s * 0.06, g * span * 0.98, tx, ty); // rounded hand
      ctx.quadraticCurveTo(-s * 0.24, g * span * 0.9, -s * 0.22, g * span * 0.5);  // trailing edge, primaries
      ctx.quadraticCurveTo(-s * 0.21, g * s * 0.16, -s * 0.13, g * s * 0.05);      // trailing edge, secondaries
      ctx.closePath();
    }
    ctx.ellipse(-s * 0.02, 0, s * 0.27, s * 0.09, 0, 0, TAU);             // body
    ctx.moveTo(-s * 0.26, 0);                                               // short tail
    ctx.quadraticCurveTo(-s * 0.36, -s * 0.08, -s * 0.42, -s * 0.03);
    ctx.lineTo(-s * 0.42, s * 0.03);
    ctx.quadraticCurveTo(-s * 0.36, s * 0.08, -s * 0.26, 0);
    ctx.moveTo(s * 0.33, 0);
    ctx.arc(s * 0.29, 0, s * 0.055, 0, TAU);                                // head (neck tucked in flight)

    if (isShadow) {
      ctx.fill();
    } else {
      ctx.fillStyle = "rgb(252,243,230)";
      ctx.fill();
      ctx.fillStyle = "rgb(232,176,60)";                                    // bill
      ctx.beginPath();
      ctx.moveTo(s * 0.33, -s * 0.018);
      ctx.lineTo(s * 0.46, 0);
      ctx.lineTo(s * 0.33, s * 0.018);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- pointer parallax ----------
  const ptr = { tx: 0, ty: 0, x: 0, y: 0 };
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    ptr.tx = (e.clientX / W) * 2 - 1;
    ptr.ty = (e.clientY / H) * 2 - 1;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { ptr.tx = 0; ptr.ty = 0; });

  // ---------- setup ----------
  function resize() {
    W = innerWidth || document.documentElement.clientWidth || 1;
    H = innerHeight || document.documentElement.clientHeight || 1;
    DPR = Math.min(devicePixelRatio || 1, 1.5);
    BIG = Math.max(W, H);
    SCALE = Math.min(Math.max(Math.min(W, H) / 900, 0.65), 1.3);
    for (const c of [cvS, cvM, cvN]) {
      c.width = Math.round(W * DPR);
      c.height = Math.round(H * DPR);
    }
    clouds = [];
    for (const layer of LAYERS) {
      const count = W < 700 ? Math.max(1, layer.count - 1) : layer.count;
      for (let i = 0; i < count; i++) clouds.push(spawnCloud(layer, true));
    }
  }

  // ---------- frame ----------
  function update(dt) {
    ptr.x += (ptr.tx - ptr.x) * Math.min(1, dt * 2.5);
    ptr.y += (ptr.ty - ptr.y) * Math.min(1, dt * 2.5);

    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.x += WIND.x * c.speed * dt;
      c.y += WIND.y * c.speed * dt;
      if (cloudGone(c)) clouds[i] = spawnCloud(c.layer, false);
    }

    nextFlock -= dt;
    if (nextFlock <= 0) {
      flocks.push(spawnFlock());
      nextFlock = rand(5, 11);
    }
    for (const f of flocks) updateFlock(f, dt);
    flocks = flocks.filter((f) => !flockGone(f));
  }

  function render() {
    for (const ctx of [ctxS, ctxM, ctxN]) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
    }
    const gx = -ptr.x * 12, gy = -ptr.y * 12;
    ground.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;

    // shadows on the ground (move with the ground)
    for (const c of clouds) {
      ctxS.globalAlpha = c.layer.shadow;
      ctxS.drawImage(c.shadow, c.x + c.off.x - c.w * 0.55 + gx, c.y + c.off.y - c.h * 0.55 + gy, c.w * 1.1, c.h * 1.1);
    }
    // Soft, faint bird shadows: draw the bird far off-canvas and let the canvas
    // shadow (which blurs, and works in every browser) land in the right place.
    const FAR = 10000;
    ctxS.globalAlpha = 1;
    ctxS.fillStyle = "#000";
    ctxS.shadowColor = "rgba(40,24,40,.26)";
    ctxS.shadowOffsetX = FAR * DPR;
    ctxS.shadowOffsetY = 0;
    for (const f of flocks) {
      const off = shadowOffset(f.alt * 0.6);
      for (const b of f.birds) {
        const p = birdPose(f, b);
        ctxS.shadowBlur = b.size * 0.35 * DPR;
        drawBird(ctxS, p.x + off.x + gx - FAR, p.y + off.y + gy, p.ang, b.size * 0.9, b.phase, true);
      }
    }
    ctxS.shadowColor = "transparent";
    ctxS.shadowBlur = 0;
    ctxS.shadowOffsetX = 0;

    // birds fly below every cloud layer
    ctxM.globalAlpha = 1;
    const bx = -ptr.x * 20, by = -ptr.y * 20;
    for (const f of flocks) {
      for (const b of f.birds) {
        const p = birdPose(f, b);
        drawBird(ctxM, p.x + bx, p.y + by, p.ang, b.size, b.phase, false);
      }
    }

    for (const c of clouds) {
      const ctx = c.layer.target === "near" ? ctxN : ctxM;
      ctx.globalAlpha = c.layer.alpha;
      const px = -ptr.x * c.layer.par, py = -ptr.y * c.layer.par;
      ctx.drawImage(c.body, c.x - c.w / 2 + px, c.y - c.h / 2 + py, c.w, c.h);
    }
  }

  let last = 0;
  function frame(t) {
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
    last = t;
    requestAnimationFrame(frame);
    if (innerWidth !== W || innerHeight !== H) resize();
    update(dt);
    render();
  }

  let resizeTimer;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); if (reduceMotion) render(); }, 150);
  });
  document.addEventListener("visibilitychange", () => { last = 0; });

  resize();
  if (reduceMotion) {
    render(); // a still frame: clouds and shadows, no motion
  } else {
    requestAnimationFrame(frame);
  }
})();
