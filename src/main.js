import * as THREE from 'three';

// ─── Game constants ─────────────────────────────────────────────────────────
const VIEW_WIDTH = 20;
const VIEW_HEIGHT = 28;
const PLAYER_SPEED = 14;
const BULLET_SPEED = 22;
const ENEMY_SPEED = 5;
const ENEMY_SPAWN_INTERVAL = 0.9;
const PLAYER_HALF = 0.6;
const BULLET_RADIUS = 0.25;
const ENEMY_RADIUS = 0.7;
const STAR_COUNT = 120;

// ─── State ──────────────────────────────────────────────────────────────────
let scene, camera, renderer;
let playerMesh, playerVel = 0;
let bullets = [];
let enemies = [];
let stars = [];
let score = 0;
let lives = 3;
let lastEnemyTime = 0;
let lastShotTime = 0;
let shootCooldown = 0.12;
let gameState = 'menu'; // 'menu' | 'playing' | 'gameover'
let keys = { left: false, right: false, shoot: false };
let clock;
let bulletGeometry, bulletMaterial;
let enemyGeometry, enemyMaterial;

// ─── DOM ────────────────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');
const startBtn = document.getElementById('start-btn');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');

// ─── Init Three.js (2D orthographic) ─────────────────────────────────────────
function init() {
  const container = document.getElementById('game-container');
  const aspect = window.innerWidth / window.innerHeight;
  let width = VIEW_WIDTH;
  let height = VIEW_HEIGHT;
  if (aspect > width / height) width = height * aspect;
  else height = width / aspect;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050510);

  camera = new THREE.OrthographicCamera(
    -width / 2, width / 2,
    height / 2, -height / 2,
    -100, 100
  );
  camera.position.z = 50;
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.insertBefore(renderer.domElement, container.firstChild);

  clock = new THREE.Clock();

  createStars();
  createPlayer();
  createSharedGeometries();

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  startBtn.addEventListener('click', startGame);

  overlay.classList.add('visible');
}

function createStars() {
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * VIEW_WIDTH * 1.5;
    positions[i * 3 + 1] = (Math.random() - 0.5) * VIEW_HEIGHT * 1.5;
    positions[i * 3 + 2] = -10 - Math.random() * 5;
    sizes[i] = 0.03 + Math.random() * 0.08;
  }
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const m = new THREE.PointsMaterial({
    color: 0x88aacc,
    size: 0.15,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(g, m);
  scene.add(points);
  stars.push(points);
}

function createPlayer() {
  const shape = new THREE.Shape();
  const s = PLAYER_HALF;
  shape.moveTo(0, s);
  shape.lineTo(-s * 1.2, -s);
  shape.lineTo(0, -s * 0.3);
  shape.lineTo(s * 1.2, -s);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  const m = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    side: THREE.DoubleSide,
  });
  playerMesh = new THREE.Mesh(g, m);
  playerMesh.position.set(0, -VIEW_HEIGHT / 2 + 3, 0);
  playerMesh.rotation.z = 0;
  scene.add(playerMesh);
}

function createSharedGeometries() {
  bulletGeometry = new THREE.CircleGeometry(BULLET_RADIUS, 8);
  bulletMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
  const enemyShape = new THREE.Shape();
  const r = ENEMY_RADIUS;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 4;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) enemyShape.moveTo(x, y);
    else enemyShape.lineTo(x, y);
  }
  enemyShape.closePath();
  enemyGeometry = new THREE.ShapeGeometry(enemyShape);
  enemyMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4466,
    side: THREE.DoubleSide,
  });
}

function spawnBullet() {
  const mesh = new THREE.Mesh(bulletGeometry, bulletMaterial.clone());
  mesh.position.copy(playerMesh.position);
  mesh.position.y += PLAYER_HALF;
  mesh.userData = { vy: BULLET_SPEED };
  scene.add(mesh);
  bullets.push(mesh);
}

function spawnEnemy() {
  const mesh = new THREE.Mesh(enemyGeometry, enemyMaterial.clone());
  mesh.position.set(
    (Math.random() - 0.5) * VIEW_WIDTH * 0.8,
    VIEW_HEIGHT / 2 + 1,
    0
  );
  mesh.userData = { vy: -ENEMY_SPEED };
  scene.add(mesh);
  enemies.push(mesh);
}

function updatePlaying(dt) {
  // Player movement
  if (keys.left) playerVel = -PLAYER_SPEED;
  else if (keys.right) playerVel = PLAYER_SPEED;
  else playerVel *= 0.6;
  playerMesh.position.x += playerVel * dt;
  playerMesh.position.x = THREE.MathUtils.clamp(
    playerMesh.position.x,
    -VIEW_WIDTH / 2 + PLAYER_HALF,
    VIEW_WIDTH / 2 - PLAYER_HALF
  );

  // Shooting
  if (keys.shoot && clock.getElapsedTime() - lastShotTime >= shootCooldown) {
    lastShotTime = clock.getElapsedTime();
    spawnBullet();
  }

  // Enemies
  if (clock.getElapsedTime() - lastEnemyTime >= ENEMY_SPAWN_INTERVAL) {
    lastEnemyTime = clock.getElapsedTime();
    spawnEnemy();
  }

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.position.y += b.userData.vy * dt;
    if (b.position.y > VIEW_HEIGHT / 2 + 2) {
      scene.remove(b);
      bullets.splice(i, 1);
    }
  }

  // Update enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.position.y += e.userData.vy * dt;
    if (e.position.y < -VIEW_HEIGHT / 2 - 2) {
      scene.remove(e);
      enemies.splice(i, 1);
    }
  }

  // Collisions: bullet vs enemy
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dx = b.position.x - e.position.x;
      const dy = b.position.y - e.position.y;
      if (dx * dx + dy * dy < (BULLET_RADIUS + ENEMY_RADIUS) ** 2) {
        scene.remove(b);
        scene.remove(e);
        bullets.splice(i, 1);
        enemies.splice(j, 1);
        score += 100;
        scoreEl.textContent = `SCORE: ${score}`;
        break;
      }
    }
  }

  // Collisions: player vs enemy
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const dx = playerMesh.position.x - e.position.x;
    const dy = playerMesh.position.y - e.position.y;
    if (dx * dx + dy * dy < (PLAYER_HALF + ENEMY_RADIUS) ** 2) {
      scene.remove(e);
      enemies.splice(i, 1);
      lives--;
      livesEl.textContent = `LIVES: ${lives}`;
      if (lives <= 0) {
        gameOver();
      }
    }
  }

  // Parallax stars (scroll down during play)
  if (stars.length && stars[0].geometry.attributes.position) {
    const pos = stars[0].geometry.attributes.position.array;
    for (let i = 0; i < STAR_COUNT; i++) {
      pos[i * 3 + 1] -= 2 * dt;
      if (pos[i * 3 + 1] < -VIEW_HEIGHT / 2 - 2)
        pos[i * 3 + 1] += VIEW_HEIGHT + 4;
    }
    stars[0].geometry.attributes.position.needsUpdate = true;
  }
}

function gameOver() {
  gameState = 'gameover';
  overlayMessage.textContent = `GAME OVER · Final score: ${score}`;
  startBtn.textContent = 'PLAY AGAIN';
  overlay.classList.add('visible');
  startBtn.focus();
}

function startGame() {
  overlay.classList.remove('visible');
  gameState = 'playing';
  score = 0;
  lives = 3;
  scoreEl.textContent = 'SCORE: 0';
  livesEl.textContent = 'LIVES: 3';
  playerMesh.position.set(0, -VIEW_HEIGHT / 2 + 3, 0);
  playerVel = 0;
  bullets.forEach(b => scene.remove(b));
  bullets = [];
  enemies.forEach(e => scene.remove(e));
  enemies = [];
  lastEnemyTime = clock.getElapsedTime();
  lastShotTime = 0;
}

function onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  let width = VIEW_WIDTH;
  let height = VIEW_HEIGHT;
  if (aspect > width / height) width = height * aspect;
  else height = width / aspect;
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(e) {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if (e.code === 'Space') {
    e.preventDefault();
    keys.shoot = true;
  }
}

function onKeyUp(e) {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  if (e.code === 'Space') keys.shoot = false;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (gameState === 'playing') updatePlaying(dt);
  renderer.render(scene, camera);
}

// Run
init();
animate();
