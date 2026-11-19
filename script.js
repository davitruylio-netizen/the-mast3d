
"use strict";

// ======================================================
// PROJECT: ECHO
// COMPLETE 2D PARKOUR & PUZZLE ENGINE
// ======================================================

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
  hud: $("hud"),
  start: $("start-button"),
  pauseButton: $("pause-button"),
  resume: $("resume-button"),
  restart: $("restart-button"),
  again: $("again-button"),
  menu: $("menu-button"),
  winMenu: $("win-menu-button"),
  objective: $("objective"),
  status: $("hud-status"),
  checkpoint: $("checkpoint-number")
};

// ======================================================
// ENGINE STATE
// ======================================================

const game = {
  running: false,
  paused: false,
  won: false,
  time: 0,
  camera: 0,
  shake: 0,
  particles: [],
  lastTime: 0
};

const input = {
  left: false,
  right: false,
  jump: false,
  slide: false,
  interact: false,
  jumpPressed: false
};

// ======================================================
// WORLD
// ======================================================

const world = {
  width: 3000,
  gravity: 1900,

  platforms: [
    {x:0,y:630,w:570,h:100},
    {x:650,y:630,w:460,h:100},
    {x:1190,y:630,w:350,h:100},
    {x:1650,y:630,w:420,h:100},
    {x:2180,y:630,w:820,h:100},

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

  crate: {
    x:850,
    y:570,
    w:55,
    h:60,
    vx:0
  },

  plate: {
    x:1000,
    y:614,
    w:75,
    h:16,
    pressed:false
  },

  door: {
    x:1150,
    y:420,
    w:35,
    h:210,
    open:false
  },

  checkpoint: {
    x:1690,
    active:false
  },

  exit: {
    x:2700,
    y:500,
    w:55,
    h:130
  }
};

// ======================================================
// PLAYER
// ======================================================

const spawn = {x:100,y:550};

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

  speed:370,
  state:"idle",
  animation:0,

  trail:[],
  invulnerable:0
};

// ======================================================
// RESET
// ======================================================

function resetGame() {
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  player.wallSide = 0;
  player.jumps = 0;
  player.coyote = 0;
  player.jumpBuffer = 0;
  player.state = "idle";
  player.animation = 0;
  player.trail = [];
  player.invulnerable = 0;

  world.crate.x = 850;
  world.crate.y = 570;
  world.crate.vx = 0;

  world.plate.pressed = false;
  world.door.open = false;
  world.checkpoint.active = false;

  game.camera = 0;
  game.shake = 0;
  game.time = 0;
  game.particles = [];
  game.won = false;

  ui.objective.textContent = "Encontre a saída";
  ui.status.textContent = "EXPLORANDO";
  ui.checkpoint.textContent = "01";
}

// ======================================================
// INPUT SYSTEM
// ======================================================

function setControl(name,value) {
  if (name === "jump" && value && !input.jump) {
    input.jumpPressed = true;
  }

  input[name] = value;
}

window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();

  if ([
    "arrowleft","arrowright",
    "arrowup","arrowdown"," "
  ].includes(k)) {
    e.preventDefault();
  }

  if (k === "a" || k === "arrowleft")
    setControl("left",true);

  if (k === "d" || k === "arrowright")
    setControl("right",true);

  if (k === "w" || k === "arrowup" || k === " ")
    setControl("jump",true);

  if (k === "s" || k === "arrowdown")
    setControl("slide",true);

  if (k === "e")
    setControl("interact",true);

  if (k === "escape")
    togglePause();
});

window.addEventListener("keyup", e => {
  const k = e.key.toLowerCase();

  if (k === "a" || k === "arrowleft")
    setControl("left",false);

  if (k === "d" || k === "arrowright")
    setControl("right",false);

  if (k === "w" || k === "arrowup" || k === " ")
    setControl("jump",false);

  if (k === "s" || k === "arrowdown")
    setControl("slide",false);

  if (k === "e")
    setControl("interact",false);
});

document.querySelectorAll("[data-control]").forEach(btn => {
  const name = btn.dataset.control;

  btn.addEventListener("pointerdown", e => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    setControl(name,true);
  });

  function release() {
    setControl(name,false);
  }

  btn.addEventListener("pointerup",release);
  btn.addEventListener("pointercancel",release);

  btn.addEventListener("lostpointercapture",release);
});

// ======================================================
// COLLISIONS
// ======================================================

function overlap(a,b) {
  return (
    a.x < b.x+b.w &&
    a.x+a.w > b.x &&
    a.y < b.y+b.h &&
    a.y+a.h > b.y
  );
}

function getSolids() {
  const result = [
    ...world.platforms,
    ...world.walls
  ];

  if (!world.door.open) {
    result.push(world.door);
  }

  return result;
}

function movePlayer(dt) {
  const solids = getSolids();

  player.x += player.vx*dt;
  player.wallSide = 0;

  for (const s of solids) {
    if (!overlap(player,s)) continue;

    if (player.vx > 0) {
      player.x = s.x-player.w;
      player.wallSide = 1;
    } else if (player.vx < 0) {
      player.x = s.x+s.w;
      player.wallSide = -1;
    }

    player.vx = 0;
  }

  player.y += player.vy*dt;
  player.grounded = false;

  for (const s of solids) {
    if (!overlap(player,s)) continue;

    if (player.vy >= 0) {
      player.y = s.y-player.h;
      player.vy = 0;
      player.grounded = true;
      player.jumps = 0;
    } else {
      player.y = s.y+s.h;
      player.vy = 0;
    }
  }

  player.x = Math.max(0,Math.min(
    world.width-player.w,
    player.x
  ));

  if (player.grounded) {
    player.coyote = 0.12;
  } else {
    player.coyote = Math.max(
      0,
      player.coyote-dt
    );
  }
}

// ======================================================
// PARKOUR SYSTEM
// ======================================================

function updatePlayer(dt) {
  const direction =
    (input.right?1:0) -
    (input.left?1:0);

  if (direction) {
    player.facing = direction;
  }

  if (input.jumpPressed) {
    player.jumpBuffer = 0.14;
  } else {
    player.jumpBuffer = Math.max(
      0,
      player.jumpBuffer-dt
    );
  }

  player.sliding = input.slide && player.grounded;

  const acceleration = player.grounded ? 2400 : 1250;
  const maxSpeed = player.sliding ? 510 : player.speed;

  if (direction !== 0) {
    player.vx += direction*acceleration*dt;
  } else {
    player.vx *= Math.pow(
      player.grounded ? 0.0008 : 0.12,
      dt
    );
  }

  player.vx = Math.max(
    -maxSpeed,
    Math.min(maxSpeed,player.vx)
  );

  // SLIDE
  if (player.sliding) {
    player.vx += player.facing*260*dt;
    player.vx = Math.max(
      -520,
      Math.min(520,player.vx)
    );
  }

  // JUMP
  if (player.jumpBuffer > 0) {
    if (player.grounded || player.coyote > 0) {
      player.vy = -760;
      player.jumps = 1;
      player.coyote = 0;
      player.grounded = false;
      player.jumpBuffer = 0;

      burst(
        player.x+player.w/2,
        player.y+player.h,
        14
      );
    }

    else if (player.wallSide !== 0) {
      player.vy = -730;
      player.vx = -player.wallSide*490;
      player.facing = -player.wallSide;
      player.jumps = 1;
      player.wallSide = 0;
      player.jumpBuffer = 0;

      burst(
        player.x+player.w/2,
        player.y+player.h/2,
        16
      );
    }

    else if (player.jumps < player.maxJumps) {
      player.vy = -700;
      player.jumps++;
      player.jumpBuffer = 0;

      burst(
        player.x+player.w/2,
        player.y+player.h/2,
        12
      );
    }
  }

  // VARIABLE JUMP
  if (!input.jump && player.vy < -180) {
    player.vy += 1900*dt;
  }

  player.vy += world.gravity*dt;
  player.vy = Math.min(player.vy,1050);

  movePlayer(dt);

  // WALL SLIDE
  if (
    !player.grounded &&
    player.wallSide !== 0 &&
    player.vy > 100 &&
    direction === player.wallSide
  ) {
    player.vy = Math.min(player.vy,230);
    player.state = "wallslide";
  }

  // ANIMATION STATE
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

  player.animation += dt*Math.max(
    3,
    Math.abs(player.vx)/65
  );

  if (
    player.grounded &&
    Math.abs(player.vx)>280 &&
    Math.random()<0.22
  ) {
    burst(
      player.x+player.w/2,
      player.y+player.h,
      1
    );
  }

  if (player.invulnerable>0) {
    player.invulnerable -= dt;
  }

  if (
    Math.abs(player.vx)>120 &&
    game.time%0.07<dt
  ) {
    player.trail.push({
      x:player.x+player.w/2,
      y:player.y+player.h/2,
      alpha:.25
    });
  }

  player.trail = player.trail.slice(-8);

  if (player.y>850) {
    respawn();
  }

  input.jumpPressed = false;
}

// ======================================================
// PUZZLE SYSTEM
// ======================================================

function updateCrate(dt) {
  const c = world.crate;

  const previousY = c.y;

  // Gravity
  c.y += world.gravity*dt;
  c.vx *= Math.pow(0.025,dt);

  // Ground collision
  const floor = 570;

  if (c.y >= floor) {
    c.y = floor;
  }

  // Platform collision
  for (const p of world.platforms) {
    if (
      c.x+c.w>p.x &&
      c.x<p.x+p.w &&
      previousY+c.h<=p.y+5 &&
      c.y+c.h>=p.y
    ) {
      c.y=p.y-c.h;
    }
  }

  // Player pushes crate
  if (overlap(player,c)) {
    if (player.vx>0) {
      c.x=player.x+player.w;
    } else if (player.vx<0) {
      c.x=player.x-c.w;
    }

    c.x=Math.max(650,Math.min(1100-c.w,c.x));
  }
}

function updatePuzzle(dt) {
  updateCrate(dt);

  const c=world.crate;
  const p=world.plate;

  p.pressed =
    overlap(c,p) ||
    overlap(player,p);

  world.door.open=p.pressed;

  if (p.pressed) {
    ui.objective.textContent="Porta desbloqueada!";
    ui.status.textContent="PUZZLE RESOLVIDO";
  } else {
    ui.objective.textContent="Empurre a caixa até o botão";
    ui.status.textContent="RESOLVA O MECANISMO";
  }

  // CHECKPOINT
  if (
    player.x>world.checkpoint.x-70 &&
    !world.checkpoint.active
  ) {
    world.checkpoint.active=true;

    ui.checkpoint.textContent="02";

    burst(
      world.checkpoint.x,
      550,
      30
    );
  }

  // EXIT
  if (overlap(player,world.exit)) {
    winGame();
  }
}

// ======================================================
// CHECKPOINT
// ======================================================

function respawn() {
  if (world.checkpoint.active) {
    player.x=world.checkpoint.x;
    player.y=490;
  } else {
    player.x=spawn.x;
    player.y=spawn.y;
  }

  player.vx=0;
  player.vy=0;
  player.invulnerable=1;

  game.shake=12;
}

// ======================================================
// PARTICLES
// ======================================================

function burst(x,y,count) {
  for (let i=0;i<count;i++) {
    const angle=Math.random()*Math.PI*2;
    const speed=40+Math.random()*280;

    game.particles.push({
      x,y,
      vx:Math.cos(angle)*speed,
      vy:Math.sin(angle)*speed,
      life:.35+Math.random()*.55,
      maxLife:.9,
      size:2+Math.random()*4
    });
  }
}

function updateParticles(dt) {
  for (const p of game.particles) {
    p.x+=p.vx*dt;
    p.y+=p.vy*dt;
    p.vy+=300*dt;
    p.life-=dt;
  }

  game.particles=game.particles.filter(
    p=>p.life>0
  );
}

// ======================================================
// CAMERA
// ======================================================

function updateCamera(dt) {
  const target=player.x-W*.38;

  game.camera +=
    (target-game.camera)*(1-Math.exp(-5*dt));

  game.camera=Math.max(
    0,
    Math.min(world.width-W,game.camera)
  );

  game.shake=Math.max(
    0,
    game.shake-30*dt
  );
}

// ======================================================
// BACKGROUND
// ======================================================

function drawBackground() {
  const gradient=ctx.createLinearGradient(0,0,0,H);

  gradient.addColorStop(0,"#091727");
  gradient.addColorStop(.65,"#142638");
  gradient.addColorStop(1,"#1a2936");

  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,W,H);

  // PARALLAX BUILDINGS
  for (let i=0;i<22;i++) {
    const x=i*190-(game.camera*.18)%190;
    const height=160+(i*73%210);

    ctx.fillStyle=i%2?"#122335":"#172b3e";
    ctx.fillRect(x,H-height,130,height);

    ctx.fillStyle="#31516a44";

    for (let j=0;j<5;j++) {
      ctx.fillRect(
        x+15+j*23,
        H-height+25,
        8,
        30
      );
    }
  }

  // PIPES
  ctx.fillStyle="#203b50";
  ctx.fillRect(0,145,W,9);
  ctx.fillRect(0,160,W,3);

  // LIGHTS
  for (let i=0;i<8;i++) {
    const x=(i*190-game.camera*.35%W+W)%W;
    const pulse=.5+Math.sin(game.time*2+i)*.25;

    ctx.fillStyle=`rgba(65,220,235,${pulse*.12})`;

    ctx.beginPath();
    ctx.arc(x,260,100,0,Math.PI*2);
    ctx.fill();
  }

  // DUST
  for (let i=0;i<55;i++) {
    const x=(i*173+game.time*12-game.camera*.4)%W;
    const y=(i*97+Math.sin(game.time+i)*20)%H;

    ctx.fillStyle="#b5e8ed55";
    ctx.fillRect(x,y,2,2);
  }
}

// ======================================================
// ENVIRONMENT
// ======================================================

function drawPlatform(p) {
  ctx.fillStyle="#243747";
  ctx.fillRect(p.x,p.y,p.w,p.h);

  ctx.fillStyle="#587184";
  ctx.fillRect(p.x,p.y,p.w,5);

  ctx.fillStyle="#162635";
  ctx.fillRect(p.x,p.y+10,p.w,p.h-10);

  for (let x=p.x+10;x<p.x+p.w;x+=45) {
    ctx.fillStyle="#536a7b55";
    ctx.fillRect(x,p.y+15,2,p.h-20);
  }
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

  ctx.fillStyle=p.pressed?"#56e6ed":"#536578";
  ctx.fillRect(p.x,p.y,p.w,p.h);

  ctx.shadowColor="#56e6ed";
  ctx.shadowBlur=p.pressed?25:0;

  ctx.fillStyle=p.pressed?"#b6ffff":"#293b4b";
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

  ctx.shadowColor="#56e6ed";
  ctx.shadowBlur=20;
  ctx.fillStyle="#56e6ed";
  ctx.fillRect(e.x+24,e.y+15,6,100);
  ctx.shadowBlur=0;
}

function drawWorld() {
  ctx.save();
  ctx.translate(-game.camera,0);

  world.platforms.forEach(drawPlatform);

  for (const wall of world.walls) {
    ctx.fillStyle="#263a4c";
    ctx.fillRect(wall.x,wall.y,wall.w,wall.h);

    ctx.fillStyle="#5a7587";
    ctx.fillRect(wall.x,wall.y,4,wall.h);
  }

  drawCrate();
  drawPuzzle();
  drawCheckpoint();
  drawExit();

  ctx.restore();
}

// ======================================================
// CHARACTER ANIMATIONS
// ======================================================

function drawPlayer() {
  const p=player;

  const run=Math.sin(p.animation)*12;
  const jumpPose=p.state==="jump"||p.state==="fall";
  const slide=p.state==="slide";
  const wall=p.state==="wallslide";

  ctx.save();

  ctx.translate(
    p.x+p.w/2-game.camera,
    p.y+p.h
  );

  ctx.scale(p.facing,1);

  if (slide) {
    ctx.translate(0,-13);
    ctx.rotate(-.12);
  }

  if (
    p.invulnerable>0 &&
    Math.floor(game.time*15)%2===0
  ) {
    ctx.globalAlpha=.35;
  }

  // SHADOW
  if (p.grounded) {
    ctx.globalAlpha=.2;
    ctx.fillStyle="#000";

    ctx.beginPath();
    ctx.ellipse(0,3,22,5,0,0,Math.PI*2);
    ctx.fill();

    ctx.globalAlpha=1;
  }

  // LEGS
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

  // SHOES
  ctx.fillStyle="#56e6ed";
  ctx.fillRect(-17,-5,14,5);
  ctx.fillRect(5,-5,14,5);

  // BODY
  ctx.fillStyle="#1a3448";
  ctx.beginPath();
  ctx.roundRect(-13,-68,26,43,7);
  ctx.fill();

  // JACKET
  ctx.fillStyle="#56e6ed";
  ctx.fillRect(-3,-65,5,33);

  // ARMS
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

  // NECK
  ctx.fillStyle="#a6c3d1";
  ctx.fillRect(-5,-76,10,10);

  // HEAD
  ctx.fillStyle="#b9d0d9";
  ctx.beginPath();
  ctx.roundRect(-11,-95,22,22,7);
  ctx.fill();

  // HOOD
  ctx.fillStyle="#142636";
  ctx.beginPath();
  ctx.roundRect(-12,-98,24,12,6);
  ctx.fill();

  // VISOR
  ctx.fillStyle="#56e6ed";
  ctx.shadowColor="#56e6ed";
  ctx.shadowBlur=12;
  ctx.fillRect(1,-89,9,4);
  ctx.shadowBlur=0;

  ctx.restore();
}

// ======================================================
// PARTICLES RENDER
// ======================================================

function drawParticles() {
  ctx.save();

  for (const p of game.particles) {
    ctx.globalAlpha=Math.max(
      0,
      p.life/p.maxLife
    );

    ctx.fillStyle="#79edf2";
    ctx.shadowBlur=12;
    ctx.shadowColor="#56e6ed";

    ctx.fillRect(
      p.x-game.camera,
      p.y,
      p.size,
      p.size
    );
  }

  ctx.restore();
}

// ======================================================
// LIGHTING
// ======================================================

function drawLighting() {
  const gradient=ctx.createRadialGradient(
    W/2,H/2,180,
    W/2,H/2,850
  );

  gradient.addColorStop(0,"transparent");
  gradient.addColorStop(1,"rgba(0,0,0,.48)");

  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,W,H);
}

// ======================================================
// RENDER
// ======================================================

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
  drawPlayer();

  ctx.restore();

  drawLighting();
}

// ======================================================
// GAME UPDATE
// ======================================================

function update(dt) {
  game.time+=dt;

  updatePlayer(dt);
  updatePuzzle(dt);
  updateParticles(dt);
  updateCamera(dt);
}

// ======================================================
// GAME LOOP
// ======================================================

function loop(timestamp) {
  const dt=Math.min(
    Math.max((timestamp-game.lastTime)/1000,0),
    .033
  );

  game.lastTime=timestamp;

  if (game.running && !game.paused) {
    update(dt);
  }

  render();

  requestAnimationFrame(loop);
}

// ======================================================
// MENU SYSTEM
// ======================================================

function clearControls() {
  for (const key of Object.keys(input)) {
    input[key]=false;
  }
}

function startGame() {
  resetGame();
  clearControls();

  game.running=true;
  game.paused=false;
  game.won=false;

  game.lastTime=performance.now();

  ui.intro.classList.add("hidden");
  ui.pause.classList.add("hidden");
  ui.win.classList.add("hidden");
  ui.hud.classList.remove("hidden");

  render();
}

function showMainMenu() {
  game.running=false;
  game.paused=false;
  game.won=false;

  clearControls();
  resetGame();

  ui.intro.classList.remove("hidden");
  ui.pause.classList.add("hidden");
  ui.win.classList.add("hidden");
  ui.hud.classList.add("hidden");

  render();
}

function togglePause() {
  if (!game.running && !game.paused) return;

  game.paused=!game.paused;

  clearControls();

  ui.pause.classList.toggle(
    "hidden",
    !game.paused
  );

  if (!game.paused) {
    game.lastTime=performance.now();
  }
}

function winGame() {
  if (game.won) return;

  game.won=true;
  game.running=false;
  game.paused=false;

  clearControls();

  ui.win.classList.remove("hidden");
}

// ======================================================
// BUTTON EVENTS
// ======================================================

ui.start.addEventListener("click",startGame);

ui.pauseButton.addEventListener("click",togglePause);

ui.resume.addEventListener("click",()=>{
  game.paused=false;
  game.lastTime=performance.now();

  clearControls();
  ui.pause.classList.add("hidden");
});

ui.restart.addEventListener("click",startGame);
ui.again.addEventListener("click",startGame);

ui.menu.addEventListener("click",showMainMenu);
ui.winMenu.addEventListener("click",showMainMenu);

// ======================================================
// INITIALIZATION
// ======================================================

resetGame();

game.running=false;
game.paused=false;

ui.intro.classList.remove("hidden");
ui.pause.classList.add("hidden");
ui.win.classList.add("hidden");
ui.hud.classList.add("hidden");

render();

requestAnimationFrame(loop);

console.log("PROJECT: ECHO ENGINE INITIALIZED");
