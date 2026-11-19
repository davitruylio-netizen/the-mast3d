
"use strict";

// =====================================================
// PROJECT ECHO — ANIMATION OVERDRIVE
// Movimento acrobático, expressivo e elástico
// =====================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = 1280;
const H = 720;

canvas.width = W;
canvas.height = H;

const $ = id => document.getElementById(id);

const ui = {
  objective: $("objective"),
  status: $("status"),
  checkpoint: $("checkpoint"),
  message: $("message"),
  pause: $("pause-screen")
};

let running = true;
let paused = false;
let won = false;

let time = 0;
let camera = 0;
let shake = 0;
let lastTime = 0;

const keys = {
  left: false,
  right: false,
  jump: false,
  slide: false,
  jumpPressed: false
};

const particles = [];
const speedLines = [];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const approach = (a, b, amount) => a + (b - a) * clamp(amount, 0, 1);

// =====================================================
// LEVEL
// =====================================================

const level = {
  width: 3000,
  gravity: 1900,

  platforms: [
    {x:0,y:630,w:570,h:90},
    {x:650,y:630,w:460,h:90},
    {x:1190,y:630,w:350,h:90},
    {x:1650,y:630,w:420,h:90},
    {x:2180,y:630,w:820,h:90},

    {x:280,y:495,w:150,h:18},
    {x:490,y:405,w:140,h:18},
    {x:750,y:505,w:145,h:18},
    {x:1300,y:495,w:170,h:18},
    {x:1740,y:465,w:150,h:18},
    {x:1980,y:380,w:150,h:18},
    {x:2350,y:490,w:150,h:18}
  ],

  walls: [
    {x:620,y:485,w:30,h:145},
    {x:1540,y:405,w:30,h:225},
    {x:2110,y:395,w:30,h:235}
  ],

  crate: {x:850,y:570,w:55,h:60},
  plate: {x:1000,y:614,w:75,h:16,pressed:false},
  door: {x:1150,y:420,w:35,h:210,open:false},
  checkpoint: {x:1690,active:false},
  exit: {x:2700,y:500,w:55,h:130}
};

// =====================================================
// PLAYER
// =====================================================

const player = {
  x:100, y:550, w:35, h:78,
  vx:0, vy:0,

  facing:1,
  grounded:false,
  wasGrounded:false,
  wallSide:0,

  coyote:0,
  buffer:0,

  jumps:0,
  maxJumps:2,

  sliding:false,
  state:"idle",
  previousState:"idle",

  // Animação
  animation:0,
  runPhase:0,
  bodyAngle:0,
  squash:1,
  stretch:1,
  bounce:0,
  lean:0,
  anticipation:0,
  landing:0,
  spin:0,
  spinVelocity:0,
  airTime:0,
  blink:0,
  expression:0,
  handSwing:0,

  trail:[],
  invulnerable:0
};

const spawn = {x:100,y:550};

// =====================================================
// INPUT
// =====================================================

function setKey(name, value) {
  if (name === "jump" && value && !keys.jump) {
    keys.jumpPressed = true;
  }
  keys[name] = value;
}

window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();

  if (["arrowleft","arrowright","arrowup","arrowdown"," "].includes(k)) {
    e.preventDefault();
  }

  if (k === "a" || k === "arrowleft") setKey("left", true);
  if (k === "d" || k === "arrowright") setKey("right", true);
  if (k === "w" || k === "arrowup" || k === " ") setKey("jump", true);
  if (k === "s" || k === "arrowdown") setKey("slide", true);
  if (k === "escape") togglePause();
});

window.addEventListener("keyup", e => {
  const k = e.key.toLowerCase();

  if (k === "a" || k === "arrowleft") setKey("left", false);
  if (k === "d" || k === "arrowright") setKey("right", false);
  if (k === "w" || k === "arrowup" || k === " ") setKey("jump", false);
  if (k === "s" || k === "arrowdown") setKey("slide", false);
});

document.querySelectorAll("[data-key]").forEach(btn => {
  const name = btn.dataset.key;

  btn.addEventListener("pointerdown", e => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    setKey(name, true);
  });

  const release = () => setKey(name, false);

  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("lostpointercapture", release);
});

// =====================================================
// COLLISIONS
// =====================================================

function hit(a, b) {
  return a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y;
}

function solids() {
  const list = [...level.platforms, ...level.walls];
  if (!level.door.open) list.push(level.door);
  return list;
}

function movePlayer(dt) {
  player.x += player.vx * dt;
  player.wallSide = 0;

  for (const s of solids()) {
    if (!hit(player, s)) continue;

    if (player.vx > 0) {
      player.x = s.x - player.w;
      player.wallSide = 1;
    } else if (player.vx < 0) {
      player.x = s.x + s.w;
      player.wallSide = -1;
    }

    player.vx = 0;
  }

  player.y += player.vy * dt;
  player.grounded = false;

  for (const s of solids()) {
    if (!hit(player, s)) continue;

    if (player.vy >= 0) {
      player.y = s.y - player.h;
      player.vy = 0;
      player.grounded = true;
      player.jumps = 0;
    } else {
      player.y = s.y + s.h;
      player.vy = 0;
    }
  }

  player.x = clamp(player.x, 0, level.width - player.w);

  if (player.grounded) {
    player.coyote = .13;
  } else {
    player.coyote = Math.max(0, player.coyote - dt);
  }
}

// =====================================================
// MOVEMENT + ANIMATION PHYSICS
// =====================================================

function updatePlayer(dt) {
  const p = player;
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

  p.wasGrounded = p.grounded;
  p.previousState = p.state;

  if (dir) p.facing = dir;

  if (keys.jumpPressed) {
    p.buffer = .16;
    p.anticipation = 1;
  } else {
    p.buffer = Math.max(0, p.buffer - dt);
  }

  p.sliding = keys.slide && p.grounded;

  const acceleration = p.grounded ? 3100 : 1750;
  const maxSpeed = p.sliding ? 550 : 440;

  if (dir) {
    p.vx += dir * acceleration * dt;
  } else {
    p.vx *= Math.pow(p.grounded ? .0003 : .16, dt);
  }

  p.vx = clamp(p.vx, -maxSpeed, maxSpeed);

  if (p.sliding) {
    p.vx += p.facing * 360 * dt;
    p.vx = clamp(p.vx, -590, 590);
  }

  // Jump, double jump and wall jump
  if (p.buffer > 0) {
    if (p.grounded || p.coyote > 0) {
      p.vy = -850;
      p.jumps = 1;
      p.grounded = false;
      p.coyote = 0;
      p.buffer = 0;
      p.squash = .72;
      p.stretch = 1.3;
      p.spinVelocity = 0;
      burst(p.x + 17, p.y + 78, 18);
      shake = Math.max(shake, 3);

    } else if (p.wallSide !== 0) {
      p.vy = -810;
      p.vx = -p.wallSide * 560;
      p.facing = -p.wallSide;
      p.jumps = 1;
      p.wallSide = 0;
      p.buffer = 0;
      p.spinVelocity = -p.facing * 5;
      p.stretch = 1.25;
      burst(p.x + 17, p.y + 40, 20);
      shake = Math.max(shake, 4);

    } else if (p.jumps < p.maxJumps) {
      p.vy = -790;
      p.jumps++;
      p.buffer = 0;
      p.spinVelocity = -p.facing * 7;
      p.squash = .7;
      p.stretch = 1.35;
      burst(p.x + 17, p.y + 40, 16);
      shake = Math.max(shake, 3);
    }
  }

  if (!keys.jump && p.vy < -180) {
    p.vy += 2100 * dt;
  }

  p.vy += level.gravity * dt;
  p.vy = Math.min(p.vy, 1100);

  movePlayer(dt);

  // Detect landing
  if (!p.wasGrounded && p.grounded) {
    const impact = clamp(Math.abs(p.vy) / 900, .2, 1);
    p.landing = impact;
    p.squash = 1 - impact * .35;
    p.stretch = 1 + impact * .18;
    p.bounce = impact;
    p.spinVelocity *= .3;

    burst(p.x + 17, p.y + 77, Math.round(7 + impact * 12));
    shake = Math.max(shake, impact * 7);
  }

  // State machine
  if (!p.grounded) {
    p.airTime += dt;

    if (p.wallSide !== 0 && p.vy > 100 && dir === p.wallSide) {
      p.state = "wallslide";
      p.vy = Math.min(p.vy, 230);
    } else {
      p.state = p.vy < 0 ? "jump" : "fall";
    }
  } else {
    p.airTime = 0;

    if (p.sliding) p.state = "slide";
    else if (Math.abs(p.vx) > 35) p.state = "run";
    else p.state = "idle";
  }

  // Animation phase accelerates with actual movement
  const movementSpeed = Math.abs(p.vx);
  const runRate = 8 + movementSpeed * .045;
  p.runPhase += dt * runRate;

  p.animation += dt * (p.state === "run" ? runRate : 8);

  // Body anticipation and recovery
  p.anticipation = approach(p.anticipation, 0, dt * 8);
  p.landing = approach(p.landing, 0, dt * 4.5);
  p.bounce = approach(p.bounce, 0, dt * 5);
  p.squash = approach(p.squash, 1, dt * 10);
  p.stretch = approach(p.stretch, 1, dt * 9);

  const targetLean = p.grounded
    ? clamp(p.vx / 440, -1, 1) * .22
    : clamp(p.vx / 650, -1, 1) * .35;

  p.lean = approach(p.lean, targetLean, dt * 9);

  const targetAngle =
    p.state === "run" ? Math.sin(p.runPhase) * .08 :
    p.state === "slide" ? -.15 :
    p.state === "jump" ? -.12 :
    p.state === "fall" ? .12 :
    p.state === "wallslide" ? -.2 : 0;

  p.bodyAngle = approach(p.bodyAngle, targetAngle, dt * 12);

  p.spin += p.spinVelocity * dt;
  p.spinVelocity *= Math.pow(.08, dt);

  if (p.grounded) p.spin = approach(p.spin, 0, dt * 5);

  p.blink = Math.max(0, p.blink - dt);
  if (Math.random() < dt * .18) p.blink = .12;

  if (p.invulnerable > 0) p.invulnerable -= dt;

  if (p.y > 850) respawn();

  // Speed particles
  if (p.grounded && movementSpeed > 300 && Math.random() < dt * 22) {
    burst(p.x + 17, p.y + 76, 1);
  }

  if (movementSpeed > 240 && Math.random() < dt * 20) {
    speedLines.push({
      x: p.x + 17,
      y: p.y + 25 + Math.random() * 35,
      vx: -p.facing * (180 + Math.random() * 250),
      life: .15 + Math.random() * .15,
      maxLife: .3
    });
  }

  p.trail.push({
    x: p.x + 17,
    y: p.y + 38,
    life: .22,
    maxLife: .22,
    alpha: movementSpeed > 150 ? .2 : 0
  });

  if (p.trail.length > 12) p.trail.shift();

  keys.jumpPressed = false;
}

// =====================================================
// PUZZLES
// =====================================================

function updateCrate(dt) {
  const c = level.crate;
  const oldY = c.y;

  c.y += level.gravity * dt;
  if (c.y >= 570) c.y = 570;

  for (const platform of level.platforms) {
    if (
      c.x + c.w > platform.x &&
      c.x < platform.x + platform.w &&
      oldY + c.h <= platform.y + 5 &&
      c.y + c.h >= platform.y
    ) {
      c.y = platform.y - c.h;
    }
  }

  if (hit(player, c)) {
    if (player.vx > 0) c.x = player.x + player.w;
    else if (player.vx < 0) c.x = player.x - c.w;

    c.x = clamp(c.x, 650, 1100 - c.w);
  }
}

function updatePuzzle(dt) {
  updateCrate(dt);

  const c = level.crate;
  const p = level.plate;

  p.pressed = hit(c, p) || hit(player, p);
  level.door.open = p.pressed;

  if (p.pressed) {
    ui.objective.textContent = "Porta desbloqueada!";
    ui.status.textContent = "PUZZLE RESOLVIDO";
  } else {
    ui.objective.textContent = "Empurre a caixa até o botão";
    ui.status.textContent = "RESOLVA O MECANISMO";
  }

  if (player.x > level.checkpoint.x - 70 && !level.checkpoint.active) {
    level.checkpoint.active = true;
    ui.checkpoint.textContent = "02";
    burst(level.checkpoint.x, 550, 30);
  }

  if (hit(player, level.exit)) winGame();
}

// =====================================================
// RESPAWN
// =====================================================

function respawn() {
  player.x = level.checkpoint.active ? level.checkpoint.x : spawn.x;
  player.y = level.checkpoint.active ? 490 : spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  player.squash = .7;
  player.stretch = 1.25;
  player.spin = 0;
  player.invulnerable = 1.2;
  shake = 12;
  burst(player.x + 17, player.y + 40, 20);
}

// =====================================================
// PARTICLES
// =====================================================

function burst(x, y, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 280;

    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: .35 + Math.random() * .55,
      maxLife: .9,
      size: 2 + Math.random() * 4
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt;
    p.life -= dt;
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  for (const s of speedLines) {
    s.x += s.vx * dt;
    s.life -= dt;
  }

  for (let i = speedLines.length - 1; i >= 0; i--) {
    if (speedLines[i].life <= 0) speedLines.splice(i, 1);
  }

  for (const t of player.trail) t.life -= dt;
}

// =====================================================
// CAMERA
// =====================================================

function updateCamera(dt) {
  const target = player.x - W * .38;
  camera += (target - camera) * (1 - Math.exp(-7 * dt));
  camera = clamp(camera, 0, level.width - W);
  shake = Math.max(0, shake - 35 * dt);
}

// =====================================================
// BACKGROUND
// =====================================================

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#091727");
  g.addColorStop(.65, "#142638");
  g.addColorStop(1, "#1a2936");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 22; i++) {
    const x = i * 190 - (camera * .18) % 190;
    const height = 160 + (i * 73 % 210);

    ctx.fillStyle = i % 2 ? "#122335" : "#172b3e";
    ctx.fillRect(x, H - height, 130, height);

    ctx.fillStyle = "#31516a44";
    for (let j = 0; j < 5; j++) {
      ctx.fillRect(x + 15 + j * 23, H - height + 25, 8, 30);
    }
  }

  ctx.fillStyle = "#203b50";
  ctx.fillRect(0, 145, W, 9);

  for (let i = 0; i < 8; i++) {
    const x = (i * 190 - camera * .35 % W + W) % W;
    const pulse = .5 + Math.sin(time * 2 + i) * .25;

    ctx.fillStyle = `rgba(65,220,235,${pulse * .12})`;
    ctx.beginPath();
    ctx.arc(x, 260, 100, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 55; i++) {
    const x = (i * 173 + time * 12 - camera * .4) % W;
    const y = (i * 97 + Math.sin(time + i) * 20) % H;

    ctx.fillStyle = "#b5e8ed55";
    ctx.fillRect(x, y, 2, 2);
  }
}

// =====================================================
// WORLD
// =====================================================

function drawPlatform(p) {
  ctx.fillStyle = "#243747";
  ctx.fillRect(p.x, p.y, p.w, p.h);

  ctx.fillStyle = "#587184";
  ctx.fillRect(p.x, p.y, p.w, 5);

  ctx.fillStyle = "#162635";
  ctx.fillRect(p.x, p.y + 10, p.w, p.h - 10);

  for (let x = p.x + 10; x < p.x + p.w; x += 45) {
    ctx.fillStyle = "#536a7b55";
    ctx.fillRect(x, p.y + 15, 2, p.h - 20);
  }
}

function drawWorld() {
  ctx.save();
  ctx.translate(-camera, 0);

  level.platforms.forEach(drawPlatform);

  for (const wall of level.walls) {
    ctx.fillStyle = "#263a4c";
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.fillStyle = "#5a7587";
    ctx.fillRect(wall.x, wall.y, 4, wall.h);
  }

  const c = level.crate;

  ctx.fillStyle = "#172a3c";
  ctx.fillRect(c.x, c.y, c.w, c.h);

  ctx.strokeStyle = "#82a6b8";
  ctx.lineWidth = 3;
  ctx.strokeRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);

  ctx.strokeStyle = "#54778b";
  ctx.beginPath();
  ctx.moveTo(c.x + 8, c.y + 8);
  ctx.lineTo(c.x + c.w - 8, c.y + c.h - 8);
  ctx.moveTo(c.x + c.w - 8, c.y + 8);
  ctx.lineTo(c.x + 8, c.y + c.h - 8);
  ctx.stroke();

  const p = level.plate;
  ctx.fillStyle = p.pressed ? "#56e6ed" : "#536578";
  ctx.fillRect(p.x, p.y, p.w, p.h);

  if (!level.door.open) {
    ctx.fillStyle = "#17283b";
    ctx.fillRect(level.door.x, level.door.y, level.door.w, level.door.h);

    ctx.strokeStyle = "#6d879c";
    ctx.strokeRect(
      level.door.x + 4,
      level.door.y + 4,
      level.door.w - 8,
      level.door.h - 8
    );
  } else {
    ctx.fillStyle = "#56e6ed33";
    ctx.fillRect(level.door.x, level.door.y, level.door.w, level.door.h);
  }

  const cp = level.checkpoint;
  ctx.fillStyle = cp.active ? "#56e6ed" : "#61778a";
  ctx.fillRect(cp.x, 530, 5, 100);

  ctx.beginPath();
  ctx.moveTo(cp.x + 5, 532);
  ctx.lineTo(cp.x + 65, 550);
  ctx.lineTo(cp.x + 5, 570);
  ctx.closePath();
  ctx.fill();

  const e = level.exit;

  ctx.fillStyle = "#142a3c";
  ctx.fillRect(e.x, e.y, e.w, e.h);

  ctx.strokeStyle = "#56e6ed";
  ctx.lineWidth = 3;
  ctx.strokeRect(e.x, e.y, e.w, e.h);

  ctx.shadowColor = "#56e6ed";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#56e6ed";
  ctx.fillRect(e.x + 24, e.y + 15, 6, 100);
  ctx.shadowBlur = 0;

  ctx.restore();
}

// =====================================================
// CHARACTER DRAWING HELPERS
// =====================================================

function line(x1, y1, x2, y2, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function ellipse(x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoot(x, y, rotation, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#102638";
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#56e6ed";
  ctx.beginPath();
  ctx.ellipse(5, 3, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#a7faff";
  ctx.fillRect(-5, -3, 7, 2);

  ctx.restore();
}

function drawGlove(x, y, rotation, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#c8e8ed";
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(5, -5, 3, 5, -.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(-5, -5, 3, 5, .3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#56e6ed";
  ctx.beginPath();
  ctx.ellipse(0, 5, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// =====================================================
// NEW CHARACTER — ANIMATION OVERDRIVE
// =====================================================

function drawPlayer() {
  const p = player;

  const speed = Math.abs(p.vx);
  const moving = p.state === "run";
  const airborne = p.state === "jump" || p.state === "fall";
  const sliding = p.state === "slide";
  const wallslide = p.state === "wallslide";

  const phase = p.runPhase;
  const run = Math.sin(phase);
  const run2 = Math.sin(phase + Math.PI);

  const jumpBlend = p.state === "jump"
    ? 1
    : p.state === "fall" ? .65 : 0;

  const idleBreath = Math.sin(time * 4) * 1.5;
  const bob = moving ? Math.abs(run) * 4 : idleBreath;

  ctx.save();

  ctx.translate(p.x + 17 - camera, p.y + 75);

  // Character shadow
  if (p.grounded) {
    const shadowScale = clamp(1 - Math.abs(p.vy) * .001, .55, 1);
    ctx.globalAlpha = .22;
    ellipse(0, 5, 22 * shadowScale, 5 * shadowScale, "#000");
    ctx.globalAlpha = 1;
  }

  // Direction and body lean
  ctx.scale(p.facing, 1);

  if (sliding) {
    ctx.translate(0, -12);
    ctx.rotate(-.15);
  } else {
    ctx.rotate(p.bodyAngle);
  }

  // Full body squash and stretch
  const verticalScale = p.squash * p.stretch;
  const horizontalScale = 1 / Math.sqrt(Math.max(.4, verticalScale));

  ctx.scale(horizontalScale, verticalScale);

  // Acrobatic spin during jumps
  if (airborne && Math.abs(p.spin) > .05) {
    ctx.rotate(p.spin);
  }

  if (p.invulnerable > 0 && Math.floor(time * 18) % 2 === 0) {
    ctx.globalAlpha = .35;
  }

  // Dynamic scarf / energy ribbon
  const scarfWave = Math.sin(time * 13 + phase) * (moving ? 9 : 4);
  const scarfLength = clamp(speed / 250, .25, 1.5);

  ctx.save();
  ctx.fillStyle = "#087d91";
  ctx.beginPath();
  ctx.moveTo(-7, -67 + bob);
  ctx.quadraticCurveTo(
    -22 - scarfLength * 18,
    -76 + scarfWave,
    -30 - scarfLength * 20,
    -63 + scarfWave
  );
  ctx.quadraticCurveTo(
    -20 - scarfLength * 13,
    -56 + scarfWave,
    -7,
    -59
  );
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#56e6ed";
  ctx.beginPath();
  ctx.moveTo(-8, -66);
  ctx.quadraticCurveTo(
    -20 - scarfLength * 17,
    -72 + scarfWave,
    -27 - scarfLength * 18,
    -64 + scarfWave
  );
  ctx.lineTo(-9, -60);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Arms: independent articulated motion
  const armSwing = moving ? run * 17 : Math.sin(time * 3) * 2;
  const armLift = airborne ? -14 : 0;

  if (sliding) {
    line(-8, -51, -27, -42, 9, "#24465a");
    line(8, -51, 23, -35, 9, "#24465a");

    drawGlove(-31, -40, -.7, .9);
    drawGlove(27, -32, .5, .9);

  } else if (airborne) {
    const flail = Math.sin(time * 16) * 5;

    line(-9, -53, -22 - flail, -75 + armLift, 9, "#24465a");
    line(9, -53, 22 + flail, -80 + armLift, 9, "#24465a");

    drawGlove(-24 - flail, -77 + armLift, -.8, 1.05);
    drawGlove(25 + flail, -82 + armLift, .8, 1.05);

  } else {
    line(-9, -53, -15 - armSwing * .55, -34 - armSwing * .2, 9, "#24465a");
    line(9, -53, 15 + armSwing * .55, -34 + armSwing * .2, 9, "#24465a");

    drawGlove(-16 - armSwing * .55, -33 - armSwing * .2, -.3 + run * .2);
    drawGlove(16 + armSwing * .55, -33 + armSwing * .2, .3 - run * .2);
  }

  // Legs and boots
  if (sliding) {
    line(-5, -25, -22, -11, 10, "#17374a");
    line(4, -24, 18, -12, 10, "#17374a");
    drawBoot(-27, -9, -.2, 1.15);
    drawBoot(20, -9, .2, 1.1);

  } else if (airborne) {
    const tuck = p.state === "jump" ? 1 : .55;
    const legKick = Math.sin(time * 11) * 5;

    line(-5, -26, -14 - legKick, -12 - tuck * 8, 10, "#17374a");
    line(5, -26, 14 + legKick, -13 + tuck * 5, 10, "#17374a");

    drawBoot(-16 - legKick, -10 - tuck * 8, -.5, 1.1);
    drawBoot(16 + legKick, -10 + tuck * 5, .4, 1.1);

  } else if (moving) {
    const stride = Math.sin(phase) * 17;
    const liftA = Math.max(0, Math.cos(phase)) * 10;
    const liftB = Math.max(0, Math.cos(phase + Math.PI)) * 10;

    line(-5, -27, -7 + stride, -10 - liftA, 10, "#17374a");
    line(5, -27, 7 - stride, -10 - liftB, 10, "#17374a");

    drawBoot(-8 + stride, -8 - liftA, -Math.sin(phase) * .45, 1.05);
    drawBoot(8 - stride, -8 - liftB, Math.sin(phase) * .45, 1.05);

  } else {
    const idleLeg = Math.sin(time * 3) * 1.5;

    line(-5, -27, -7 + idleLeg, -9, 10, "#17374a");
    line(5, -27, 7 - idleLeg, -9, 10, "#17374a");

    drawBoot(-8 + idleLeg, -8, -.05);
    drawBoot(8 - idleLeg, -8, .05);
  }

  // Torso
  const torsoY = -60 + bob - (airborne ? 2 : 0);

  ctx.fillStyle = "#122b3e";
  ctx.beginPath();
  ctx.moveTo(-13, torsoY + 4);
  ctx.quadraticCurveTo(-16, torsoY - 8, -10, torsoY - 17);
  ctx.quadraticCurveTo(0, torsoY - 22, 10, torsoY - 17);
  ctx.quadraticCurveTo(16, torsoY - 8, 13, torsoY + 4);
  ctx.quadraticCurveTo(0, torsoY + 9, -13, torsoY + 4);
  ctx.fill();

  // Chest armor
  ctx.fillStyle = "#25495d";
  ctx.beginPath();
  ctx.roundRect(-10, torsoY - 14, 20, 26, 7);
  ctx.fill();

  // Energy core
  const corePulse = .8 + Math.sin(time * 8) * .2;

  ctx.save();
  ctx.shadowColor = "#56e6ed";
  ctx.shadowBlur = 13 * corePulse;
  ctx.fillStyle = "#56e6ed";
  ctx.beginPath();
  ctx.ellipse(2, torsoY - 2, 3.2, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Neck
  ctx.fillStyle = "#9dbdc9";
  ctx.fillRect(-5, torsoY - 23, 10, 9);

  // Head
  const headTilt = moving ? run * .07 : Math.sin(time * 2) * .025;

  ctx.save();
  ctx.translate(0, torsoY - 28);
  ctx.rotate(headTilt);

  ctx.fillStyle = "#b8d4dd";
  ctx.beginPath();
  ctx.ellipse(0, -7, 13, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hood
  ctx.fillStyle = "#102637";
  ctx.beginPath();
  ctx.moveTo(-14, -10);
  ctx.quadraticCurveTo(-15, -26, 0, -25);
  ctx.quadraticCurveTo(15, -26, 14, -10);
  ctx.quadraticCurveTo(4, -17, -14, -10);
  ctx.fill();

  // Visor
  ctx.save();
  ctx.shadowColor = "#56e6ed";
  ctx.shadowBlur = 14;

  ctx.fillStyle = "#56e6ed";
  ctx.beginPath();
  ctx.roundRect(1, -12, 10, 5, 2);
  ctx.fill();

  ctx.restore();

  // Eye expression / blink
  if (p.blink > 0) {
    ctx.fillStyle = "#102637";
    ctx.fillRect(1, -12, 10, 2);
  }

  // Small face detail
  ctx.fillStyle = "#e8ffff";
  ctx.globalAlpha = .75;
  ctx.fillRect(8, -11, 2, 2);
  ctx.globalAlpha = 1;

  ctx.restore();

  // Landing impact rings
  if (p.landing > .03) {
    ctx.save();
    ctx.globalAlpha = p.landing * .45;
    ctx.strokeStyle = "#56e6ed";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 4, 18 + (1 - p.landing) * 22, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// =====================================================
// SPEED LINES + TRAIL
// =====================================================

function drawEffects() {
  for (const s of speedLines) {
    ctx.save();
    ctx.globalAlpha = clamp(s.life / s.maxLife, 0, 1) * .55;
    ctx.strokeStyle = "#75f5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x - camera, s.y);
    ctx.lineTo(s.x - camera + s.vx * .045, s.y);
    ctx.stroke();
    ctx.restore();
  }

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = "#79edf2";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#56e6ed";
    ctx.fillRect(p.x - camera, p.y, p.size, p.size);
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// =====================================================
// LIGHTING
// =====================================================

function drawLighting() {
  const g = ctx.createRadialGradient(
    W / 2, H / 2, 180,
    W / 2, H / 2, 850
  );

  g.addColorStop(0, "transparent");
  g.addColorStop(1, "rgba(0,0,0,.48)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// =====================================================
// RENDER
// =====================================================

function render() {
  ctx.clearRect(0, 0, W, H);

  drawBackground();

  ctx.save();

  if (shake > 0) {
    ctx.translate(
      (Math.random() - .5) * shake,
      (Math.random() - .5) * shake
    );
  }

  drawWorld();
  drawEffects();
  drawPlayer();

  ctx.restore();

  drawLighting();
}

// =====================================================
// UPDATE
// =====================================================

function update(dt) {
  time += dt;

  updatePlayer(dt);
  updatePuzzle(dt);
  updateParticles(dt);
  updateCamera(dt);
}

// =====================================================
// PAUSE / WIN / RESET
// =====================================================

function clearKeys() {
  for (const k in keys) keys[k] = false;
}

function togglePause() {
  if (!running && !paused) return;

  paused = !paused;
  clearKeys();

  ui.pause.classList.toggle("hidden", !paused);

  if (!paused) lastTime = performance.now();
}

function resetGame() {
  Object.assign(player, {
    x:spawn.x, y:spawn.y,
    vx:0, vy:0,
    facing:1,
    grounded:false,
    wasGrounded:false,
    wallSide:0,
    coyote:0,
    buffer:0,
    jumps:0,
    sliding:false,
    state:"idle",
    previousState:"idle",
    animation:0,
    runPhase:0,
    bodyAngle:0,
    squash:1,
    stretch:1,
    bounce:0,
    lean:0,
    anticipation:0,
    landing:0,
    spin:0,
    spinVelocity:0,
    airTime:0,
    blink:0,
    expression:0,
    handSwing:0,
    trail:[],
    invulnerable:0
  });

  level.crate.x = 850;
  level.crate.y = 570;
  level.plate.pressed = false;
  level.door.open = false;
  level.checkpoint.active = false;

  camera = 0;
  time = 0;
  shake = 0;
  particles.length = 0;
  speedLines.length = 0;

  won = false;

  ui.checkpoint.textContent = "01";
  ui.objective.textContent = "Explore a instalação";
  ui.status.textContent = "EXPLORANDO";
}

function restartGame() {
  resetGame();

  running = true;
  paused = false;
  clearKeys();

  ui.message.classList.add("hidden");
  ui.pause.classList.add("hidden");

  lastTime = performance.now();
}

function winGame() {
  if (won) return;

  won = true;
  running = false;

  ui.message.classList.remove("hidden");
}

// =====================================================
// BUTTONS
// =====================================================

$("pause").addEventListener("click", togglePause);
$("resume").addEventListener("click", togglePause);
$("restart").addEventListener("click", restartGame);
$("again").addEventListener("click", restartGame);

// =====================================================
// MAIN LOOP
// =====================================================

function loop(timestamp) {
  const dt = Math.min(
    Math.max((timestamp - lastTime) / 1000, 0),
    .033
  );

  lastTime = timestamp;

  if (running && !paused && !won) {
    update(dt);
  }

  render();
  requestAnimationFrame(loop);
}

// =====================================================
// START
// =====================================================

resetGame();

running = true;
paused = false;
won = false;

ui.message.classList.add("hidden");
ui.pause.classList.add("hidden");

lastTime = performance.now();

render();
requestAnimationFrame(loop);

console.log("PROJECT ECHO — ANIMATION OVERDRIVE ONLINE");
