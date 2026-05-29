import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export { THREE, EXRLoader };

// ── Renderer / Scene / Camera ─────────────────────────────────
const _container = document.querySelector('.game-canvas');
if (!_container) throw new Error('Three.js container ".game-canvas" was not found.');

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 30, 120);

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
export const audioListener = new THREE.AudioListener();
camera.add(audioListener);

export const positionalAudioLoader = new THREE.AudioLoader();
export const positionalAudioBuffers = new Map();
export const positionalAudioLoading = new Map();

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.classList.add('threejs-stage');
_container.prepend(renderer.domElement);

export const clock = new THREE.Clock();
export const loader = new GLTFLoader();

// ── Constants ─────────────────────────────────────────────────
export const FLOOR_Y_OFFSET = -0.12;
export const PLAYER_MODEL_Y_OFFSET = -0.06;

// ── Reusable temp objects (shared across modules for perf) ────
export const tempVectorA = new THREE.Vector3();
export const tempVectorB = new THREE.Vector3();
export const tempVectorC = new THREE.Vector3();
export const tempBox = new THREE.Box3();
export const upAxis = new THREE.Vector3(0, 1, 0);
export const downwardAxis = new THREE.Vector3(0, -1, 0);

export const groundRaycaster = new THREE.Raycaster();
export const cameraCollisionRaycaster = new THREE.Raycaster();
export const cameraCollisionTempA = new THREE.Vector3();
export const cameraCollisionTempB = new THREE.Vector3();
export const shotRaycaster = new THREE.Raycaster();
export const bulletBlockerRaycaster = new THREE.Raycaster();
export const enemySightRaycaster = new THREE.Raycaster();
export const enemyShotRaycaster = new THREE.Raycaster();

// ── Player scene objects ──────────────────────────────────────
export const playerRoot = new THREE.Group();
playerRoot.position.set(0, 0, 0);
scene.add(playerRoot);

export const playerCollider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.0, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xd9dee8, transparent: true, opacity: 0.12, roughness: 0.5, metalness: 0.1 }),
);
playerCollider.position.y = 0.9;
playerCollider.visible = false;
playerCollider.castShadow = true;
playerRoot.add(playerCollider);

// ── URL params ────────────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
export const selectedMap = urlParams.get('map') || 'city';
export const selectedDifficulty = urlParams.get('difficulty') || 'medium';
// 0 = infinite, otherwise stop after this wave number
export const maxWaves = parseInt(urlParams.get('maxWaves') || '0', 10);

// ── Config objects ────────────────────────────────────────────
export const movementConfig = {
    walkSpeed: 4.4, sprintSpeed: 7.2, aimSpeed: 3.2,
    accelerationGround: 30, accelerationAir: 8,
    rotationSharpness: 14, jumpStrength: 8.5,
    gravity: 24, terminalVelocity: 30,
    capsuleRadius: 0.4, capsuleHeight: 1.8,
    groundSnapDistance: 0.18, stepHeight: 0.45,
};

export const baseMovementSpeeds = {
    walk: movementConfig.walkSpeed,
    sprint: movementConfig.sprintSpeed,
    aim: movementConfig.aimSpeed,
};

export const cameraCollisionConfig = { wallPadding: 0.22, minDistanceFromTarget: 0.65 };

export const waveConfig = {
    baseEnemies: 3, enemiesIncrementPerWave: 3, maxConcurrentEnemies: 3,
    initialWaveDelaySeconds: 15, intermissionDelaySeconds: 10,
    spawnPoints: [
        new THREE.Vector3(10, FLOOR_Y_OFFSET, -4),
        new THREE.Vector3(-25, FLOOR_Y_OFFSET, -18),
        new THREE.Vector3(18, FLOOR_Y_OFFSET, 12),
        new THREE.Vector3(-18, FLOOR_Y_OFFSET, 14),
        new THREE.Vector3(2, FLOOR_Y_OFFSET, -22),
        new THREE.Vector3(-4, FLOOR_Y_OFFSET, 22),
        new THREE.Vector3(22, FLOOR_Y_OFFSET, -10),
        new THREE.Vector3(-22, FLOOR_Y_OFFSET, 6),
    ],
};

export const audioConfig = {
    cityMusicVolume: 0.2, rifleShotVolume: 0.42,
    enemyRifleShotVolume: 0.2, enemyRifleShotMinIntervalMs: 140,
    rifleShotPitchJitter: 0.06, rifleShotVolumeJitter: 0.1,
    characterHitVolume: 0.55, characterDeathVolume: 0.62,
    reloadVolume: 0.52, emptyMagVolume: 0.45,
    jumpVolume: 0.48, powerupVolume: 0.55, regenVolume: 0.5,
    footstepSingleVolume: 0.35, enemyFootstepVolume: 0.22,
    positionalRefDistance: 7, positionalMaxDistance: 90, positionalRolloff: 1.15,
    playerFootstepWalkIntervalMs: 510, playerFootstepRunIntervalMs: 290,
    enemyFootstepIntervalMs: 340,
    playerFootstepRefDistance: 2.2, playerFootstepMaxDistance: 18,
    enemyFootstepRefDistance: 2.4, enemyFootstepMaxDistance: 22,
    enemyFootstepPlayableDistance: 24,
    rifleShotRefDistance: 14, rifleShotMaxDistance: 220, rifleShotRolloff: 0.8,
};

export const enemyConfig = {
    maxHealth: 100, patrolSpeed: 2.1, sightRadius: 28,
    patrolReachDistance: 0.9, patrolRadius: 22, shootInterval: 0.16,
    accuracyChance: 0.5, missSpreadStrength: 0.42,
    capsuleRadius: 0.38, capsuleHeight: 1.8, stepHeight: 0.4,
    reloadDurationSafety: 2.6, magazineSize: 30, reserveAmmo: 180,
    shootRange: 220, damagePerShot: 8,
};

if (selectedDifficulty === 'easy') {
    enemyConfig.patrolSpeed = 1.3;
    enemyConfig.sightRadius = 18;
    enemyConfig.damagePerShot = 4;
} else if (selectedDifficulty === 'hard') {
    enemyConfig.patrolSpeed = 3.1;
    enemyConfig.sightRadius = 38;
    enemyConfig.damagePerShot = 12;
}

export const weaponCombatDefaults = {
    rifle: { magazineSize: 30, totalAmmo: 180, shotsPerSecond: 10, range: 240, tracerLifetime: 0.07, fireMode: 'AUTO' },
};

export const weaponHoldTransforms = {
    rifle: { position: [0.03, 0.02, 0.04], barrelFacingOffset: Math.PI, barrelRoll: -1.5 },
    handgun: { position: [0.02, 0.015, 0.03], rotation: [Math.PI / 2, 0, -Math.PI / 2] },
};

export const effectsConfig = { maxActiveShotTracers: 48, maxActiveMuzzleFlashes: 20 };

// ── Mutable state objects ─────────────────────────────────────
export const playerVitals = { health: 100, shield: 100, baseMax: 100, overchargeMax: 125 };

export const speedPowerupState = {
    active: false, timeRemaining: 0, durationSeconds: 60, speedMultiplier: 1.45,
};

export const gameState = {
    gameMode: urlParams.get('mode') === 'koth' ? 'koth' : 'arena',
    score: 0, elapsedSeconds: 0, timerRunning: true, isPaused: false,
    isPlayerDead: false, isVictory: false, currentWave: 0, currentWaveTargetKills: 0,
    currentWaveKills: 0, currentWaveSpawned: 0, waveSpawnCursor: 0,
    pendingWaveStart: true, waveDelayRemaining: 15, isWaveSpawning: false,
};

export const multiplayerState = {
    enabled: urlParams.get('multiplayer') === '1',
    serverUrl: urlParams.get('ws') || 'wss://preston-rental-respect-contemporary.trycloudflare.com',
    socket: null, playerId: null, matchStarted: false,
    sharedArenaActive: false, statusElement: null, statusText: 'Disconnected',
    lastPoseSentAt: 0, poseSendIntervalMs: 16, // Increased update frequency (was 50ms)
    remotePlayerRoot: null, remotePlayerId: null,
    remoteAvatar: null, remoteAvatarLoading: null,
    lastRemoteSnapshot: null, lastArenaSnapshot: null,
    pendingEnemyVisualIds: new Set(),
};

export const multiplayerAssetCache = { weaponModels: new Map() };

export const audioState = {
    interactionUnlocked: false, cityMusic: null,
    playerFootstepLastAt: 0, playerFootstepSfx: null,
    enemyFootstepLastAt: new WeakMap(),
    lastEmptyMagAt: { player: 0, enemy: 0 },
    pausedCityMusicAt: false, lastEnemyRifleShotAt: 0,
    playerRifleLoopSfx: { ak: null, m4: null },
    activePlayerRifleLoopKey: null,
};

export const playerState = {
    velocity: new THREE.Vector3(), isGrounded: true,
    currentGroundHeight: FLOOR_Y_OFFSET, facingAngle: 0, hasJumpQueued: false,
};

export const mouseState = {
    pointerLockActive: false, isHoveringCanvas: false,
    hasMoveReference: false, isAimPressed: false, isFirePressed: false,
    hasSemiShotQueued: false, lastX: 0, lastY: 0, sensitivity: 0.0035,
};

export const cameraRig = {
    yaw: 0, pitch: -0.35, distance: 3.5, minDistance: 3.5, maxDistance: 11,
    aimDistanceOffset: -2.8, positionSharpness: 10, targetSharpness: 14,
    lookOffset: new THREE.Vector3(0, 1.5, 0),
    aimLookOffset: new THREE.Vector3(-0.35, 1.54, 0),
    shoulderOffset: new THREE.Vector3(1.35, 1.35, 0),
    aimShoulderOffset: new THREE.Vector3(-2.9, 1.42, 0.1),
    target: new THREE.Vector3(),
};

export const collisionState = {
    groundMeshes: [], colliderMeshes: [],
    groundResolver: () => 0, customResolver: null,
};

// ── Animation state ───────────────────────────────────────────
export const mixers = [];
export const animationActions = new Map();
export const animationBank = {
    idle: null, idleGun: null, aimGun: null, aimMoveGun: null,
    shootStillGun: null, shootWalkGun: null, reloadStillGun: null,
    reloadWalkGun: null, walk: null, run: null, walkGun: null,
    runGun: null, jump: null, fall: null, equip: null,
};

// ── Weapon state (replaces all loose `let` vars from original) ─
export const weaponState = {
    currentCharacter: null, currentMixer: null,
    activeAction: null, lastGroundedActionName: null,
    equippedWeapon: null, heldWeaponPivot: null,
    heldWeaponBone: null, heldWeaponModel: null,
    cachedMuzzleNode: null, isEquipAnimating: false,
    isReloadAnimating: false, activeReloadActionName: null,
    hasWeaponEquipped: false, equippedWeaponType: null,
    equippedWeaponCombatState: null, cachedLeftHandBone: null,
    isUsingWeaponSocket: false, cachedRifleSockets: null,
    currentRifleSocketState: null,
};

export const firingState = { shotCooldown: 0 };
export const shotTracers = [];
export const muzzleFlashes = [];

// ── Game entity collections ───────────────────────────────────
export const enemies = [];
export const enemyHitMeshOwner = new Map();
export const weaponPickups = [];
export const utilityPickups = [];
export const pressedKeys = new Set();
export const timeState = { weapon: 0 };

// ── Shared utility: weapon hold transform ─────────────────────
// Defined here so both weapons.js and enemies.js can import it without circular deps.
export function applyWeaponHoldTransform(pivot, weaponType, useSocket = false) {
    const transform = weaponHoldTransforms[weaponType] || weaponHoldTransforms.handgun;
    if (weaponType === 'rifle' && useSocket) {
        pivot.position.set(0, 0, 0);
        pivot.rotation.set(0, 0, 0);
        return;
    }
    pivot.position.set(transform.position[0], transform.position[1], transform.position[2]);
    if (weaponType !== 'rifle') {
        pivot.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
    }
}
