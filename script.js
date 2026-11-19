
"use strict";

// ======================================
// PROJECT ECHO - DIRECT GAME ENGINE
// ======================================

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

// ======================================
// GAME STATE
// ======================================

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

// ======================================
// LEVEL
// ======================================

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

// ======================================
// PLAYER
// ======================================

const player = {
  x:100,
  y:550,
  w:35,
  h:78,

  vx:0,
  vy:0,

  facing:1,
  grounded:false,
  wallSide:0,

  coyote:0,
  buffer:0,

  jumps:0,
  maxJumps:2,

  sliding:false,
  state:"idle",
  animation:0,

  trail:[],
  invulnerable:0
};

const spawn = {x:100,y:550};

// ======================================
// INPUT
// ======================================

function setKey(name,value) {
  if (name==="jump" && value && !keys.jump) {
    keys.jumpPressed=true;
  }
  keys[name]=value;
}

window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();

  if ([
    "arrowleft","arrowright",
    "arrowup","arrowdown"," "
  ].includes(k)) e.preventDefault();

  if(k==="a" || k==="arrowleft") setKey("left",true);
  if(k==="d" || k==="arrowright") setKey("right",true);
  if(k==="w" || k==="arrowup" || k===" ") setKey("jump",true);
  if(k==="s" || k==="arrowdown") setKey("slide",true);

  if(k==="escape") togglePause();
});

window.addEventListener("keyup",e=>{
  const k=e.key.toLowerCase();

  if(k==="a" || k==="arrowleft") setKey("left",false);
  if(k==="d" || k==="arrowright") setKey("right",false);
  if(k==="w" || k==="arrowup" || k===" ") setKey("jump",false);
  if(k==="s" || k==="arrowdown") setKey("slide",false);
});

document.querySelectorAll("[data-key]").forEach(btn=>{
  const name=btn.dataset.key;

  btn.addEventListener("pointerdown",e=>{
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    setKey(name,true);
  });

  const release=()=>setKey(name,false);

  btn.addEventListener("pointerup",release);
  btn.addEventListener("pointercancel",release);
  btn.addEventListener("lostpointercapture",release);
});

// ======================================
// COLLISIONS
// ======================================

function hit(a,b) {
  return a.x<b.x+b.w &&
    a.x+a.w>b.x &&
    a.y<b.y+b.h &&
    a.y+a.h>b.y;
}

function solids() {
  const list=[
    ...level.platforms,
    ...level.walls
  ];

  if(!level.door.open) list.push(level.door);

  return list;
}

function movePlayer(dt) {
  player.x+=player.vx*dt;

  player.wallSide=0;

  for(const s of solids()) {
    if(!hit(player,s)) continue;

    if(player.vx>0) {
      player.x=s.x-player.w;
      player.wallSide=1;
    } else if(player.vx<0) {
      player.x=s.x+s.w;
      player.wallSide=-1;
    }

    player.vx=0;
  }

  player.y+=player.vy*dt;
  player.grounded=false;

  for(const s of solids()) {
    if(!hit(player,s)) continue;

    if(player.vy>=0) {
      player.y=s.y-player.h;
      player.vy=0;
      player.grounded=true;
      player.jumps=0;
    } else {
      player.y=s.y+s.h;
      player.vy=0;
    }
  }

  player.x=Math.max(0,Math.min(
    level.width-player.w,
    player.x
  ));

  if(player.grounded) {
    player.coyote=.12;
  } else {
    player.coyote=Math.max(0,player.coyote-dt);
  }
}

// ======================================
// PARKOUR
// ======================================

function updatePlayer(dt) {
  const dir=(keys.right?1:0)-(keys.left?1:0);

  if(dir) player.facing=dir;

  if(keys.jumpPressed) {
    player.buffer=.14;
  } else {
    player.buffer=Math.max(0,player.buffer-dt);
  }

  player.sliding=keys.slide && player.grounded;

  const acceleration=player.grounded?2400:1250;
  const speed=player.sliding?510:370;

  if(dir) {
    player.vx+=dir*acceleration*dt;
  } else {
    player.vx*=Math.pow(
      player.grounded?.0008:.12,
      dt
    );
  }

  player.vx=Math.max(-speed,Math.min(speed,player.vx));

  if(player.sliding) {
    player.vx+=player.facing*260*dt;
    player.vx=Math.max(-520,Math.min(520,player.vx));
  }

  // Jump / double jump / wall jump

  if(player.buffer>0) {
    if(player.grounded || player.coyote>0) {
      player.vy=-760;
      player.jumps=1;
      player.grounded=false;
      player.coyote=0;
      player.buffer=0;

      burst(player.x+17,player.y+78,14);

    } else if(player.wallSide!==0) {
      player.vy=-730;
      player.vx=-player.wallSide*490;
      player.facing=-player.wallSide;
      player.jumps=1;
      player.wallSide=0;
      player.buffer=0;

      burst(player.x+17,player.y+40,16);

    } else if(player.jumps<player.maxJumps) {
      player.vy=-700;
      player.jumps++;
      player.buffer=0;

      burst(player.x+17,player.y+40,12);
    }
  }

  if(!keys.jump && player.vy < -180) {
    player.vy+=1900*dt;
  }

  player.vy+=level.gravity*dt;
  player.vy=Math.min(player.vy,1050);

  movePlayer(dt);

  if(!player.grounded && player.wallSide!==0 &&
    player.vy>100 && dir===player.wallSide) {
    player.vy=Math.min(player.vy,230);
    player.state="wallslide";
  } else if(player.sliding) {
    player.state="slide";
  } else if(!player.grounded) {
    player.state=player.vy<0?"jump":"fall";
  } else if(Math.abs(player.vx)>25) {
    player.state="run";
  } else {
    player.state="idle";
  }

  player.animation+=dt*Math.max(3,Math.abs(player.vx)/65);

  if(player.invulnerable>0) player.invulnerable-=dt;

  if(player.y>850) respawn();

  if(player.grounded && Math.abs(player.vx)>280 &&
     Math.random()<.2) {
    burst(player.x+17,player.y+78,1);
  }

  if(Math.abs(player.vx)>120 && time%0.07<dt) {
    player.trail.push({
      x:player.x+17,
      y:player.y+39,
      alpha:.25
    });
  }

  player.trail=player.trail.slice(-8);

  keys.jumpPressed=false;
}

// ======================================
// PUZZLES
// ======================================

function updateCrate(dt) {
  const c=level.crate;
  const oldY=c.y;

  c.y+=level.gravity*dt;

  if(c.y>=570) c.y=570;

  for(const p of level.platforms) {
    if(c.x+c.w>p.x && c.x<p.x+p.w &&
      oldY+c.h<=p.y+5 && c.y+c.h>=p.y) {
      c.y=p.y-c.h;
    }
  }

  if(hit(player,c)) {
    if(player.vx>0) c.x=player.x+player.w;
    else if(player.vx<0) c.x=player.x-c.w;

    c.x=Math.max(650,Math.min(1100-c.w,c.x));
  }
}

function updatePuzzle(dt) {
  updateCrate(dt);

  const c=level.crate;
  const p=level.plate;

  p.pressed=hit(c,p)||hit(player,p);

  level.door.open=p.pressed;

  if(p.pressed) {
    ui.objective.textContent="Porta desbloqueada!";
    ui.status.textContent="PUZZLE RESOLVIDO";
  } else {
    ui.objective.textContent="Empurre a caixa até o botão";
    ui.status.textContent="RESOLVA O MECANISMO";
  }

  if(player.x>level.checkpoint.x-70 &&
     !level.checkpoint.active) {
    level.checkpoint.active=true;
    ui.checkpoint.textContent="02";
    burst(level.checkpoint.x,550,30);
  }

  if(hit(player,level.exit)) winGame();
}

// ======================================
// RESPAWN
// ======================================

function respawn() {
  player.x=level.checkpoint.active?level.checkpoint.x:spawn.x;
  player.y=level.checkpoint.active?490:spawn.y;

  player.vx=0;
  player.vy=0;
  player.invulnerable=1;
  shake=12;
}

// ======================================
// PARTICLES
// ======================================

function burst(x,y,count) {
  for(let i=0;i<count;i++) {
    const angle=Math.random()*Math.PI*2;
    const speed=40+Math.random()*280;

    particles.push({
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
  for(const p of particles) {
    p.x+=p.vx*dt;
    p.y+=p.vy*dt;
    p.vy+=300*dt;
    p.life-=dt;
  }

  for(let i=particles.length-1;i>=0;i--) {
    if(particles[i].life<=0) particles.splice(i,1);
  }
}

// ======================================
// CAMERA
// ======================================

function updateCamera(dt) {
  const target=player.x-W*.38;

  camera+=(target-camera)*(1-Math.exp(-5*dt));

  camera=Math.max(0,Math.min(level.width-W,camera));

  shake=Math.max(0,shake-30*dt);
}

// ======================================
// BACKGROUND
// ======================================

function drawBackground() {
  const g=ctx.createLinearGradient(0,0,0,H);

  g.addColorStop(0,"#091727");
  g.addColorStop(.65,"#142638");
  g.addColorStop(1,"#1a2936");

  ctx.fillStyle=g;
  ctx.fillRect(0,0,W,H);

  for(let i=0;i<22;i++) {
    const x=i*190-(camera*.18)%190;
    const height=160+(i*73%210);

    ctx.fillStyle=i%2?"#122335":"#172b3e";
    ctx.fillRect(x,H-height,130,height);

    ctx.fillStyle="#31516a44";

    for(let j=0;j<5;j++) {
      ctx.fillRect(x+15+j*23,H-height+25,8,30);
    }
  }

  ctx.fillStyle="#203b50";
  ctx.fillRect(0,145,W,9);

  for(let i=0;i<8;i++) {
    const x=(i*190-camera*.35%W+W)%W;
    const pulse=.5+Math.sin(time*2+i)*.25;

    ctx.fillStyle=`rgba(65,220,235,${pulse*.12})`;

    ctx.beginPath();
    ctx.arc(x,260,100,0,Math.PI*2);
    ctx.fill();
  }

  for(let i=0;i<55;i++) {
    const x=(i*173+time*12-camera*.4)%W;
    const y=(i*97+Math.sin(time+i)*20)%H;

    ctx.fillStyle="#b5e8ed55";
    ctx.fillRect(x,y,2,2);
  }
}

// ======================================
// WORLD RENDER
// ======================================

function drawPlatform(p) {
  ctx.fillStyle="#243747";
  ctx.fillRect(p.x,p.y,p.w,p.h);

  ctx.fillStyle="#587184";
  ctx.fillRect(p.x,p.y,p.w,5);

  ctx.fillStyle="#162635";
  ctx.fillRect(p.x,p.y+10,p.w,p.h-10);

  for(let x=p.x+10;x<p.x+p.w;x+=45) {
    ctx.fillStyle="#536a7b55";
    ctx.fillRect(x,p.y+15,2,p.h-20);
  }
}

function drawWorld() {
  ctx.save();
  ctx.translate(-camera,0);

  level.platforms.forEach(drawPlatform);

  for(const wall of level.walls) {
    ctx.fillStyle="#263a4c";
    ctx.fillRect(wall.x,wall.y,wall.w,wall.h);

    ctx.fillStyle="#5a7587";
    ctx.fillRect(wall.x,wall.y,4,wall.h);
  }

  // Crate
  const c=level.crate;

  ctx.fillStyle="#172a3c";
  ctx.fillRect(c.x,c.y,c.w,c.h);

  ctx.strokeStyle="#82a6b8";
  ctx.lineWidth=3;
  ctx.strokeRect(c.x+4,c.y+4,c.w-8,c.h-8);

  ctx.strokeStyle="#54778b";
  ctx.beginPath();
  ctx.moveTo(c.x+8,c.y+8);
  ctx.lineTo(c.x+c.w-8,c.y+c.h-8);
  ctx.moveTo(c.x+c.w-8,c.y+8);
  ctx.lineTo(c.x+8,c.y+c.h-8);
  ctx.stroke();

  // Pressure plate
  const p=level.plate;

  ctx.fillStyle=p.pressed?"#56e6ed":"#536578";
  ctx.fillRect(p.x,p.y,p.w,p.h);

  // Door
  if(!level.door.open) {
    ctx.fillStyle="#17283b";
    ctx.fillRect(
      level.door.x,
      level.door.y,
      level.door.w,
      level.door.h
    );

    ctx.strokeStyle="#6d879c";
    ctx.strokeRect(
      level.door.x+4,
      level.door.y+4,
      level.door.w-8,
      level.door.h-8
    );
  } else {
    ctx.fillStyle="#56e6ed33";
    ctx.fillRect(
      level.door.x,
      level.door.y,
      level.door.w,
      level.door.h
    );
  }

  // Checkpoint
  const cp=level.checkpoint;

  ctx.fillStyle=cp.active?"#56e6ed":"#61778a";
  ctx.fillRect(cp.x,530,5,100);

  ctx.beginPath();
  ctx.moveTo(cp.x+5,532);
  ctx.lineTo(cp.x+65,550);
  ctx.lineTo(cp.x+5,570);
  ctx.closePath();
  ctx.fill();

  // Exit
  const e=level.exit;

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

  ctx.restore();
}

// ======================================
// CHARACTER RENDER
// ======================================

function drawPlayer() {
  const p=player;

  const run=Math.sin(p.animation)*12;
  const jumping=p.state==="jump"||p.state==="fall";

  ctx.save();

  ctx.translate(p.x+17-camera,p.y+78);
  ctx.scale(p.facing,1);

  if(p.sliding) {
    ctx.translate(0,-13);
    ctx.rotate(-.12);
  }

  if(p.invulnerable>0 && Math.floor(time*15)%2===0) {
    ctx.globalAlpha=.35;
  }

  // Shadow
  if(p.grounded) {
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

  if(p.sliding) {
    ctx.moveTo(-5,-17);
    ctx.lineTo(20,-5);
    ctx.moveTo(4,-17);
    ctx.lineTo(29,-4);
  } else if(jumping) {
    ctx.moveTo(-5,-30);
    ctx.lineTo(-15,-14);
    ctx.moveTo(5,-30);
    ctx.lineTo(15,-12);
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

  ctx.fillStyle="#56e6ed";
  ctx.fillRect(-3,-65,5,33);

  // Arms
  ctx.strokeStyle="#28475b";
  ctx.lineWidth=7;

  ctx.beginPath();

  if(jumping) {
    ctx.moveTo(-11,-59);
    ctx.lineTo(-22,-79);
    ctx.moveTo(11,-59);
    ctx.lineTo(23,-76);
  } else {
    ctx.moveTo(-11,-58);
    ctx.lineTo(-18+run*.6,-40);
    ctx.moveTo(11,-58);
    ctx.lineTo(18-run*.6,-40);
  }

  ctx.stroke();

  // Head
  ctx.fillStyle="#a6c3d1";
  ctx.fillRect(-5,-76,10,10);

  ctx.fillStyle="#b9d0d9";
  ctx.beginPath();
  ctx.roundRect(-11,-95,22,22,7);
  ctx.fill();

  // Hood
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

// ======================================
// PARTICLE RENDER
// ======================================

function drawParticles() {
  for(const p of particles) {
    ctx.globalAlpha=Math.max(0,p.life/p.maxLife);

    ctx.fillStyle="#79edf2";
    ctx.shadowBlur=12;
    ctx.shadowColor="#56e6ed";

    ctx.fillRect(
      p.x-camera,
      p.y,
      p.size,
      p.size
    );
  }

  ctx.globalAlpha=1;
  ctx.shadowBlur=0;
}

// ======================================
// LIGHTING
// ======================================

function drawLighting() {
  const g=ctx.createRadialGradient(
    W/2,H/2,180,
    W/2,H/2,850
  );

  g.addColorStop(0,"transparent");
  g.addColorStop(1,"rgba(0,0,0,.48)");

  ctx.fillStyle=g;
  ctx.fillRect(0,0,W,H);
}

// ======================================
// RENDER
// ======================================

function render() {
  ctx.clearRect(0,0,W,H);

  drawBackground();

  ctx.save();

  if(shake>0) {
    ctx.translate(
      (Math.random()-.5)*shake,
      (Math.random()-.5)*shake
    );
  }

  drawWorld();
  drawParticles();
  drawPlayer();

  ctx.restore();

  drawLighting();
}

// ======================================
// GAME UPDATE
// ======================================

function update(dt) {
  time+=dt;

  updatePlayer(dt);
  updatePuzzle(dt);
  updateParticles(dt);
  updateCamera(dt);
}

// ======================================
// PAUSE / WIN / RESET
// ======================================

function clearKeys() {
  for(const k in keys) keys[k]=false;
}

function togglePause() {
  if(!running && !paused) return;

  paused=!paused;
  clearKeys();

  ui.pause.classList.toggle("hidden",!paused);

  if(!paused) lastTime=performance.now();
}

function resetGame() {
  player.x=spawn.x;
  player.y=spawn.y;
  player.vx=0;
  player.vy=0;
  player.grounded=false;
  player.wallSide=0;
  player.jumps=0;
  player.coyote=0;
  player.buffer=0;
  player.state="idle";
  player.animation=0;
  player.trail=[];
  player.invulnerable=0;

  level.crate.x=850;
  level.crate.y=570;
  level.plate.pressed=false;
  level.door.open=false;
  level.checkpoint.active=false;

  camera=0;
  time=0;
  shake=0;
  particles.length=0;
  won=false;

  ui.checkpoint.textContent="01";
  ui.objective.textContent="Explore a instalação";
  ui.status.textContent="EXPLORANDO";
}

function restartGame() {
  resetGame();
  running=true;
  paused=false;
  clearKeys();

  ui.message.classList.add("hidden");
  ui.pause.classList.add("hidden");

  lastTime=performance.now();
}

function winGame() {
  if(won) return;

  won=true;
  running=false;

  ui.message.classList.remove("hidden");
}

$("pause").addEventListener("click",togglePause);

$("resume").addEventListener("click",togglePause);

$("restart").addEventListener("click",restartGame);

$("again").addEventListener("click",restartGame);

// ======================================
// MAIN LOOP
// ======================================

function loop(timestamp) {
  const dt=Math.min(
    Math.max((timestamp-lastTime)/1000,0),
    0.033
  );

  lastTime=timestamp;

  if(running && !paused && !won) {
    update(dt);
  }

  render();

  requestAnimationFrame(loop);
}

// ======================================
// START AUTOMATICALLY
// ======================================

resetGame();

running=true;
paused=false;
won=false;

ui.message.classList.add("hidden");
ui.pause.classList.add("hidden");

lastTime=performance.now();

render();
requestAnimationFrame(loop);

console.log("PROJECT ECHO: GAME STARTED");
