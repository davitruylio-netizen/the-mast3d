
import * as THREE from 'three';

const $ = id => document.getElementById(id);

const ui = {
  loading: $('loading'),
  loadBar: $('loadBar'),
  loadText: $('loadText'),
  menu: $('menu'),
  hud: $('hud'),
  pause: $('pause'),
  ending: $('ending'),
  objective: $('objectiveText'),
  chapter: $('chapter'),
  battery: $('batteryBar'),
  batteryText: $('batteryText'),
  message: $('message'),
  interaction: $('interaction'),
  toast: $('documentToast'),
  mobile: $('mobileControls')
};

let scene, camera, renderer, clock;
let player, flashlight, enemy, water;
let started = false;
let paused = false;
let ended = false;
let flashOn = true;
let battery = 100;
let yaw = 0;
let pitch = 0;
let velocityY = 0;
let keys = {};
let interactables = [];
let collected = new Set();
let repeaters = 0;
let records = 0;
let objectiveIndex = 0;
let messageTimer = 0;
let enemyState = 'hidden';
let enemyTimer = 0;
let enemyAlert = 0;
let mobileMove = {x:0,y:0};
let lookTouch = null;
let lastLook = {x:0,y:0};
let runningTouch = false;

const isMobile = matchMedia('(pointer:coarse)').matches;

const objectives = [
  'Encontre um caminho até a estação.',
  'Procure os registros da pesquisadora.',
  'Ative os três repetidores de sinal.',
  'Encontre a chave do farol.',
  'Suba até a sala de transmissão.'
];

function setObjective(index) {
  objectiveIndex = index;
  ui.objective.textContent = objectives[index] || 'Descubra o que a ilha esconde.';

  ui.chapter.textContent =
    index < 1 ? 'PRÓLOGO — A CHEGADA' :
    index < 2 ? 'CAPÍTULO I — SINAIS' :
    'CAPÍTULO II — MEMÓRIA RESIDUAL';
}

function say(text, duration = 3500) {
  ui.message.textContent = text;
  ui.message.classList.add('show');
  messageTimer = duration / 1000;
}

function toast(title, text) {
  ui.toast.innerHTML = `<strong>${title}</strong><br>${text}`;
  ui.toast.classList.remove('hidden');

  setTimeout(() => ui.toast.classList.add('hidden'), 6000);
}

function mat(color, roughness = 1, metalness = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });
}

function addMesh(geometry, material, x, y, z, parent = scene) {
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  parent.add(mesh);

  return mesh;
}

function addBox(x,y,z,sx,sy,sz,material) {
  return addMesh(
    new THREE.BoxGeometry(sx,sy,sz),
    material,
    x,y,z
  );
}

function addTree(x,z,scale=1) {
  addMesh(
    new THREE.CylinderGeometry(.18*scale,.28*scale,2.8*scale,7),
    mat(0x302b25),
    x,1.4*scale,z
  );

  const crown = addMesh(
    new THREE.ConeGeometry(1.55*scale,4.2*scale,7),
    mat(0x142b2a),
    x,4*scale,z
  );

  crown.rotation.y = Math.random()*6.28;
}

function addRock(x,z,size=1) {
  const rock = addMesh(
    new THREE.DodecahedronGeometry(size,0),
    mat(0x303c3d),
    x,size*.55,z
  );

  rock.scale.set(1.3,.8,1);
  rock.rotation.set(Math.random(),Math.random(),Math.random());
}

function addLight(x,y,z,color,intensity,distance) {
  const light = new THREE.PointLight(color,intensity,distance);
  light.position.set(x,y,z);
  scene.add(light);
  return light;
}

function addInteractable(mesh,label,action) {
  interactables.push({
    mesh,
    label,
    action
  });
}

function buildWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a171d);
  scene.fog = new THREE.FogExp2(0x14272b,.018);

  camera = new THREE.PerspectiveCamera(
    74,
    innerWidth/innerHeight,
    .08,
    220
  );

  renderer = new THREE.WebGLRenderer({
    antialias: !isMobile,
    powerPreference: 'high-performance'
  });

  renderer.setPixelRatio(
    Math.min(devicePixelRatio,isMobile?1.35:1.8)
  );

  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled = !isMobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  $('game').prepend(renderer.domElement);

  clock = new THREE.Clock();

  const hemi = new THREE.HemisphereLight(
    0x9bbec4,
    0x17201c,
    1.05
  );

  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0x9bbdc5,1.35);
  moon.position.set(-35,55,-20);
  moon.castShadow = !isMobile;
  moon.shadow.mapSize.set(1024,1024);
  scene.add(moon);

  // Terreno
  const ground = addMesh(
    new THREE.PlaneGeometry(180,180),
    mat(0x263b36),
    0,-.16,0
  );

  ground.rotation.x = -Math.PI/2;

  const beach = addMesh(
    new THREE.PlaneGeometry(180,30),
    mat(0x4a4b3e),
    0,-.12,24
  );

  beach.rotation.x = -Math.PI/2;

  // Oceano
  const oceanGeometry = new THREE.PlaneGeometry(260,260,60,60);
  const positions = oceanGeometry.attributes.position;

  for(let i=0;i<positions.count;i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);

    positions.setZ(
      i,
      Math.sin(x*.11+y*.08)*.11 +
      Math.cos(y*.16)*.07
    );
  }

  oceanGeometry.computeVertexNormals();

  water = addMesh(
    oceanGeometry,
    new THREE.MeshStandardMaterial({
      color:0x102d36,
      roughness:.28,
      metalness:.25,
      transparent:true,
      opacity:.92
    }),
    0,-.32,55
  );

  water.rotation.x = -Math.PI/2;

  // Floresta
  for(let i=0;i<65;i++) {
    const angle = Math.random()*Math.PI*2;
    const radius = 25+Math.random()*43;

    const x = Math.cos(angle)*radius;
    const z = Math.sin(angle)*radius-10;

    if(z>16) continue;

    addTree(x,z,.75+Math.random()*.85);
  }

  for(let x=-35;x<=35;x+=5) {
    for(let z=-35;z<=4;z+=5) {
      if(Math.random()>.25 && Math.hypot(x,z+8)>12) {
        addTree(
          x+(Math.random()-.5)*2,
          z+(Math.random()-.5)*2,
          .8+Math.random()*.55
        );
      }
    }
  }

  for(let i=0;i<32;i++) {
    const x = (Math.random()-.5)*105;
    const z = (Math.random()-.5)*95-8;

    if(z<20) addRock(x,z,.5+Math.random()*1.5);
  }

  // Estação científica
  const concrete = mat(0x4b5550);
  const dark = mat(0x182629);
  const metal = mat(0x374b4d,.65,.5);

  addBox(0,2,-29,18,4,12,concrete);
  addBox(0,4.1,-29,19,.35,13,dark);

  addBox(-5,2.1,-22.85,3,2.6,.12,mat(0x101b20));
  addBox(4,2.1,-22.85,3,2.6,.12,mat(0x101b20));

  for(let x=-7;x<=7;x+=3.5) {
    const windowMesh = addBox(
      x,2.5,-22.78,
      2.2,1.25,.08,
      mat(0x233b40)
    );

    windowMesh.material.emissive = new THREE.Color(0x0b2024);
  }

  addBox(0,1.25,-22.8,2.1,2.5,.2,metal);

  for(let i=0;i<5;i++) {
    addBox(0,.18+i*.22,-20.5+i*.55,4,.22,.9,concrete);
  }

  // Antena
  addMesh(
    new THREE.CylinderGeometry(.12,.2,17,8),
    metal,
    14,8.5,-36
  );

  for(let y=4;y<16;y+=3) {
    const ring = addMesh(
      new THREE.TorusGeometry(1.25,.045,6,24),
      metal,
      14,y,-36
    );

    ring.rotation.x = Math.PI/2;
  }

  addMesh(
    new THREE.SphereGeometry(.45,12,12),
    new THREE.MeshBasicMaterial({color:0x9ad6d1}),
    14,17,-36
  );

  addLight(14,17,-36,0x7bd4d4,2,15);

  // Farol
  addBox(-29,5,-65,7,10,7,concrete);
  addBox(-29,10.2,-65,8,.5,8,dark);

  addMesh(
    new THREE.CylinderGeometry(2.1,2.1,2.2,12),
    new THREE.MeshStandardMaterial({
      color:0x273b40,
      emissive:0x152d32
    }),
    -29,11.5,-65
  );

  const beaconLight = addLight(
    -29,12,-65,
    0x9cd8d2,
    3,
    55
  );

  for(let i=0;i<4;i++) {
    addBox(
      -29+(i%2?3.7:-3.7),
      5,
      -65+(i<2?3.7:-3.7),
      .3,10,.3,
      metal
    );
  }

  // Cabana
  addBox(20,1.5,-7,7,3,6,mat(0x3d4945));
  addBox(20,3.1,-7,7.6,.35,6.6,dark);
  addBox(20,1.4,-3.9,1.5,2.6,.12,metal);

  // Gerador
  addMesh(
    new THREE.BoxGeometry(2,1.4,1.2),
    metal,
    -12,.8,-15
  );

  addLight(-12,1.6,-15,0x4bb9ae,.4,5);

  // Repetidores
  const repeaterPositions = [
    [-17,1,-34],
    [15,1,-43],
    [2,1,-57]
  ];

  repeaterPositions.forEach((position,index)=>{
    const group = new THREE.Group();
    group.position.set(...position);
    scene.add(group);

    addMesh(
      new THREE.CylinderGeometry(.15,.22,2.6,8),
      metal,
      0,1.3,0,
      group
    );

    const panel = addMesh(
      new THREE.BoxGeometry(1.4,.85,.15),
      mat(0x253c3e),
      0,2.1,0,
      group
    );

    const lamp = addMesh(
      new THREE.SphereGeometry(.17,10,10),
      new THREE.MeshBasicMaterial({color:0x8a3b32}),
      0,2.1,.13,
      group
    );

    addInteractable(panel,`Repetidor ${index+1}`,()=>{
      if(collected.has('rep'+index)) {
        say('Este repetidor já está ativo.');
        return;
      }

      collected.add('rep'+index);
      repeaters++;

      lamp.material.color.setHex(0x8de0bf);
      addLight(
        position[0],
        3.1,
        position[2],
        0x5cd9b0,
        1.2,
        8
      );

      say(`Repetidor ${index+1} sincronizado. Sinal ${repeaters}/3.`);

      if(repeaters===3) {
        setObjective(3);
        say('Os três sinais estão ativos. Algo respondeu do farol.');
      }
    });
  });

  // Documentos
  const documentSpots = [
    [-5,1,-26],
    [22,1,-8],
    [-25,1,-46],
    [8,1,-63],
    [0,1,-38]
  ];

  const documentTexts = [
    [
      'REGISTRO DE CAMPO 01',
      'A maré trouxe uma gravação que não deveria existir. A voz é de Elisa. A data, onze anos atrás.'
    ],
    [
      'ANOTAÇÃO DE HELENA',
      'A Memória Residual não reproduz o passado. Ela tenta completá-lo. Não respondam às vozes.'
    ],
    [
      'RELATÓRIO 07-B',
      'A criatura aparece quando alguém altera a frequência. Ela segue o som, mas aprende os caminhos.'
    ],
    [
      'CARTA NÃO ENVIADA',
      'Se você chegou até aqui, Mara, não procure uma resposta que possa destruir você.'
    ],
    [
      'FITA DE ELISA',
      'Mara... se estiver ouvindo, não é a ilha falando. Sou eu. Ou o que restou da minha lembrança.'
    ]
  ];

  documentSpots.forEach((position,index)=>{
    const paper = addMesh(
      new THREE.BoxGeometry(.55,.06,.42),
      mat(0xc4bda0),
      position[0],
      position[1]+.55,
      position[2]
    );

    paper.rotation.y = Math.random()*.5;

    addLight(
      position[0],
      position[1]+.8,
      position[2],
      0x8ec9bf,
      .25,
      3
    );

    addInteractable(paper,documentTexts[index][0],()=>{
      if(collected.has('doc'+index)) {
        say('Você já leu este registro.');
        return;
      }

      collected.add('doc'+index);
      records++;

      toast(
        documentTexts[index][0],
        documentTexts[index][1]
      );

      say('Registro armazenado.');
    });
  });

  // Chave
  const key = addMesh(
    new THREE.TorusGeometry(.22,.055,8,18),
    mat(0xc3a96b),
    20,.9,-8
  );

  key.rotation.x = Math.PI/2;
  addLight(20,1,-8,0xe2c27a,.4,4);

  addInteractable(key,'Chave enferrujada',()=>{
    if(!collected.has('key')) {
      collected.add('key');
      key.visible = false;
      say('Chave do farol obtida.');
      setObjective(4);
    }
  });

  // Console do farol
  const consoleMesh = addMesh(
    new THREE.BoxGeometry(2.8,2.2,.2),
    mat(0x263c3c),
    -29,8,-60
  );

  addInteractable(consoleMesh,'Transmissor do farol',()=>{
    if(repeaters<3) {
      say('O transmissor não responde. Ative os três repetidores.');
      return;
    }

    if(!collected.has('key')) {
      say('A sala está trancada. Encontre a chave.');
      return;
    }

    finishGame();
  });

  // Personagem
  player = new THREE.Object3D();
  player.position.set(0,0,30);
  scene.add(player);

  camera.position.set(0,1.65,0);
  player.add(camera);
  camera.rotation.order = 'YXZ';

  // Lanterna
  flashlight = new THREE.SpotLight(
    0xd7f1e9,
    3.8,
    29,
    Math.PI/7,
    .35,
    1.2
  );

  flashlight.position.set(.15,-.1,-.1);
  flashlight.target.position.set(0,0,-1);

  camera.add(flashlight);
  camera.add(flashlight.target);

  // Criatura
  enemy = new THREE.Group();
  scene.add(enemy);
  enemy.visible = false;

  addMesh(
    new THREE.CapsuleGeometry(.55,1.7,5,8),
    mat(0x080d0f),
    0,1.6,0,
    enemy
  );

  addMesh(
    new THREE.SphereGeometry(.42,10,8),
    mat(0x0a1012),
    0,2.8,0,
    enemy
  );

  const eyeMaterial = new THREE.MeshBasicMaterial({
    color:0x9b2420
  });

  addMesh(
    new THREE.SphereGeometry(.07,8,8),
    eyeMaterial,
    -.17,2.85,-.36,
    enemy
  );

  addMesh(
    new THREE.SphereGeometry(.07,8,8),
    eyeMaterial,
    .17,2.85,-.36,
    enemy
  );

  enemy.scale.set(.9,1.1,.9);

  // Luzes ambientais
  for(let i=0;i<12;i++) {
    const x = (Math.random()-.5)*90;
    const z = -15-Math.random()*65;

    addMesh(
      new THREE.CylinderGeometry(.05,.08,4,5),
      mat(0x263b36),
      x,2,z
    );

    addLight(x,3.8,z,0x6da5a2,.28,9);
  }
}

function nearestInteractable() {
  let best = null;
  let bestDistance = 3.2;

  for(const item of interactables) {
    if(!item.mesh.visible) continue;

    const position = item.mesh.getWorldPosition(
      new THREE.Vector3()
    );

    const distance = player.position.distanceTo(position);

    if(distance<bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }

  return best;
}

function interact() {
  if(!started || paused || ended) return;

  const item = nearestInteractable();

  if(item) {
    item.action();
  } else {
    say('Nada para interagir por aqui.',1300);
  }
}

function toggleFlash() {
  if(battery<=0) {
    say('A bateria da lanterna acabou.');
    return;
  }

  flashOn = !flashOn;
  flashlight.visible = flashOn;

  say(
    flashOn ? 'Lanterna ligada.' : 'Lanterna desligada.',
    1000
  );
}

function finishGame() {
  ended = true;
  paused = true;

  ui.hud.classList.add('hidden');
  ui.mobile.classList.add('hidden');

  let title = 'A MARÉ LEVA';
  let text =
    'A transmissão termina em estática. A ilha permanece em silêncio, guardando uma história incompleta.';

  if(records>=4) {
    title = 'A MEMÓRIA INTEIRA';
    text =
      'Mara ouve a última gravação. Elisa não voltou, mas sua voz finalmente encontra descanso. Ao amanhecer, a ilha parece apenas uma ilha.';
  }

  if(records>=5 && repeaters===3) {
    title = 'O ÚLTIMO ECO';
    text =
      'Você altera a frequência antes de desligar o transmissor. Por um instante, todas as luzes da ilha acendem. Uma segunda voz responde — a sua, gravada muitos anos no futuro.';
  }

  $('endingTitle').textContent = title;
  $('endingText').textContent = text;

  ui.ending.classList.remove('hidden');
}

function startGame() {
  ui.menu.classList.add('hidden');
  ui.hud.classList.remove('hidden');

  started = true;
  paused = false;

  if(isMobile) {
    ui.mobile.classList.remove('hidden');
  } else {
    renderer.domElement.requestPointerLock?.();
  }

  setObjective(0);

  say(
    'A chuva apagou suas pegadas. A estação está adiante.',
    4200
  );
}

function pauseGame() {
  if(!started || ended) return;

  paused = !paused;
  ui.pause.classList.toggle('hidden',!paused);

  if(paused) {
    document.exitPointerLock?.();
  } else if(!isMobile) {
    renderer.domElement.requestPointerLock?.();
  }
}

function updatePlayer(dt) {
  if(!started || paused || ended) return;

  const forward = new THREE.Vector3(
    -Math.sin(yaw),0,-Math.cos(yaw)
  );

  const right = new THREE.Vector3(
    Math.cos(yaw),0,-Math.sin(yaw)
  );

  const mx =
    (keys.KeyD?1:0) -
    (keys.KeyA?1:0) +
    mobileMove.x;

  const mz =
    (keys.KeyW?1:0) -
    (keys.KeyS?1:0) -
    mobileMove.y;

  const moving = Math.abs(mx)+Math.abs(mz)>.05;

  const direction = new THREE.Vector3()
    .addScaledVector(right,mx)
    .addScaledVector(forward,mz);

  if(direction.lengthSq()>1) direction.normalize();

  const running = keys.ShiftLeft || runningTouch;
  const speed = running ? 6.5 : 4.2;

  player.position.addScaledVector(direction,speed*dt);

  player.position.x = THREE.MathUtils.clamp(
    player.position.x,-69,69
  );

  player.position.z = THREE.MathUtils.clamp(
    player.position.z,-72,49
  );

  velocityY -= 15*dt;
  player.position.y += velocityY*dt;

  if(player.position.y<0) {
    player.position.y = 0;
    velocityY = 0;
  }

  camera.position.y =
    1.62 +
    (moving ? Math.sin(performance.now()*.012)*(running?.055:.025) : 0);

  if(flashOn && battery>0) {
    battery = Math.max(0,battery-dt*.22);

    if(battery===0) {
      flashlight.visible = false;
      flashOn = false;
      say('A lanterna apagou.');
    }
  } else if(!flashOn) {
    battery = Math.min(100,battery+dt*.08);
  }

  ui.battery.style.width = battery+'%';
  ui.batteryText.textContent = Math.floor(battery)+'%';

  const near = nearestInteractable();

  ui.interaction.classList.toggle('hidden',!near);

  if(near) {
    ui.interaction.textContent =
      '[ E ] '+near.label.toUpperCase();
  }

  if(messageTimer>0) {
    messageTimer -= dt;

    if(messageTimer<=0) {
      ui.message.classList.remove('show');
    }
  }

  if(
    objectiveIndex===0 &&
    player.position.z < -17 &&
    Math.abs(player.position.x)<17
  ) {
    setObjective(1);
    say('A estação está abandonada. Procure por registros.',4000);
  }

  if(objectiveIndex===1 && records>=1) {
    setObjective(2);
    say('O diário menciona três repetidores espalhados pela ilha.',4000);
  }

  if(objectiveIndex===3 && collected.has('key')) {
    setObjective(4);
  }
}

function updateEnemy(dt) {
  if(!started || paused || ended) return;

  enemyTimer += dt;

  const distance = enemy.position.distanceTo(player.position);

  // A criatura aparece depois de algum tempo
  if(enemyState==='hidden' && enemyTimer>24) {
    enemy.visible = true;

    enemy.position.set(
      player.position.x+18,
      0,
      player.position.z-22
    );

    enemyState = 'watch';
    enemyTimer = 0;

    say('Um ruído pesado ecoa entre as árvores...',3500);
  }

  if(enemyState==='watch') {
    enemy.lookAt(
      player.position.x,
      1.5,
      player.position.z
    );

    if(distance<16 || enemyTimer>16) {
      enemyState = 'hunt';
      enemyAlert = 0;
    }
  }

  if(enemyState==='hunt') {
    const target = player.position.clone();
    target.y = 0;

    const direction = target.sub(enemy.position);
    const d = direction.length();

    direction.normalize();

    enemy.position.addScaledVector(
      direction,
      dt*(d<8?2.6:1.7)
    );

    enemy.lookAt(
      player.position.x,
      1.5,
      player.position.z
    );

    enemyAlert += dt;

    if(d<2) {
      say('A presença toma o ar. CORRA!',1800);

      player.position.add(
        new THREE.Vector3(
          (Math.random()-.5)*8,
          0,
          8
        )
      );

      enemy.visible = false;
      enemyState = 'hidden';
      enemyTimer = 0;

      battery = Math.max(10,battery-18);
    }

    if(enemyAlert>23 || d>38) {
      enemy.visible = false;
      enemyState = 'hidden';
      enemyTimer = 0;
    }
  }

  // Lanterna pode fazer a criatura recuar
  if(flashOn && enemy.visible && distance<18) {
    const toEnemy = enemy.position.clone()
      .sub(camera.getWorldPosition(new THREE.Vector3()))
      .normalize();

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    if(direction.dot(toEnemy)>.94) {
      enemyAlert += dt*.8;

      if(enemyAlert>5) {
        enemy.visible = false;
        enemyState = 'hidden';
        enemyTimer = 0;

        say('A luz fez a presença recuar.');
      }
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(),.04);

  if(started && !paused && !ended) {
    updatePlayer(dt);
    updateEnemy(dt);
  }

  if(water) {
    water.material.opacity =
      .88+Math.sin(performance.now()*.0007)*.04;
  }

  renderer.render(scene,camera);
}

function setupControls() {
  addEventListener('resize',()=>{
    if(!camera) return;

    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(innerWidth,innerHeight);
  });

  addEventListener('keydown',event=>{
    keys[event.code] = true;

    if(event.code==='KeyE') interact();
    if(event.code==='KeyF') toggleFlash();

    if(event.code==='Escape' && started && !isMobile) {
      pauseGame();
    }
  });

  addEventListener('keyup',event=>{
    keys[event.code] = false;
  });

  addEventListener('mousemove',event=>{
    if(
      document.pointerLockElement===renderer.domElement &&
      !paused
    ) {
      yaw -= event.movementX*.0022;
      pitch -= event.movementY*.0018;

      pitch = THREE.MathUtils.clamp(
        pitch,-1.35,1.35
      );

      camera.rotation.set(pitch,yaw,0);
    }
  });

  renderer.domElement.addEventListener('click',()=>{
    if(
      started &&
      !paused &&
      !isMobile &&
      !document.pointerLockElement
    ) {
      renderer.domElement.requestPointerLock?.();
    }
  });

  $('startBtn').onclick = startGame;
  $('resumeBtn').onclick = pauseGame;
  $('restartBtn').onclick = () => location.reload();
  $('againBtn').onclick = () => location.reload();

  if(isMobile) {
    const joystick = $('joystick');
    const stick = $('stick');

    function updateJoystick(event) {
      const rect = joystick.getBoundingClientRect();

      const dx = event.clientX-(rect.left+rect.width/2);
      const dy = event.clientY-(rect.top+rect.height/2);

      const length = Math.hypot(dx,dy);
      const scale = Math.min(1,45/(length||1));

      mobileMove = {
        x:dx*scale/45,
        y:dy*scale/45
      };

      stick.style.transform =
        `translate(${dx*scale}px,${dy*scale}px)`;
    }

    joystick.addEventListener('pointerdown',event=>{
      joystick.setPointerCapture(event.pointerId);
      updateJoystick(event);
    });

    joystick.addEventListener('pointermove',event=>{
      if(event.buttons) updateJoystick(event);
    });

    joystick.addEventListener('pointerup',()=>{
      mobileMove = {x:0,y:0};
      stick.style.transform = 'translate(0,0)';
    });

    const lookZone = $('lookZone');

    lookZone.addEventListener('pointerdown',event=>{
      lookTouch = event.pointerId;

      lastLook = {
        x:event.clientX,
        y:event.clientY
      };

      lookZone.setPointerCapture(event.pointerId);
    });

    lookZone.addEventListener('pointermove',event=>{
      if(lookTouch!==event.pointerId) return;

      const dx = event.clientX-lastLook.x;
      const dy = event.clientY-lastLook.y;

      lastLook = {
        x:event.clientX,
        y:event.clientY
      };

      yaw -= dx*.006;

      pitch = THREE.MathUtils.clamp(
        pitch-dy*.005,
        -1.25,
        1.25
      );

      camera.rotation.set(pitch,yaw,0);
    });

    lookZone.addEventListener('pointerup',()=>{
      lookTouch = null;
    });

    $('runTouch').addEventListener('pointerdown',()=>{
      runningTouch = true;
    });

    $('runTouch').addEventListener('pointerup',()=>{
      runningTouch = false;
    });

    $('runTouch').addEventListener('pointercancel',()=>{
      runningTouch = false;
    });

    $('interactTouch').onclick = interact;
    $('flashTouch').onclick = toggleFlash;

    $('hint').textContent =
      'Joystick mover · Arraste a tela para olhar · E interagir · ☼ lanterna';
  }
}

async function boot() {
  try {
    buildWorld();
    setupControls();

    for(let i=0;i<=100;i+=10) {
      ui.loadBar.style.width = i+'%';

      ui.loadText.textContent =
        i<100 ? 'PREPARANDO A EXPEDIÇÃO...' : 'SINAL ESTÁVEL';

      await new Promise(resolve=>setTimeout(resolve,65));
    }

    ui.loading.classList.add('hidden');
    ui.menu.classList.remove('hidden');

    animate();

  } catch(error) {
    console.error(error);
    ui.loadText.textContent =
      'ERRO AO INICIAR. RECARREGUE A PÁGINA.';
  }
}

boot();

