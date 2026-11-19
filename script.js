
"use strict";

// ==========================================
// PROJECT: ECHO — GAME ENGINE 0.1
// ==========================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = 1280;
const H = 720;

canvas.width = W;
canvas.height = H;

const $ = id => document.getElementById(id);

const ui = {
  intro: $("intro-screen"),
  pause: $("pause-screen"),
  win: $("win-screen"),
  start: $("start-button"),
  pauseButton: $("pause-button"),
  resume: $("resume-button"),
  restart: $("restart-button"),
  again: $("again-button"),
  objective: $("objective"),
  status: $("hud-status"),
  checkpoint: $("checkpoint-number")
};

// ==========================================
// GAME STATE
// ==========================================

let game = {
  running: false,
  paused: false,
  won: false,
  time: 0,
  camera: 0,
  shake: 0,
  checkpoint: 0,
  particles: [],
  lights: [],
  lastTime: 0
};

const input = {
  left: false,
  right: false,
  jump: false,
  slide: false,
  interact: false,
  jumpPressed: false,
  interactPressed: false
};

const world = {
  width: 2850,
  gravity: 2100,
  platforms: [
    {x:0, y:630, w:570, h:100},
    {x:650, y:630, w:360, h:100},
    {x:1110, y:630, w:430, h:100},
    {x:1650, y:630, w:420, h:100},
    {x:2180, y:630, w:670, h:100},

    {x:290, y:495, w:150, h:18},
    {x:500, y:410, w:130, h:18},
    {x:760, y:500, w:140, h:18},
    {x:1040, y:440, w:120, h:18},
    {x:1300, y:500, w:170, h:18},
    {x:1750, y:470, w:150, h:18},
    {x:1980, y:385, w:140, h:18},
    {x:2340, y:490, w:150, h:18}
  ],
  walls: [
    {x:620, y:490, w:25, h:140},
    {x:1540, y:410, w:25, h:220},
    {x:2110, y:400, w:30, h:230}
  ],
  crate: {
    x:850, y:570, w:55, h:60,
    vx:0, weight:1
  },
  plate: {
    x:980, y:614, w:75, h:16,
    pressed:false
  },
  door: {
    x:1110, y:420, w:35, h:210,
    open:false
  },
  checkpoint: {
    x:1690, y:570, active:false
  },
  exit: {
    x:2700, y:500, w:55, h:130
  }
};

// ==========================================
// PLAYER
// ==========================================

const spawn = {x:100, y:550};

const player = {
  x:spawn.x,
  y:spawn.y,
  w:35,
  h:78,
  vx:0,
  vy:0,
  facing:1,
  grounded:false,
  wallSide:0,
  coyote:0,
  jumpBuffer:0,
  jumps:0,
  maxJumps:2,
  sliding:false,
  climbing:false,
  rolling:0,
  speed:370,
  state:"idle",
  animation:0,
  trail:[],
  invulnerable:0
};

// ==========================================
// LEVEL RESET
// ==========================================

function resetGame() {
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  player.jumps = 0;
  player.state = "idle";
  player.animation = 0;
  player.trail = [];

  world.crate.x = 850;
  world.crate.y = 570;
  world.crate.vx = 0;

  world.plate.pressed = false;
  world.door.open = false;
  world.checkpoint.active = false;

  game.checkpoint = 0;
  game.camera = 0;
  game.won = false;
  game.particles = [];

  ui.checkpoint.textContent = "01";
  ui.objective.textContent = "Encontre a saída";
  ui.status.textContent = "EXPLORANDO";
}

// ==========================================
// INPUT
// ==========================================

function setControl(name, value) {
  if (value && !input[name]) {
    if (name === "jump") input.jumpPressed = true;
    if (name === "interact") input.interactPressed = true;
  }
  input[name] = value;
}

window.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();

  if (["arrowleft","arrowright","arrowup","arrowdown"," "].includes(key)) {
    e.preventDefault();
  }

  if (key === "a" || key === "arrowleft") setControl("left", true);
  if (key === "d" || key === "arrowright") setControl("right", true);
  if (key === "w" || key === "arrowup" || key === " ") setControl("jump", true);
  if (key === "s" || key === "arrowdown") setControl("slide", true);
  if (key === "e") setControl("interact", true);

  if (key === "escape") togglePause();
});

window.addEventListener("keyup", e => {
  const key = e.key.toLowerCase();

  if (key === "a" || key === "arrowleft") setControl("left", false);
  if (key === "d" || key === "arrowright") setControl("right", false);
  if (key === "w" || key === "arrowup" || key === " ") setControl("jump", false);
  if (key === "s" || key === "arrowdown") setControl("slide", false);
  if (key === "e") setControl("interact", false);
});

document.querySelectorAll("[data-control]").forEach(button => {
  const name = button.dataset.control;

  button.addEventListener("pointerdown", e => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    setControl(name, true);
  });

  const release = e => {
    e.preventDefault();
    setControl(name, false);
  };

  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", () => {
    setControl(name, false);
  });
});

// ==========================================
// COLLISION SYSTEM
// ==========================================

function overlap(a,b) {
  return a.x < b.x+b.w &&
    a.x+a.w > b.x &&
    a.y < b.y+b.h &&
    a.y+a.h > b.y;
}

function getSolids() {
  const solids = [...world.platforms, ...world.walls];

  if (!world.door.open) {
    solids.push(world.door);
  }

  return solids;
}

function movePlayer(dt) {
  player.x += player.vx * dt;

  for (const block of getSolids()) {
    if (!overlap(player,block)) continue;

    if (player.vx > 0) {
      player.x = block.x-player.w;
      player.wallSide = 1;
    } else if (player.vx < 0) {
      player.x = block.x+block.w;
      player.wallSide = -1;
    }

    player.vx = 0;
  }

  player.y += player.vy * dt;
  player.grounded = false;

  for (const block of getSolids()) {
    if (!overlap(player,block)) continue;

    if (player.vy > 0) {
      player.y = block.y-player.h;
      player.vy = 0;
      player.grounded = true;
      player.jumps = 0;
    } else if (player.vy < 0) {
      player.y = block.y+block.h;
      player.vy = 0;
    }
  }

  if (player.grounded) {
    player.coyote = 0.12;
  } else {
    player.coyote = Math.max(0,player.coyote-dt);
  }
}

// ==========================================
// PARKOUR MOVEMENT
// ==========================================

function updatePlayer(dt) {
  const direction =
    (input.right ? 1 : 0) -
    (input.left ? 1 : 0);

  if (direction !== 0) {
    player.facing = direction;
  }

  if (input.jumpPressed) {
    player.jumpBuffer = 0.13;
  } else {
    player.jumpBuffer = Math.max(0,player.jumpBuffer-dt);
  }

  player.sliding = input.slide && player.grounded;

  const acceleration = player.grounded ? 2400 : 1300;
  const maxSpeed = player.sliding ? 510 : player.speed;

  if (direction !== 0) {
    player.vx += direction * acceleration * dt;
  } else {
    player.vx *= Math.pow(
      player.grounded ? 0.0008 : 0.13,
      dt
    );
  }

  player.vx = Math.max(-maxSpeed,Math.min(maxSpeed,player.vx));

  // Slide
  if (player.sliding) {
    player.vx += player.facing * 300 * dt;
    player.vx = Math.max(-520,Math.min(520,player.vx));
  }

  // Jump and double jump
  if (player.jumpBuffer > 0) {
    if (player.grounded || player.coyote > 0) {
      player.vy = -760;
      player.grounded = false;
      player.coyote = 0;
      player.jumps = 1;
      player.jumpBuffer = 0;
      burst(player.x+player.w/2,player.y+player.h,12);
    }
    else if (player.wallSide !== 0) {
      player.vy = -740;
      player.vx = -player.wallSide * 490;
      player.facing = -player.wallSide;
      player.wallSide = 0;
      player.jumpBuffer = 0;
      burst(player.x+player.w/2,player.y+player.h/2,15);
    }
    else if (player.jumps < player.maxJumps) {
      player.vy = -700;
      player.jumps++;
      player.jumpBuffer = 0;
      burst(player.x+player.w/2,player.y+player.h/2,12);
    }
  }

  // Variable jump height
  if (!input.jump && player.vy < -180) {
    player.vy += 1900*dt;
  }

  player.vy += world.gravity*dt;
  player.vy = Math.min(player.vy,1050);

  // Wall slide
  if (!player.grounded && player.wallSide !== 0 &&
      player.vy > 100 && direction === player.wallSide) {
    player.vy = Math.min(player.vy,230);
    player.state = "wallslide";
  }

  if (player.sliding) {
    player.state = "slide";
  } else if (!player.grounded) {
    if (player.state !== "wallslide") {
      player.state = player.vy < 0 ? "jump" : "fall";
    }
  } else if (Math.abs(player.vx)>25) {
    player.state = "run";
  } else {
    player.state = "idle";
  }

  movePlayer(dt);

  if (player.y > 900) respawn();

  if (player.invulnerable > 0) {
    player.invulnerable -= dt;
  }

  if (player.grounded && Math.abs(player.vx)>280) {
    if (Math.random()<0.25) {
      burst(player.x+player.w/2,player.y+player.h,1);
    }
  }

  if (Math.abs(player.vx)>120 && game.time%0.07<dt) {
    player.trail.push({
      x:player.x+player.w/2,
      y:player.y+player.h/2,
      alpha:0.3
    });
  }

  player.trail = player.trail.slice(-8);
  player.animation += dt*Math.max(3,Math.abs(player.vx)/65);
}

// ==========================================
// CRATE AND PUZZLE SYSTEM
// ==========================================

function updatePuzzle(dt) {
  const c = world.crate;

  c.vx *= Math.pow(0.02,dt);

  const next = {
    x:c.x+player.vx*dt,
    y:c.y,
    w:c.w,
    h:c.h
  };

  if (overlap(player,next)) {
    if (player.vx > 0) c.x = player.x+player.w;
    if (player.vx < 0) c.x = player.x-c.w;
    c.x = Math.max(0,Math.min(world.width-c.w,c.x));
  }

  c.y += world.gravity*dt;

  for (const p of world.platforms) {
    if (overlap(c,p) && c.y+c.h <= p.y+25) {
      c.y = p.y-c.h;
    }
  }

  c.y = Math.min(c.y,570);

  world.plate.pressed =
    overlap(c,world.plate) ||
    overlap(player,world.plate);

  world.door.open = world.plate.pressed;

  if (world.plate.pressed) {
    ui.objective.textContent = "Porta desbloqueada!";
    ui.status.textContent = "PUZZLE RESOLVIDO";
  } else {
    ui.objective.textContent = "Ative o mecanismo";
    ui.status.textContent = "PROCURANDO MECANISMO";
  }

  if (player.x > world.checkpoint.x-80 &&
      !world.checkpoint.active) {
    world.checkpoint.active = true;
    game.checkpoint = 1;
    ui.checkpoint.textContent = "02";
    burst(world.checkpoint.x,560,35);
  }

  if (overlap(player,world.exit)) {
    winGame();
  }
}

// ==========================================
// CHECKPOINTS
// ==========================================

function respawn() {
  if (world.checkpoint.active) {
    player.x = world.checkpoint.x;
    player.y = 490;
  } else {
    player.x = spawn.x;
    player.y = spawn.y;
  }

  player.vx = 0;
  player.vy = 0;
  player.invulnerable = 1;
  game.shake = 10;
}

function winGame() {
  if (game.won) return;

  game.won = true;
  game.running = false;
  ui.win.classList.remove("hidden");
}

// ==========================================
// PARTICLE ENGINE
// ==========================================

function burst(x,y,count) {
  for (let i=0;i<count;i++) {
    const angle = Math.random()*Math.PI*2;
    const speed = 40+Math.random()*280;

    game.particles.push({
      x,y,
      vx:Math.cos(angle)*speed,
      vy:Math.sin(angle)*speed,
      life:0.3+Math.random()*0.6,
      maxLife:0.9,
      size:2+Math.random()*4
    });
  }
}

function updateParticles(dt) {
  for (const p of game.particles) {
    p.x += p.vx*dt;
    p.y += p.vy*dt;
    p.vy += 300*dt;
    p.life -= dt;
  }

  game.particles = game.particles.filter(p=>p.life>0);
}

// ==========================================
// CAMERA
// ==========================================

function updateCamera(dt) {
  const target = player.x-W*0.38;

  game.camera +=
    (target-game.camera)*(1-Math.exp(-5*dt));

  game.camera = Math.max(
    0,
    Math.min(world.width-W,game.camera)
  );

  if (game.shake>0) {
    game.shake = Math.max(0,game.shake-30*dt);
  }
}

// ==========================================
// BACKGROUND
// ==========================================

function drawBackground() {
  const gradient = ctx.createLinearGradient(0,0,0,H);
  gradient.addColorStop(0,"#091727");
  gradient.addColorStop(0.65,"#142638");
  gradient.addColorStop(1,"#1a2936");

  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,W,H);

  // Distant architecture
  for (let i=0;i<18;i++) {
    const x = i*190-(game.camera*0.18)%190;

    const height = 160+(i*73%210);
    ctx.fillStyle = i%2 ? "#122335" : "#172b3e";
    ctx.fillRect(x,H-height,130,height);

    ctx.fillStyle = "#31516a44";

    for (let j=0;j<5;j++) {
      ctx.fillRect(x+15+j*23,H-height+25,8,30);
    }
  }

  // Large industrial pipes
  ctx.fillStyle = "#203b50";
  ctx.fillRect(0,145,W,9);
  ctx.fillRect(0,160,W,3);

  // Atmospheric lights
  for (let i=0;i<8;i++) {
    const x = (i*190-game.camera*0.35%W+W)%W;
    const pulse = 0.5+Math.sin(game.time*2+i)*0.25;

    ctx.fillStyle = `rgba(65,220,235,${pulse*0.12})`;
    ctx.beginPath();
    ctx.arc(x,260,100,0,Math.PI*2);
    ctx.fill();
  }

  // Floating dust
  for (let i=0;i<45;i++) {
    const x = (i*173+game.time*12-game.camera*0.4)%W;
    const y = (i*97+Math.sin(game.time+i)*20)%H;

    ctx.fillStyle = "#b5e8ed55";
    ctx.fillRect(x,y,2,2);
  }
}

// ==========================================
// ENVIRONMENT RENDERING
// ==========================================

function drawWorld() {
  ctx.save();
  ctx.translate(-game.camera,0);

  // Floor and platforms
  for (const p of world.platforms) {
    ctx.fillStyle = "#243747";
    ctx.fillRect(p.x,p.y,p.w,p.h);

    ctx.fillStyle = "#587184";
    ctx.fillRect(p.x,p.y,p.w,5);

    ctx.fillStyle = "#162635";
    ctx.fillRect(p.x,p.y+10,p.w,p.h-10);

    for (let x=p.x+10;x<p.x+p.w;x+=45) {
      ctx.fillStyle = "#536a7b55";
      ctx.fillRect(x,p.y+15,2,p.h-20);
    }
  }

  // Walls
  for (const wall of world.walls) {
    ctx.fillStyle = "#263a4c";
    ctx.fillRect(wall.x,wall.y,wall.w,wall.h);
    ctx.fillStyle = "#5a7587";
    ctx.fillRect(wall.x,wall.y,4,wall.h);
  }

  drawCrate();
  drawPuzzle();
  drawCheckpoint();
  drawExit();

  ctx.restore();
}

function drawCrate() {
  const c=world.crate;

  ctx.fillStyle="#172a3c";
  ctx.fillRect(c.x,c.y,c.w,c.h);

  ctx.strokeStyle="#82a6b8";
  ctx.lineWidth=3;
  ctx.strokeRect(c.x+4,c.y+4,c.w-8,c.h-8);

  ctx.strokeStyle="#54778b";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(c.x+8,c.y+8);
  ctx.lineTo(c.x+c.w-8,c.y+c.h-8);
  ctx.moveTo(c.x+c.w-8,c.y+8);
  ctx.lineTo(c.x+8,c.y+c.h-8);
  ctx.stroke();
}

function drawPuzzle() {
  const p=world.plate;

  ctx.fillStyle=world.plate.pressed?"#56e6ed":"#536578";
  ctx.fillRect(p.x,p.y,p.w,p.h);

  ctx.shadowBlur=world.plate.pressed?25:0;
  ctx.shadowColor="#56e6ed";
  ctx.fillStyle=world.plate.pressed?"#b6ffff":"#293b4b";
  ctx.fillRect(p.x+8,p.y+3,p.w-16,5);
  ctx.shadowBlur=0;

  const d=world.door;

  if (!d.open) {
    ctx.fillStyle="#17283b";
    ctx.fillRect(d.x,d.y,d.w,d.h);

    ctx.strokeStyle="#6d879c";
    ctx.lineWidth=3;
    ctx.strokeRect(d.x+4,d.y+4,d.w-8,d.h-8);

    ctx.fillStyle="#56e6ed";
    ctx.fillRect(d.x+12,d.y+20,10,3);
  } else {
    ctx.fillStyle="#56e6ed";
    ctx.globalAlpha=.18;
    ctx.fillRect(d.x,d.y,d.w,d.h);
    ctx.globalAlpha=1;
  }
}

function drawCheckpoint() {
  const c=world.checkpoint;

  ctx.fillStyle="#314d60";
  ctx.fillRect(c.x,530,5,100);

  ctx.fillStyle=c.active?"#56e6ed":"#61778a";
  ctx.beginPath();
  ctx.moveTo(c.x+5,532);
  ctx.lineTo(c.x+65,550);
  ctx.lineTo(c.x+5,570);
  ctx.closePath();
  ctx.fill();

  if (c.active) {
    ctx.shadowColor="#56e6ed";
    ctx.shadowBlur=30;
    ctx.fillStyle="#56e6ed";
    ctx.fillRect(c.x-2,530,9,100);
    ctx.shadowBlur=0;
  }
}

function drawExit() {
  const e=world.exit;

  ctx.fillStyle="#142a3c";
  ctx.fillRect(e.x,e.y,e.w,e.h);

  ctx.strokeStyle="#56e6ed";
  ctx.lineWidth=3;
  ctx.strokeRect(e.x,e.y,e.w,e.h);

  ctx.fillStyle="#56e6ed";
  ctx.shadowColor="#56e6ed";
  ctx.shadowBlur=20;
  ctx.fillRect(e.x+24,e.y+15,6,100);
  ctx.shadowBlur=0;
}

// ==========================================
// CHARACTER ANIMATION
// ==========================================

function drawPlayer() {
  const p=player;
  const cx=p.x+p.w/2;
  const cy=p.y;

  // Motion trail
  for (const t of p.trail) {
    ctx.fillStyle=`rgba(86,230,237,${t.alpha})`;
    ctx.fillRect(t.x-3,t.y-3,6,6);
    t.alpha-=0.008;
  }

  ctx.save();
  ctx.translate(cx,cy+p.h);
  ctx.scale(p.facing,1);

  const run=Math.sin(p.animation)*12;
  const jumpPose=p.state==="jump"||p.state==="fall";
  const slide=p.state==="slide";
  const wall=p.state==="wallslide";

  if (slide) {
    ctx.translate(0,-13);
    ctx.rotate(-.12);
  }

  if (p.invulnerable>0 && Math.floor(game.time*15)%2===0) {
    ctx.globalAlpha=.35;
  }

  // Shadow
  if (p.grounded) {
    ctx.globalAlpha=.2;
    ctx.fillStyle="#000";
    ctx.beginPath();
    ctx.ellipse(0,3,22,5,0,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha=1;
  }

  // Legs
  ctx.strokeStyle="#182f40";
  ctx.lineWidth=9;
  ctx.lineCap="round";

  ctx.beginPath();

  if (slide) {
    ctx.moveTo(-5,-17);
    ctx.lineTo(20,-5);
    ctx.moveTo(4,-17);
    ctx.lineTo(29,-4);
  } else if (jumpPose) {
    ctx.moveTo(-5,-30);
    ctx.lineTo(-15,-14);
    ctx.moveTo(5,-30);
    ctx.lineTo(15,-12);
  } else if (wall) {
    ctx.moveTo(-5,-30);
    ctx.lineTo(-14,-13);
    ctx.moveTo(5,-30);
    ctx.lineTo(13,-20);
  } else {
    ctx.moveTo(-5,-28);
    ctx.lineTo(-7+run,-3);
    ctx.moveTo(5,-28);
    ctx.lineTo(7-run,-3);
  }

  ctx.stroke();

  // Shoes
  ctx.fillStyle="#56e6ed";
  ctx.fillRect(-17,-5,14,5);
  ctx.fillRect(5,-5,14,5);

  // Body
  ctx.fillStyle="#1a3448";
  ctx.beginPath();
  ctx.roundRect(-13,-68,26,43,7);
  ctx.fill();

  // Jacket detail
  ctx.fillStyle="#56e6ed";
  ctx.fillRect(-3,-65,5,33);

  // Arms
  ctx.strokeStyle="#28475b";
  ctx.lineWidth=7;

  ctx.beginPath();

  if (jumpPose) {
    ctx.moveTo(-11,-59);
    ctx.lineTo(-22,-79);
    ctx.moveTo(11,-59);
    ctx.lineTo(23,-76);
  } else if (slide) {
    ctx.moveTo(-10,-51);
    ctx.lineTo(-22,-43);
    ctx.moveTo(10,-51);
    ctx.lineTo(24,-41);
  } else {
    ctx.moveTo(-11,-58);
    ctx.lineTo(-18+run*.6,-40);
    ctx.moveTo(11,-58);
    ctx.lineTo(18-run*.6,-40);
  }

  ctx.stroke();

  // Neck and head
  ctx.fillStyle="#a6c3d1";
  ctx.fillRect(-5,-76,10,10);

  ctx.fillStyle="#b9d0d9";
  ctx.beginPath();
  ctx.roundRect(-11,-95,22,22,7);
  ctx.fill();

  // Hair / hood
  ctx.fillStyle="#142636";
  ctx.beginPath();
  ctx.roundRect(-12,-98,24,12,6);
  ctx.fill();

  // Visor
  ctx.fillStyle="#56e6ed";
  ctx.shadowColor="#56e6ed";
  ctx.shadowBlur=12;
  ctx.fillRect(1,-89,9,4);
  ctx.shadowBlur=0;

  ctx.restore();
}

// ==========================================
// LIGHT AND PARTICLE RENDER
// ==========================================

function drawParticles() {
  for (const p of game.particles) {
    ctx.globalAlpha=Math.max(0,p.life/p.maxLife);
    ctx.fillStyle="#79edf2";
    ctx.shadowBlur=12;
    ctx.shadowColor="#56e6ed";
    ctx.fillRect(p.x,p.y,p.size,p.size);
  }

  ctx.globalAlpha=1;
  ctx.shadowBlur=0;
}

// ==========================================
// MAIN RENDER
// ==========================================

function render() {
  ctx.clearRect(0,0,W,H);

  drawBackground();

  ctx.save();

  if (game.shake>0) {
    ctx.translate(
      (Math.random()-.5)*game.shake,
      (Math.random()-.5)*game.shake
    );
  }

  drawWorld();
  drawParticles();

  ctx.save();
  ctx.translate(-game.camera,0);
  drawPlayer();
  ctx.restore();

  ctx.restore();

  // Vignette
  const vignette=ctx.createRadialGradient(
    W/2,H/2,200,W/2,H/2,850
  );

  vignette.addColorStop(0,"transparent");
  vignette.addColorStop(1,"rgba(0,0,0,.48)");

  ctx.fillStyle=vignette;
  ctx.fillRect(0,0,W,H);

  // Top scanline
  ctx.fillStyle="#ffffff08";
  for (let y=0;y<H;y+=5) {
    ctx.fillRect(0,y,W,1);
  }
}

// ==========================================
// GAME LOOP
// ==========================================

function update(dt) {
  game.time+=dt;

  updatePlayer(dt);
  updatePuzzle(dt);
  updateParticles(dt);
  updateCamera(dt);
}

function loop(timestamp) {
  const dt=Math.min(
    (timestamp-game.lastTime)/1000 || 0,
    0.033
  );

  game.lastTime=timestamp;

  if (game.running && !game.paused) {
    update(dt);
  }

  render();
  requestAnimationFrame(loop);
}

// ==========================================
// MENUS
// ==========================================

function togglePause() {
  if (!game.running && !game.paused) return;

  game.paused=!game.paused;
  ui.pause.classList.toggle("hidden",!game.paused);
}

ui.start.addEventListener("click",()=>{
  resetGame();
  game.running=true;
  game.paused=false;
  ui.intro.classList.add("hidden");
  ui.pause.classList.add("hidden");
});

ui.pauseButton.addEventListener("click",togglePause);

ui.resume.addEventListener("click",()=>{
  game.paused=false;
  ui.pause.classList.add("hidden");
});

ui.restart.addEventListener("click",()=>{
  resetGame();
  game.running=true;
  game.paused=false;
  ui.pause.classList.add("hidden");
});

ui.again.addEventListener("click",()=>{
  resetGame();
  game.running=true;
  ui.win.classList.add("hidden");
});

// ==========================================
// START ENGINE
// ==========================================

resetGame();
requestAnimationFrame(loop);
