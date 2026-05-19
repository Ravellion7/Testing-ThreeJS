const fs = require('fs/promises');
const path = require('path');
const http = require('http'); // REST Web Service requirement (Requirement 7)
const WebSocket = require('ws');
const THREE = require('three');

const PORT = process.env.PORT || 8080;
const TICK_RATE = 20;
const MAX_PLAYERS = 2;
const MAX_KOTH_PLAYERS = 4;

const FLOOR_Y = -0.12;
const PLAYER_BASE_HEALTH = 100;
const PLAYER_BASE_SHIELD = 100;

const RIFLE_DAMAGE = 34;
const MAX_RIFLE_RANGE = 90;
const HIT_CONE_DOT = Math.cos((20 * Math.PI) / 180);
const MIN_SHOT_INTERVAL_MS = 90;

let ENEMY_DAMAGE = 8;
let ENEMY_MOVE_SPEED = 2.1;
const ENEMY_ATTACK_RANGE = 18;
const ENEMY_ATTACK_INTERVAL = 0.6;
const SPEED_BOOST_DURATION = 60;

const WAVE_INITIAL_DELAY = 15;
const WAVE_INTERMISSION_DELAY = 10;
const WAVE_BASE_ENEMIES = 3;
const WAVE_INCREMENT = 3;
const WAVE_MAX_CONCURRENT = 3;
const ENEMY_MAX_HEALTH = 100;

const ENEMY_SPAWN_POINTS = [
  { x: 10, y: FLOOR_Y, z: -4 },
  { x: -25, y: FLOOR_Y, z: -18 },
  { x: 18, y: FLOOR_Y, z: 12 },
  { x: -18, y: FLOOR_Y, z: 14 },
  { x: 2, y: FLOOR_Y, z: -22 },
  { x: -4, y: FLOOR_Y, z: 22 },
  { x: 22, y: FLOOR_Y, z: -10 },
  { x: -22, y: FLOOR_Y, z: 6 },
];

const WEAPON_PICKUPS = [
  { id: 'w_ak', x: -6, y: FLOOR_Y + 1.0, z: -8, kind: 'ak', respawnSeconds: 25 },
  { id: 'w_glock', x: 8, y: FLOOR_Y + 1.0, z: 2, kind: 'none', respawnSeconds: 20 },
  { id: 'w_m4', x: 0, y: FLOOR_Y + 1.0, z: -12, kind: 'm4', respawnSeconds: 25 },
];

const UTILITY_PICKUPS = [
  { id: 'u_medkit', x: -10, y: FLOOR_Y + 1.0, z: 10, type: 'medkit', respawnSeconds: 30 },
  { id: 'u_shield', x: 11, y: FLOOR_Y + 1.0, z: -6, type: 'shield', respawnSeconds: 30 },
  { id: 'u_thunder', x: 3, y: FLOOR_Y + 1.0, z: 15, type: 'thunder', respawnSeconds: 30 },
];

// Combined HTTP REST Web Service (Requirement 7)
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // GET /api/leaderboard endpoint
  if (req.url === '/api/leaderboard' && req.method === 'GET') {
    try {
      const data = await loadLeaderboard();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read scores' }));
    }
    return;
  }

  // POST /api/leaderboard endpoint
  if (req.url === '/api/leaderboard' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const scoreEntry = JSON.parse(body);
        const name = (scoreEntry.name && typeof scoreEntry.name === 'string') ? scoreEntry.name.trim() : 'Player';
        const score = Math.max(0, parseInt(scoreEntry.score) || 0);
        const mode = (scoreEntry.mode && typeof scoreEntry.mode === 'string') ? scoreEntry.mode.trim() : 'Arena';
        
        const today = new Date();
        const dateStr = String(today.getMonth() + 1).padStart(2, '0') + '/' + String(today.getDate()).padStart(2, '0');

        const currentScores = await loadLeaderboard();
        currentScores.push({ name, score, mode, date: dateStr });
        currentScores.sort((a, b) => b.score - a.score);
        const topScores = currentScores.slice(0, 50);
        await saveLeaderboard(topScores);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(topScores));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save score' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocket.Server({ server });
const players = new Map();
// Hill zone positions spread around the map (x, z)
const KOTH_HILL_POSITIONS = [
  { x:  0,   z: -5  },   // centre
  { x: -14,  z: -10 },   // left flank
  { x:  14,  z: -10 },   // right flank
  { x:   0,  z:  14 },   // back-field
  { x: -10,  z:   8 },   // left back
  { x:  10,  z:   8 },   // right back
];
const KOTH_HILL_RADIUS = 3.0;

// ── King of the Hill room (separate from Arena, up to 4 players, PvP) ────
const kothPlayers = new Map();
const kothState = {
  captureProgress: 0,   // 0-100
  capturingPlayerId: null,
  hillPositionIndex: 0,
  get hillX() { return KOTH_HILL_POSITIONS[this.hillPositionIndex].x; },
  get hillZ() { return KOTH_HILL_POSITIONS[this.hillPositionIndex].z; },
  hillRadius: KOTH_HILL_RADIUS,
  weaponPickups: WEAPON_PICKUPS.map((e) => ({ ...e, active: true, respawnRemaining: 0 })),
  utilityPickups: UTILITY_PICKUPS.map((e) => ({ ...e, active: true, respawnRemaining: 0 })),
};

function relocateKothHill() {
  const current = kothState.hillPositionIndex;
  let next = current;
  // Pick a different index at random
  while (next === current) {
    next = Math.floor(Math.random() * KOTH_HILL_POSITIONS.length);
  }
  kothState.hillPositionIndex = next;
  kothState.captureProgress = 0;
  kothState.capturingPlayerId = null;
  broadcastKothJson({
    type: 'koth_hill_moved',
    hillX: kothState.hillX,
    hillZ: kothState.hillZ,
    hillRadius: kothState.hillRadius,
  });
}

const colliderTempA = new THREE.Vector3();
const colliderTempB = new THREE.Vector3();
const arenaColliderState = {
  boxes: [],
  loading: null,
};

const worldState = {
  nextEnemyId: 1,
  waveSpawnCursor: 0,
  enemies: [],
  wave: {
    current: 0,
    targetKills: 0,
    kills: 0,
    spawned: 0,
    pendingStart: true,
    delayRemaining: WAVE_INITIAL_DELAY,
  },
  weaponPickups: WEAPON_PICKUPS.map((entry) => ({
    ...entry,
    active: true,
    respawnRemaining: 0,
  })),
  utilityPickups: UTILITY_PICKUPS.map((entry) => ({
    ...entry,
    active: true,
    respawnRemaining: 0,
  })),
};

const leaderboardFilePath = path.join(__dirname, 'leaderboard.json');

async function loadLeaderboard() {
  try {
    const content = await fs.readFile(leaderboardFilePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return [
      { name: "DragonSlayer", mode: "Arena", score: 15420, date: "05/01" },
      { name: "ShadowHunter", mode: "Arena", score: 14850, date: "05/02" },
      { name: "IronWarrior", mode: "Arena", score: 13990, date: "05/02" },
      { name: "StormBringer", mode: "Arena", score: 13200, date: "05/03" },
      { name: "NightRaven", mode: "Arena", score: 12750, date: "05/04" }
    ];
  }
}

async function saveLeaderboard(data) {
  try {
    await fs.writeFile(leaderboardFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save leaderboard', e);
  }
}

function createDefaultPlayerState(id) {
  const startX = id === 'p1' ? -2 : 2;
  return {
    id,
    x: startX,
    y: FLOOR_Y,
    z: 0,
    rotY: 0,
    health: PLAYER_BASE_HEALTH,
    shield: PLAYER_BASE_SHIELD,
    lastShotAt: 0,
    moveSpeed: 0,
    aiming: false,
    firing: false,
    reloading: false,
    weaponKind: 'none',
    actionName: '',
    speedBoostRemaining: 0,
    connected: true,
  };
}

function getFreePlayerId() {
  if (![...players.values()].find((p) => p.id === 'p1')) return 'p1';
  if (![...players.values()].find((p) => p.id === 'p2')) return 'p2';
  return null;
}

function getFreeKothPlayerId() {
  const taken = new Set([...kothPlayers.values()].map((p) => p.id));
  for (let i = 1; i <= MAX_KOTH_PLAYERS; i++) {
    const id = 'kp' + i;
    if (!taken.has(id)) return id;
  }
  return null;
}

function broadcastKothJson(payload) {
  const data = JSON.stringify(payload);
  kothPlayers.forEach((_player, socket) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  });
}

function sendKothState() {
  const playersSnap = [...kothPlayers.values()].map((p) => ({
    id: p.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY,
    health: p.health, shield: p.shield,
    moveSpeed: p.moveSpeed, aiming: p.aiming, firing: p.firing,
    reloading: p.reloading, weaponKind: p.weaponKind, actionName: p.actionName,
    speedBoostRemaining: p.speedBoostRemaining, nickname: p.nickname,
    score: p.score,
  }));
  broadcastKothJson({
    type: 'koth_state',
    players: playersSnap,
    captureProgress: kothState.captureProgress,
    capturingPlayerId: kothState.capturingPlayerId,
    hillX: kothState.hillX,
    hillZ: kothState.hillZ,
    hillRadius: kothState.hillRadius,
    weaponPickups: kothState.weaponPickups.map((e) => ({ id: e.id, active: e.active })),
    utilityPickups: kothState.utilityPickups.map((e) => ({ id: e.id, active: e.active })),
  });
}

function sendJson(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcastJson(payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

function activePlayers() {
  return [...players.values()].map((entry) => ({ ...entry }));
}

function livingPlayers() {
  return [...players.values()].filter((entry) => entry.health > 0);
}

function resetArenaState() {
  worldState.nextEnemyId = 1;
  worldState.waveSpawnCursor = 0;
  worldState.enemies = [];
  worldState.wave.current = 0;
  worldState.wave.targetKills = 0;
  worldState.wave.kills = 0;
  worldState.wave.spawned = 0;
  worldState.wave.pendingStart = true;
  worldState.wave.delayRemaining = WAVE_INITIAL_DELAY;

  worldState.weaponPickups.forEach((entry) => {
    entry.active = true;
    entry.respawnRemaining = 0;
  });

  worldState.utilityPickups.forEach((entry) => {
    entry.active = true;
    entry.respawnRemaining = 0;
  });
}

function shouldUseAsMapCollider(mesh) {
  if (!mesh || !mesh.isMesh || !mesh.geometry) {
    return false;
  }

  const meshName = String(mesh.name || '').toLowerCase();
  const includeNameHints = [
    'collider', 'wall', 'building', 'house', 'tower', 'block', 'obstacle',
    'barrier', 'fence', 'gate', 'garage', 'hangar', 'container', 'pillar',
  ];
  const excludeNameHints = [
    'ground', 'floor', 'road', 'street', 'sidewalk', 'terrain', 'grass',
    'decal', 'water', 'cloud', 'light', 'lamp', 'particle', 'fx',
    'plane', 'helper', 'fountain', 'pool', 'basin', 'pond',
  ];

  if (excludeNameHints.some((hint) => meshName.includes(hint))) {
    return false;
  }

  if (includeNameHints.some((hint) => meshName.includes(hint))) {
    return true;
  }

  if (!mesh.geometry.boundingBox) {
    mesh.geometry.computeBoundingBox();
  }

  const bounds = mesh.geometry.boundingBox;
  if (!bounds) {
    return false;
  }

  colliderTempA.subVectors(bounds.max, bounds.min);
  const localWidth = Math.abs(colliderTempA.x);
  const localHeight = Math.abs(colliderTempA.y);
  const localDepth = Math.abs(colliderTempA.z);

  mesh.getWorldScale(colliderTempB);
  const worldWidth = localWidth * Math.abs(colliderTempB.x);
  const worldHeight = localHeight * Math.abs(colliderTempB.y);
  const worldDepth = localDepth * Math.abs(colliderTempB.z);

  const maxHorizontalSize = Math.max(worldWidth, worldDepth);
  const minHorizontalSize = Math.min(worldWidth, worldDepth);

  if (worldHeight < 0.45) {
    return false;
  }

  if (maxHorizontalSize < 0.45 && worldHeight < 1.1) {
    return false;
  }

  if (worldHeight >= 1.2 && minHorizontalSize >= 0.2) {
    return true;
  }

  if (maxHorizontalSize >= 2.2 && worldHeight >= 0.35) {
    return true;
  }

  return false;
}

async function loadArenaColliders() {
  if (arenaColliderState.loading) {
    return arenaColliderState.loading;
  }

  arenaColliderState.loading = (async () => {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      loader.register((parser) => ({
        name: 'SkipTexturesForColliderScan',
        beforeRoot: async () => {
          parser.loadTexture = async () => new THREE.Texture();
        },
      }));
      const mapPath = path.join(__dirname, '..', 'Maps', 'arena_city.glb');
      const buffer = await fs.readFile(mapPath);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

      const gltf = await new Promise((resolve, reject) => {
        loader.parse(arrayBuffer, '', resolve, reject);
      });

      const boxes = [];
      gltf.scene.traverse((child) => {
        if (!shouldUseAsMapCollider(child)) {
          return;
        }

        const box = new THREE.Box3().setFromObject(child);
        if (!box.isEmpty()) {
          boxes.push(box);
        }
      });

      arenaColliderState.boxes = boxes;
    } catch (error) {
      arenaColliderState.boxes = [];
      console.warn('Arena colliders could not be loaded; enemy shots will use fallback behavior.', error);
    } finally {
      arenaColliderState.loading = null;
    }
  })();

  return arenaColliderState.loading;
}

function getNearestShotBlocker(startPoint, direction, maxDistance) {
  if (arenaColliderState.boxes.length === 0) {
    return null;
  }

  const ray = new THREE.Ray(startPoint, direction);
  const hitPoint = new THREE.Vector3();
  let nearestPoint = null;
  let nearestDistance = maxDistance;

  arenaColliderState.boxes.forEach((box) => {
    const intersection = ray.intersectBox(box, hitPoint);
    if (!intersection) {
      return;
    }

    const distance = startPoint.distanceTo(hitPoint);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPoint = hitPoint.clone();
    }
  });

  return nearestPoint;
}

function applyDamageToPlayer(player, amount) {
  let pending = Math.max(0, Number(amount) || 0);
  if (!player || pending <= 0) return;

  const shieldHit = Math.min(player.shield, pending);
  player.shield -= shieldHit;
  pending -= shieldHit;
  if (pending > 0) {
    player.health = Math.max(0, player.health - pending);
  }
}

function applyDamageToEnemy(enemy, amount) {
  if (!enemy || enemy.isDead) return false;
  enemy.health = Math.max(0, enemy.health - Math.max(0, amount));
  if (enemy.health > 0) return false;
  enemy.isDead = true;
  enemy.state = 'dead';
  worldState.wave.kills = Math.min(worldState.wave.targetKills, worldState.wave.kills + 1);
  return true;
}

function updatePickupRespawns(list, dtSeconds) {
  list.forEach((entry) => {
    if (entry.active) return;
    entry.respawnRemaining = Math.max(0, entry.respawnRemaining - dtSeconds);
    if (entry.respawnRemaining <= 0) {
      entry.active = true;
      entry.respawnRemaining = 0;
    }
  });
}

function getWaveTargetKills(waveNumber) {
  return Math.max(0, WAVE_BASE_ENEMIES + ((waveNumber - 1) * WAVE_INCREMENT));
}

function getAliveEnemies() {
  return worldState.enemies.filter((enemy) => !enemy.isDead);
}

function spawnEnemy() {
  const spawnIndex = worldState.waveSpawnCursor % ENEMY_SPAWN_POINTS.length;
  const spawnPoint = ENEMY_SPAWN_POINTS[spawnIndex];
  worldState.waveSpawnCursor += 1;

  worldState.enemies.push({
    id: `e_${worldState.nextEnemyId++}`,
    x: spawnPoint.x,
    y: spawnPoint.y,
    z: spawnPoint.z,
    rotY: 0,
    health: ENEMY_MAX_HEALTH,
    isDead: false,
    state: 'walk',
    shotCooldown: 0,
  });

  worldState.wave.spawned += 1;
}

function updateWave(dtSeconds) {
  if (players.size < MAX_PLAYERS) {
    return;
  }

  const wave = worldState.wave;
  if (wave.pendingStart) {
    wave.delayRemaining = Math.max(0, wave.delayRemaining - dtSeconds);
    if (wave.delayRemaining <= 0) {
      wave.pendingStart = false;
      wave.current += 1;
      wave.targetKills = getWaveTargetKills(wave.current);
      wave.kills = 0;
      wave.spawned = 0;
      worldState.waveSpawnCursor = 0;
      worldState.enemies = [];
    }
    return;
  }

  const aliveCount = getAliveEnemies().length;
  const canSpawn = wave.spawned < wave.targetKills;
  const availableSlots = Math.max(0, WAVE_MAX_CONCURRENT - aliveCount);
  const spawnCount = Math.min(availableSlots, Math.max(0, wave.targetKills - wave.spawned));
  if (canSpawn && spawnCount > 0) {
    for (let i = 0; i < spawnCount; i += 1) {
      spawnEnemy();
    }
  }

  const completed = wave.kills >= wave.targetKills && wave.spawned >= wave.targetKills && getAliveEnemies().length === 0;
  if (completed) {
    wave.pendingStart = true;
    wave.delayRemaining = WAVE_INTERMISSION_DELAY;
  }
}

function updateEnemies(dtSeconds) {
  if (players.size < MAX_PLAYERS) {
    return;
  }

  const targets = livingPlayers();
  worldState.enemies.forEach((enemy) => {
    if (enemy.isDead) return;

    enemy.shotCooldown = Math.max(0, enemy.shotCooldown - dtSeconds);
    if (targets.length === 0) {
      enemy.state = 'idle';
      return;
    }

    let nearestPlayer = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    targets.forEach((player) => {
      const dx = player.x - enemy.x;
      const dz = player.z - enemy.z;
      const dist = Math.hypot(dx, dz);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestPlayer = player;
      }
    });

    if (!nearestPlayer || !Number.isFinite(nearestDistance)) {
      enemy.state = 'idle';
      return;
    }

    const toTargetX = nearestPlayer.x - enemy.x;
    const toTargetZ = nearestPlayer.z - enemy.z;
    if (nearestDistance > 0.0001) {
      const dirX = toTargetX / nearestDistance;
      const dirZ = toTargetZ / nearestDistance;
      enemy.rotY = Math.atan2(dirX, dirZ);

      if (nearestDistance > ENEMY_ATTACK_RANGE * 0.8) {
        const step = Math.min(nearestDistance, ENEMY_MOVE_SPEED * dtSeconds);
        enemy.x += dirX * step;
        enemy.z += dirZ * step;
        enemy.state = 'walk';
      } else {
        enemy.state = 'shoot';
      }
    }

    if (nearestDistance <= ENEMY_ATTACK_RANGE && enemy.shotCooldown <= 0) {
      const shotOrigin = new THREE.Vector3(enemy.x, enemy.y + 1.35, enemy.z);
      const targetPoint = new THREE.Vector3(nearestPlayer.x, nearestPlayer.y + 1.1, nearestPlayer.z);
      const shotVector = new THREE.Vector3().subVectors(targetPoint, shotOrigin);
      const shotRange = shotVector.length();
      const blockingPoint = shotRange > 0.0001
        ? getNearestShotBlocker(shotOrigin, shotVector.clone().normalize(), shotRange)
        : null;

      if (!blockingPoint || shotOrigin.distanceTo(blockingPoint) >= shotRange - 0.05) {
        applyDamageToPlayer(nearestPlayer, ENEMY_DAMAGE);
      }
      enemy.shotCooldown = ENEMY_ATTACK_INTERVAL;
      enemy.state = 'shoot';
    }
  });
}

function tryCollectPickup(player, message) {
  if (!player || typeof message.id !== 'string' || typeof message.category !== 'string') return;
  const category = message.category;
  const list = category === 'weapon' ? worldState.weaponPickups : worldState.utilityPickups;
  if (!list) return;

  const entry = list.find((pickup) => pickup.id === message.id);
  if (!entry || !entry.active) return;

  const distance = Math.hypot(player.x - entry.x, player.z - entry.z);
  if (distance > 2.5) return;

  entry.active = false;
  entry.respawnRemaining = Math.max(3, Number(entry.respawnSeconds) || 20);

  if (category === 'weapon' && entry.kind) {
    player.weaponKind = entry.kind;
  }

  if (category === 'utility') {
    if (entry.type === 'medkit') {
      player.health = Math.min(125, player.health + 25);
    }
    if (entry.type === 'shield') {
      player.shield = Math.min(125, player.shield + 25);
    }
    if (entry.type === 'thunder') {
      player.speedBoostRemaining = Math.max(player.speedBoostRemaining, SPEED_BOOST_DURATION);
    }
  }
}

function handleRifleShot(player, message) {
  if (!player || player.health <= 0) return;

  const now = Date.now();
  if ((now - player.lastShotAt) < MIN_SHOT_INTERVAL_MS) return;
  player.lastShotAt = now;

  const dirXRaw = Number(message.dirX);
  const dirZRaw = Number(message.dirZ);
  let dirX = Math.sin(player.rotY);
  let dirZ = Math.cos(player.rotY);
  if (Number.isFinite(dirXRaw) && Number.isFinite(dirZRaw)) {
    const len = Math.hypot(dirXRaw, dirZRaw);
    if (len > 0.0001) {
      dirX = dirXRaw / len;
      dirZ = dirZRaw / len;
    }
  }

  let selectedEnemy = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  getAliveEnemies().forEach((enemy) => {
    const toEnemyX = enemy.x - player.x;
    const toEnemyZ = enemy.z - player.z;
    const dist = Math.hypot(toEnemyX, toEnemyZ);
    if (dist <= 0.0001 || dist > MAX_RIFLE_RANGE) return;

    const towardX = toEnemyX / dist;
    const towardZ = toEnemyZ / dist;
    const dot = (dirX * towardX) + (dirZ * towardZ);
    if (dot < HIT_CONE_DOT) return;

    if (dist < selectedDistance) {
      selectedDistance = dist;
      selectedEnemy = enemy;
    }
  });

  // Also check if we hit other players (Requirement 11 & Free-for-All mode)
  let targetPlayer = null;
  let targetDistance = Number.POSITIVE_INFINITY;
  
  players.forEach((otherPlayer) => {
    if (otherPlayer.id === player.id || otherPlayer.health <= 0) return;
    
    const toPlayerX = otherPlayer.x - player.x;
    const toPlayerZ = otherPlayer.z - player.z;
    const dist = Math.hypot(toPlayerX, toPlayerZ);
    if (dist <= 0.0001 || dist > MAX_RIFLE_RANGE) return;
    
    const towardX = toPlayerX / dist;
    const towardZ = toPlayerZ / dist;
    const dot = (dirX * towardX) + (dirZ * towardZ);
    if (dot < HIT_CONE_DOT) return;
    
    if (dist < targetDistance) {
      targetDistance = dist;
      targetPlayer = otherPlayer;
    }
  });

  // If we hit a player, resolve player-to-player damage!
  if (targetPlayer && targetDistance < selectedDistance) {
    let dmg = RIFLE_DAMAGE;
    const shieldDmg = Math.min(targetPlayer.shield, dmg);
    targetPlayer.shield -= shieldDmg;
    dmg -= shieldDmg;
    if (dmg > 0) targetPlayer.health = Math.max(0, targetPlayer.health - dmg);

    // Send shot result to everyone to render tracers/announce hit
    broadcastJson({
      type: 'rifle_shot_result',
      shooterId: player.id,
      targetId: targetPlayer.id,
      targetHealth: targetPlayer.health,
      targetShield: targetPlayer.shield,
      damage: RIFLE_DAMAGE,
    });

    if (targetPlayer.health <= 0) {
      broadcastJson({
        type: 'player_eliminated',
        playerId: targetPlayer.id,
        killerId: player.id,
      });
    }
    return;
  }

  if (selectedEnemy) {
    applyDamageToEnemy(selectedEnemy, RIFLE_DAMAGE);
  }
}

function buildArenaSnapshot() {
  return {
    type: 'arena_state_snapshot',
    players: activePlayers(),
    enemies: worldState.enemies.map((enemy) => ({
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
      z: enemy.z,
      rotY: enemy.rotY,
      health: enemy.health,
      isDead: enemy.isDead,
      state: enemy.state,
    })),
    wave: {
      current: worldState.wave.current,
      targetKills: worldState.wave.targetKills,
      kills: worldState.wave.kills,
      spawned: worldState.wave.spawned,
      pendingStart: worldState.wave.pendingStart,
      delayRemaining: worldState.wave.delayRemaining,
    },
    weaponPickups: worldState.weaponPickups.map((entry) => ({
      id: entry.id,
      active: entry.active,
    })),
    utilityPickups: worldState.utilityPickups.map((entry) => ({
      id: entry.id,
      active: entry.active,
    })),
  };
}

wss.on('connection', (socket) => {
  socket.isAlive = true;

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;

    if (message.type === 'get_leaderboard') {
      loadLeaderboard().then((data) => {
        sendJson(socket, { type: 'leaderboard_data', data: data });
      }).catch(() => {
        sendJson(socket, { type: 'leaderboard_data', data: [] });
      });
      return;
    }

    if (message.type === 'submit_score') {
      const name = (message.name && typeof message.name === 'string') ? message.name.trim() : 'Player';
      const score = Math.max(0, parseInt(message.score) || 0);
      const mode = (message.mode && typeof message.mode === 'string') ? message.mode.trim() : 'Arena';
      const today = new Date();
      const dateStr = String(today.getMonth() + 1).padStart(2, '0') + '/' + String(today.getDate()).padStart(2, '0');

      loadLeaderboard().then((data) => {
        data.push({ name: name, score: score, mode: mode, date: dateStr });
        data.sort((a, b) => b.score - a.score);
        const topScores = data.slice(0, 50);
        saveLeaderboard(topScores).catch(() => {});
      });
      return;
    }

    // ── King of the Hill join ─────────────────────────────────────
    if (message.type === 'join_koth') {
      if (kothPlayers.size >= MAX_KOTH_PLAYERS) {
        sendJson(socket, { type: 'koth_room_full', message: 'KOTH room is full (4/4 players).' });
        return;
      }
      const kid = getFreeKothPlayerId();
      if (!kid) {
        sendJson(socket, { type: 'koth_room_full', message: 'KOTH room is full.' });
        return;
      }
      socket.kothPlayerId = kid;
      socket.isKothPlayer = true;
      const spawnOffsets = [[-3,0,0],[3,0,0],[0,0,-3],[0,0,3]];
      const spawnIdx = parseInt(kid.replace('kp','')) - 1;
      const [sx,,sz] = spawnOffsets[spawnIdx] || [0,0,0];
      const kp = {
        id: kid, nickname: (message.nickname?.trim()) || ('Player ' + kid.replace(/\D/g,'')),
        x: sx, y: FLOOR_Y, z: sz, rotY: 0,
        health: PLAYER_BASE_HEALTH, shield: PLAYER_BASE_SHIELD,
        lastShotAt: 0, moveSpeed: 0, aiming: false, firing: false,
        reloading: false, weaponKind: 'none', actionName: '',
        speedBoostRemaining: 0, score: 0,
      };
      kothPlayers.set(socket, kp);
      sendJson(socket, {
        type: 'koth_assigned',
        playerId: kid,
        health: PLAYER_BASE_HEALTH,
        shield: PLAYER_BASE_SHIELD,
        map: message.map || 'city',
      });
      broadcastKothJson({ type: 'koth_player_joined', playerId: kid, nickname: kp.nickname });
      sendKothState();
      return;
    }

    // ── KOTH pose update ─────────────────────────────────────────
    if (message.type === 'koth_update_pose') {
      const kp = kothPlayers.get(socket);
      if (!kp) return;
      if (typeof message.x === 'number') kp.x = message.x;
      if (typeof message.y === 'number') kp.y = message.y;
      if (typeof message.z === 'number') kp.z = message.z;
      if (typeof message.rotY === 'number') kp.rotY = message.rotY;
      if (typeof message.moveSpeed === 'number') kp.moveSpeed = Math.max(0, message.moveSpeed);
      if (typeof message.aiming === 'boolean') kp.aiming = message.aiming;
      if (typeof message.firing === 'boolean') kp.firing = message.firing;
      if (typeof message.reloading === 'boolean') kp.reloading = message.reloading;
      if (typeof message.weaponKind === 'string') kp.weaponKind = message.weaponKind;
      if (typeof message.actionName === 'string') kp.actionName = message.actionName;
      // Capture zone tracking (server-authoritative progress)
      const hillX = kothState.hillX, hillZ = kothState.hillZ, hillRadius = kothState.hillRadius;
      const distToHill = Math.hypot(kp.x - hillX, kp.z - hillZ);
      const inHill = distToHill < hillRadius;
      // Find if any OTHER koth player is also in the hill (contested)
      const othersInHill = [...kothPlayers.values()].filter((other) => {
        if (other.id === kp.id) return false;
        return Math.hypot(other.x - hillX, other.z - hillZ) < hillRadius;
      });
      if (inHill && othersInHill.length === 0) {
        // Award points and advance capture while sole holder
        kp.score += 5;
        kothState.capturingPlayerId = kp.id;
        kothState.captureProgress = Math.min(100, kothState.captureProgress + 0.25);
        // When fully captured, relocate hill to a new random position
        if (kothState.captureProgress >= 100) {
          relocateKothHill();
        }
      } else if (kothState.capturingPlayerId === kp.id && (!inHill || othersInHill.length > 0)) {
        kothState.capturingPlayerId = null;
      }
      return;
    }

    // ── KOTH rifle shot (PvP only) ────────────────────────────────
    if (message.type === 'koth_rifle_shot') {
      const shooter = kothPlayers.get(socket);
      if (!shooter || shooter.health <= 0) return;
      const now = Date.now();
      if (now - shooter.lastShotAt < MIN_SHOT_INTERVAL_MS) return;
      shooter.lastShotAt = now;
      const dirXRaw = Number(message.dirX), dirZRaw = Number(message.dirZ);
      let dirX = Math.sin(shooter.rotY), dirZ = Math.cos(shooter.rotY);
      if (Number.isFinite(dirXRaw) && Number.isFinite(dirZRaw)) {
        const len = Math.hypot(dirXRaw, dirZRaw);
        if (len > 0.0001) { dirX = dirXRaw / len; dirZ = dirZRaw / len; }
      }
      let bestTarget = null, bestDist = Number.POSITIVE_INFINITY;
      kothPlayers.forEach((other, _sock) => {
        if (other.id === shooter.id || other.health <= 0) return;
        const dx = other.x - shooter.x, dz = other.z - shooter.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= 0.0001 || dist > MAX_RIFLE_RANGE) return;
        const dot = (dirX * dx/dist) + (dirZ * dz/dist);
        if (dot < HIT_CONE_DOT) return;
        if (dist < bestDist) { bestDist = dist; bestTarget = other; }
      });
      if (bestTarget) {
        applyDamageToPlayer(bestTarget, RIFLE_DAMAGE);
        broadcastKothJson({
          type: 'koth_shot_result',
          shooterId: shooter.id,
          targetId: bestTarget.id,
          targetHealth: bestTarget.health,
          targetShield: bestTarget.shield,
        });
        if (bestTarget.health <= 0) {
          shooter.score += 50; // Kill bonus
          broadcastKothJson({ type: 'koth_player_eliminated', playerId: bestTarget.id, killerId: shooter.id });
          // Respawn dead player after 5 seconds with full health
          setTimeout(() => {
            if (bestTarget) { bestTarget.health = PLAYER_BASE_HEALTH; bestTarget.shield = PLAYER_BASE_SHIELD; }
          }, 5000);
        }
      }
      return;
    }

    // ── KOTH pickup collect ───────────────────────────────────────
    if (message.type === 'koth_pickup_collect') {
      const kp = kothPlayers.get(socket);
      if (!kp) return;
      const category = message.category;
      const list = category === 'weapon' ? kothState.weaponPickups : kothState.utilityPickups;
      if (!list) return;
      const entry = list.find((p) => p.id === message.id);
      if (!entry || !entry.active) return;
      if (Math.hypot(kp.x - entry.x, kp.z - entry.z) > 2.5) return;
      entry.active = false;
      entry.respawnRemaining = Math.max(3, Number(entry.respawnSeconds) || 20);
      if (category === 'weapon' && entry.kind) kp.weaponKind = entry.kind;
      if (category === 'utility') {
        if (entry.type === 'medkit') kp.health = Math.min(125, kp.health + 25);
        if (entry.type === 'shield') kp.shield = Math.min(125, kp.shield + 25);
        if (entry.type === 'thunder') kp.speedBoostRemaining = Math.max(kp.speedBoostRemaining, SPEED_BOOST_DURATION);
      }
      return;
    }

    // ── KOTH leave ────────────────────────────────────────────────
    if (message.type === 'leave_koth') {
      const kp = kothPlayers.get(socket);
      kothPlayers.delete(socket);
      socket.isKothPlayer = false;
      if (kp) broadcastKothJson({ type: 'koth_player_disconnected', playerId: kp.id, nickname: kp.nickname || kp.id });
      sendKothState();
      return;
    }

    // ── Arena join ────────────────────────────────────────────────
    if (message.type === 'join_arena') {
      if (players.size >= MAX_PLAYERS) {
        sendJson(socket, { type: 'room_full', message: 'Arena room already has 2 players.' });
        return;
      }

      const id = getFreePlayerId();
      if (!id) {
        sendJson(socket, { type: 'room_full', message: 'Arena room already has 2 players.' });
        return;
      }

      // Configure map and difficulty when the first player starts the match
      if (players.size === 0) {
        worldState.selectedMap = (message.map && typeof message.map === 'string') ? message.map : 'city';
        const diff = (message.difficulty && typeof message.difficulty === 'string') ? message.difficulty : 'medium';
        worldState.selectedDifficulty = diff;

        if (diff === 'easy') {
          ENEMY_DAMAGE = 4;
          ENEMY_MOVE_SPEED = 1.3;
        } else if (diff === 'hard') {
          ENEMY_DAMAGE = 12;
          ENEMY_MOVE_SPEED = 3.1;
        } else {
          ENEMY_DAMAGE = 8;
          ENEMY_MOVE_SPEED = 2.1;
        }
      }

      socket.playerId = id;
      const pState = createDefaultPlayerState(id);
      pState.nickname = (message.nickname && typeof message.nickname === 'string') ? message.nickname.trim() : '';
      if (!pState.nickname) {
        pState.nickname = 'Player ' + id.replace(/\D/g, '');
      }

      players.set(socket, pState);
      sendJson(socket, {
        type: 'assigned_player',
        playerId: id,
        health: PLAYER_BASE_HEALTH,
        shield: PLAYER_BASE_SHIELD,
        map: worldState.selectedMap || 'city',
        difficulty: worldState.selectedDifficulty || 'medium'
      });

      broadcastJson({
        type: 'player_joined_announcement',
        playerId: id,
        nickname: pState.nickname
      });

      if (players.size < MAX_PLAYERS) {
        resetArenaState();
        sendJson(socket, { type: 'waiting_for_player' });
      } else {
        broadcastJson({ type: 'match_started' });
      }

      sendJson(socket, buildArenaSnapshot());
      return;
    }

    if (message.type === 'leave_arena') {
      const leavingPlayer = players.get(socket);
      players.delete(socket);

      if (leavingPlayer) {
        broadcastJson({
          type: 'player_disconnected',
          playerId: leavingPlayer.id,
          nickname: leavingPlayer.nickname || ('Player ' + leavingPlayer.id.replace(/\D/g, ''))
        });
      }

      if (players.size < MAX_PLAYERS) {
        resetArenaState();
        broadcastJson(buildArenaSnapshot());
      }

      if (socket.readyState === WebSocket.OPEN) {
        sendJson(socket, { type: 'left_arena' });
      }
      return;
    }

    const player = players.get(socket);
    if (!player) return;

    if (message.type === 'update_pose') {
      if (typeof message.x === 'number') player.x = message.x;
      if (typeof message.y === 'number') player.y = message.y;
      if (typeof message.z === 'number') player.z = message.z;
      if (typeof message.rotY === 'number') player.rotY = message.rotY;
      if (typeof message.moveSpeed === 'number') player.moveSpeed = Math.max(0, message.moveSpeed);
      if (typeof message.aiming === 'boolean') player.aiming = message.aiming;
      if (typeof message.firing === 'boolean') player.firing = message.firing;
      if (typeof message.reloading === 'boolean') player.reloading = message.reloading;
      if (typeof message.weaponKind === 'string') player.weaponKind = message.weaponKind;
      if (typeof message.actionName === 'string') player.actionName = message.actionName;
      return;
    }

    if (message.type === 'rifle_shot') {
      handleRifleShot(player, message);
      return;
    }

    if (message.type === 'pickup_collect') {
      tryCollectPickup(player, message);
    }
  });

  socket.on('close', () => {
    // Handle KOTH disconnect
    const kp = kothPlayers.get(socket);
    if (kp) {
      kothPlayers.delete(socket);
      broadcastKothJson({ type: 'koth_player_disconnected', playerId: kp.id, nickname: kp.nickname || kp.id });
      sendKothState();
    }
    // Handle Arena disconnect
    const player = players.get(socket);
    players.delete(socket);
    if (player) {
      broadcastJson({
        type: 'player_disconnected',
        playerId: player.id,
        nickname: player.nickname || ('Player ' + player.id.replace(/\D/g, ''))
      });
    }
    if (players.size < MAX_PLAYERS) {
      resetArenaState();
      broadcastJson(buildArenaSnapshot());
    }
  });
});

loadArenaColliders();

setInterval(() => {
  const dtSeconds = 1 / TICK_RATE;

  // ── Arena tick ────────────────────────────────────────────────
  players.forEach((player) => {
    player.speedBoostRemaining = Math.max(0, (player.speedBoostRemaining || 0) - dtSeconds);
  });
  updatePickupRespawns(worldState.weaponPickups, dtSeconds);
  updatePickupRespawns(worldState.utilityPickups, dtSeconds);
  updateWave(dtSeconds);
  updateEnemies(dtSeconds);
  broadcastJson({ type: 'state_update', players: activePlayers() });
  broadcastJson(buildArenaSnapshot());

  // ── KOTH tick ────────────────────────────────────────────────
  if (kothPlayers.size > 0) {
    kothPlayers.forEach((kp) => {
      kp.speedBoostRemaining = Math.max(0, (kp.speedBoostRemaining || 0) - dtSeconds);
    });
    updatePickupRespawns(kothState.weaponPickups, dtSeconds);
    updatePickupRespawns(kothState.utilityPickups, dtSeconds);
    sendKothState();
  }
}, 1000 / TICK_RATE);

setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket.isAlive) {
      socket.terminate();
      return;
    }
    socket.isAlive = false;
    socket.ping();
  });
}, 10000);

server.listen(PORT, () => {
  console.log(`Multiplayer server and HTTP REST Web Service running on http://localhost:${PORT}`);
});
