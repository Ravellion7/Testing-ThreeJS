import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.querySelector('.game-canvas');
const crosshairElement = document.querySelector('.center-crosshair');
const weaponHudElement = document.querySelector('.hud-bottom-right');
const ammoCurrentElement = document.getElementById('ammo-current');
const ammoTotalElement = document.getElementById('ammo-total');
const fireModeElement = document.getElementById('fire-mode');
const healthFillElement = document.getElementById('health-fill');
const healthValueElement = document.getElementById('health-value');
const shieldFillElement = document.getElementById('shield-fill');
const shieldValueElement = document.getElementById('shield-value');
const powerupsListElement = document.getElementById('powerups-list');
const speedPowerupIconElement = document.getElementById('speed-powerup-icon');
const enemiesRemainingElement = document.getElementById('enemies-remaining');
const waveElement = document.getElementById('wave');
const nextWaveCountdownElement = document.getElementById('next-wave-countdown');
const scoreElement = document.getElementById('score');
const timeElement = document.getElementById('time');
const pauseOverlayElement = document.getElementById('pause-overlay');
const continueButtonElement = document.getElementById('continue-btn');
const settingsButtonElement = document.getElementById('settings-btn');
const menuButtonElement = document.getElementById('menu-btn');
const ingameSettingsOverlayElement = document.getElementById('ingame-settings-overlay');
const closeSettingsButtonElement = document.getElementById('close-settings-btn');
const backToGameButtonElement = document.getElementById('back-to-game-btn');
const deathOverlayElement = document.getElementById('death-overlay');
const deathTimeElement = document.getElementById('death-time');
const deathWaveElement = document.getElementById('death-wave');
const deathScoreElement = document.getElementById('death-score');
const retryButtonElement = document.getElementById('retry-btn');
const deathMenuButtonElement = document.getElementById('death-menu-btn');

if (!container) {
    throw new Error('Three.js container ".game-canvas" was not found.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 30, 120);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
);
const audioListener = new THREE.AudioListener();
camera.add(audioListener);
const positionalAudioLoader = new THREE.AudioLoader();
const positionalAudioBuffers = new Map();
const positionalAudioLoading = new Map();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.classList.add('threejs-stage');
container.prepend(renderer.domElement);

const clock = new THREE.Clock();
const loader = new GLTFLoader();
const FLOOR_Y_OFFSET = -0.12;
const PLAYER_MODEL_Y_OFFSET = -0.06;
const mixers = [];
const weaponPickups = [];
const utilityPickups = [];
const enemies = [];
const enemyHitMeshOwner = new Map();
let weaponTime = 0;
const animationActions = new Map();
const animationBank = {
    idle: null,
    idleGun: null,
    aimGun: null,
    aimMoveGun: null,
    shootStillGun: null,
    shootWalkGun: null,
    reloadStillGun: null,
    reloadWalkGun: null,
    walk: null,
    run: null,
    walkGun: null,
    runGun: null,
    jump: null,
    fall: null,
    equip: null,
};

const pressedKeys = new Set();
const tempVectorA = new THREE.Vector3();
const tempVectorB = new THREE.Vector3();
const tempVectorC = new THREE.Vector3();
const tempBox = new THREE.Box3();
const upAxis = new THREE.Vector3(0, 1, 0);
const downwardAxis = new THREE.Vector3(0, -1, 0);
const groundRaycaster = new THREE.Raycaster();
const cameraCollisionRaycaster = new THREE.Raycaster();
const cameraCollisionTempA = new THREE.Vector3();
const cameraCollisionTempB = new THREE.Vector3();

const cameraCollisionConfig = {
    wallPadding: 0.22,
    minDistanceFromTarget: 0.65,
};

const playerRoot = new THREE.Group();
playerRoot.position.set(0, 0, 0);
scene.add(playerRoot);

const playerCollider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.0, 8, 16),
    new THREE.MeshStandardMaterial({
        color: 0xd9dee8,
        transparent: true,
        opacity: 0.12,
        roughness: 0.5,
        metalness: 0.1,
    }),
);
playerCollider.position.y = 0.9;
playerCollider.visible = false;
playerCollider.castShadow = true;
playerRoot.add(playerCollider);

const movementConfig = {
    walkSpeed: 4.4,
    sprintSpeed: 7.2,
    aimSpeed: 3.2,
    accelerationGround: 30,
    accelerationAir: 8,
    rotationSharpness: 14,
    jumpStrength: 8.5,
    gravity: 24,
    terminalVelocity: 30,
    capsuleRadius: 0.4,
    capsuleHeight: 1.8,
    groundSnapDistance: 0.18,
    stepHeight: 0.45,
};

const baseMovementSpeeds = {
    walk: movementConfig.walkSpeed,
    sprint: movementConfig.sprintSpeed,
    aim: movementConfig.aimSpeed,
};

const playerVitals = {
    health: 100,
    shield: 100,
    baseMax: 100,
    overchargeMax: 125,
};

const speedPowerupState = {
    active: false,
    timeRemaining: 0,
    durationSeconds: 60,
    speedMultiplier: 1.45,
};

const gameState = {
    score: 0,
    elapsedSeconds: 0,
    timerRunning: true,
    isPaused: false,
    isPlayerDead: false,
    currentWave: 0,
    currentWaveTargetKills: 0,
    currentWaveKills: 0,
    currentWaveSpawned: 0,
    waveSpawnCursor: 0,
    pendingWaveStart: true,
    waveDelayRemaining: 15,
    isWaveSpawning: false,
};

const waveConfig = {
    baseEnemies: 3,
    enemiesIncrementPerWave: 3,
    maxConcurrentEnemies: 3,
    initialWaveDelaySeconds: 15,
    intermissionDelaySeconds: 10,
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

const audioConfig = {
    cityMusicVolume: 0.2,
    rifleShotVolume: 0.42,
    enemyRifleShotVolume: 0.2,
    enemyRifleShotMinIntervalMs: 140,
    rifleShotPitchJitter: 0.06,
    rifleShotVolumeJitter: 0.1,
    characterHitVolume: 0.55,
    characterDeathVolume: 0.62,
    reloadVolume: 0.52,
    emptyMagVolume: 0.45,
    jumpVolume: 0.48,
    powerupVolume: 0.55,
    regenVolume: 0.5,
    footstepSingleVolume: 0.35,
    enemyFootstepVolume: 0.22,
    positionalRefDistance: 7,
    positionalMaxDistance: 90,
    positionalRolloff: 1.15,
    playerFootstepWalkIntervalMs: 510,
    playerFootstepRunIntervalMs: 290,
    enemyFootstepIntervalMs: 340,
    playerFootstepRefDistance: 2.2,
    playerFootstepMaxDistance: 18,
    enemyFootstepRefDistance: 2.4,
    enemyFootstepMaxDistance: 22,
    enemyFootstepPlayableDistance: 24,
    rifleShotRefDistance: 14,
    rifleShotMaxDistance: 220,
    rifleShotRolloff: 0.8,
};

const audioState = {
    interactionUnlocked: false,
    cityMusic: null,
    playerFootstepLastAt: 0,
    playerFootstepSfx: null,
    enemyFootstepLastAt: new WeakMap(),
    lastEmptyMagAt: {
        player: 0,
        enemy: 0,
    },
    pausedCityMusicAt: false,
    lastEnemyRifleShotAt: 0,
    playerRifleLoopSfx: {
        ak: null,
        m4: null,
    },
    activePlayerRifleLoopKey: null,
};

const playerState = {
    velocity: new THREE.Vector3(),
    isGrounded: true,
    currentGroundHeight: FLOOR_Y_OFFSET,
    facingAngle: 0,
    hasJumpQueued: false,
};

const mouseState = {
    pointerLockActive: false,
    isHoveringCanvas: false,
    hasMoveReference: false,
    isAimPressed: false,
    isFirePressed: false,
    hasSemiShotQueued: false,
    lastX: 0,
    lastY: 0,
    sensitivity: 0.0035,
};

const cameraRig = {
    yaw: 0,
    pitch: -0.35,
    distance: 3.5,
    minDistance: 3.5,
    maxDistance: 11,
    aimDistanceOffset: -2.8,
    positionSharpness: 10,
    targetSharpness: 14,
    lookOffset: new THREE.Vector3(0, 1.5, 0),
    aimLookOffset: new THREE.Vector3(-0.35, 1.54, 0),
    shoulderOffset: new THREE.Vector3(1.35, 1.35, 0),
    aimShoulderOffset: new THREE.Vector3(-2.9, 1.42, 0.1),
    target: new THREE.Vector3(),
};

const collisionState = {
    groundMeshes: [],
    colliderMeshes: [],
    groundResolver: () => 0,
    customResolver: null,
};

let currentCharacter = null;
let currentMixer = null;
let activeAction = null;
let lastGroundedActionName = null;
let equippedWeapon = null;
let heldWeaponPivot = null;
let heldWeaponBone = null;
let heldWeaponModel = null;
let cachedMuzzleNode = null;
let isEquipAnimating = false;
let isReloadAnimating = false;
let activeReloadActionName = null;
let hasWeaponEquipped = false;
let equippedWeaponType = null;
let equippedWeaponCombatState = null;
let cachedLeftHandBone = null;
let isUsingWeaponSocket = false;
let cachedRifleSockets = null;
let currentRifleSocketState = null;

const weaponCombatDefaults = {
    rifle: {
        magazineSize: 30,
        totalAmmo: 180,
        shotsPerSecond: 10,
        range: 240,
        tracerLifetime: 0.07,
        fireMode: 'AUTO',
    },
};

const firingState = {
    shotCooldown: 0,
};

const shotTracers = [];
const muzzleFlashes = [];
const effectsConfig = {
    maxActiveShotTracers: 48,
    maxActiveMuzzleFlashes: 20,
};
const shotRaycaster = new THREE.Raycaster();
const bulletBlockerRaycaster = new THREE.Raycaster();
const enemySightRaycaster = new THREE.Raycaster();
const enemyShotRaycaster = new THREE.Raycaster();

const enemyConfig = {
    maxHealth: 100,
    patrolSpeed: 2.1,
    sightRadius: 28,
    patrolReachDistance: 0.9,
    patrolRadius: 22,
    shootInterval: 0.16,
    accuracyChance: 0.5,
    missSpreadStrength: 0.42,
    capsuleRadius: 0.38,
    capsuleHeight: 1.8,
    stepHeight: 0.4,
    reloadDurationSafety: 2.6,
    magazineSize: 30,
    reserveAmmo: 180,
    shootRange: 220,
    damagePerShot: 8,
};

const weaponHoldTransforms = {
    rifle: {
        position: [0.03, 0.02, 0.04],
        barrelFacingOffset: Math.PI,
        barrelRoll: -1.5,
    },
    handgun: {
        position: [0.02, 0.015, 0.03],
        rotation: [Math.PI / 2, 0, -Math.PI / 2],
    },
};

function applyMovementSpeedMultiplier(multiplier = 1) {
    movementConfig.walkSpeed = baseMovementSpeeds.walk * multiplier;
    movementConfig.sprintSpeed = baseMovementSpeeds.sprint * multiplier;
    movementConfig.aimSpeed = baseMovementSpeeds.aim * multiplier;
}

function playSoundEffect(path, volume = 1) {
    if (!audioState.interactionUnlocked) {
        return;
    }

    const sound = new Audio(path);
    sound.volume = THREE.MathUtils.clamp(volume, 0, 1);
    sound.play().catch(() => {});
}

function loadPositionalBuffer(path) {
    const cached = positionalAudioBuffers.get(path);
    if (cached) {
        return Promise.resolve(cached);
    }

    const loading = positionalAudioLoading.get(path);
    if (loading) {
        return loading;
    }

    const nextLoad = new Promise((resolve, reject) => {
        positionalAudioLoader.load(
            path,
            (buffer) => {
                positionalAudioBuffers.set(path, buffer);
                positionalAudioLoading.delete(path);
                resolve(buffer);
            },
            undefined,
            (error) => {
                positionalAudioLoading.delete(path);
                reject(error);
            },
        );
    });

    positionalAudioLoading.set(path, nextLoad);
    return nextLoad;
}

function applyPositionalSettings(sound, volume, settings = {}) {
    sound.setRefDistance(settings.refDistance ?? audioConfig.positionalRefDistance);
    sound.setMaxDistance(settings.maxDistance ?? audioConfig.positionalMaxDistance);
    sound.setRolloffFactor(settings.rolloff ?? audioConfig.positionalRolloff);
    sound.setDistanceModel('inverse');
    sound.setVolume(THREE.MathUtils.clamp(volume, 0, 1));
}

function playPositionalOneShot(path, volume, emitter, settings = {}) {
    if (!audioState.interactionUnlocked || !emitter) {
        return;
    }

    loadPositionalBuffer(path).then((buffer) => {
        if (!emitter) {
            return;
        }

        const sound = new THREE.PositionalAudio(audioListener);
        sound.setBuffer(buffer);
        sound.setLoop(false);
        applyPositionalSettings(sound, volume, settings);

        if (settings.playbackRate) {
            sound.setPlaybackRate(THREE.MathUtils.clamp(settings.playbackRate, 0.9, 1.1));
        }

        emitter.add(sound);
        sound.play();

        if (sound.source) {
            sound.source.onended = () => {
                if (sound.parent) {
                    sound.parent.remove(sound);
                }
                sound.disconnect();
            };
        }
    }).catch(() => {});
}

function ensureCityMusic() {
    if (audioState.cityMusic) {
        return audioState.cityMusic;
    }

    const music = new Audio('../Sounds/city_music.mp3');
    music.loop = true;
    music.volume = audioConfig.cityMusicVolume;
    audioState.cityMusic = music;
    return music;
}

function startCityMusic() {
    if (!audioState.interactionUnlocked) {
        return;
    }

    const music = ensureCityMusic();
    music.play().catch(() => {});
}

function getEquippedRifleShotSoundPath() {
    const equippedPath = String(equippedWeapon?.modelPath || '').toLowerCase();
    if (equippedPath.includes('m4a1')) {
        return '../Sounds/m4_shot.mp3';
    }

    return '../Sounds/ak47_shot.mp3';
}

function getPlayerShotEmitter() {
    return heldWeaponPivot || currentCharacter || playerRoot;
}

function stopPlayerRifleLoopSound() {
    const activeKey = audioState.activePlayerRifleLoopKey;
    if (!activeKey) {
        return;
    }

    const sound = audioState.playerRifleLoopSfx[activeKey];
    if (sound) {
        if (sound.isPlaying) {
            sound.stop();
        }
        sound.parent?.remove(sound);
    }

    audioState.activePlayerRifleLoopKey = null;
}

function startPlayerRifleLoopSound() {
    if (!audioState.interactionUnlocked) {
        return;
    }

    const path = getEquippedRifleShotSoundPath();
    const key = path.includes('m4') ? 'm4' : 'ak';
    const emitter = getPlayerShotEmitter();
    if (!emitter) {
        return;
    }

    if (audioState.activePlayerRifleLoopKey && audioState.activePlayerRifleLoopKey !== key) {
        stopPlayerRifleLoopSound();
    }

    audioState.activePlayerRifleLoopKey = key;

    loadPositionalBuffer(path).then((buffer) => {
        if (audioState.activePlayerRifleLoopKey !== key) {
            return;
        }

        let sound = audioState.playerRifleLoopSfx[key];
        if (!sound) {
            sound = new THREE.PositionalAudio(audioListener);
            sound.setLoop(true);
            sound.setBuffer(buffer);
            applyPositionalSettings(sound, audioConfig.rifleShotVolume, {
                refDistance: audioConfig.rifleShotRefDistance,
                maxDistance: audioConfig.rifleShotMaxDistance,
                rolloff: audioConfig.rifleShotRolloff,
            });
            audioState.playerRifleLoopSfx[key] = sound;
        } else if (!sound.buffer) {
            sound.setBuffer(buffer);
        }

        if (sound.parent !== emitter) {
            sound.parent?.remove(sound);
            emitter.add(sound);
        }

        if (!sound.isPlaying) {
            sound.play();
        }
    }).catch(() => {});
}

function playRifleShotSoundForEnemy(enemy) {
    if (!audioState.interactionUnlocked) {
        return;
    }

    const now = performance.now();
    if ((now - audioState.lastEnemyRifleShotAt) < audioConfig.enemyRifleShotMinIntervalMs) {
        return;
    }
    audioState.lastEnemyRifleShotAt = now;

    const enemyPath = String(enemy?.weaponModel?.name || '').toLowerCase();
    const path = enemyPath.includes('m4a1') ? '../Sounds/m4_shot.mp3' : '../Sounds/ak47_shot.mp3';
    const pitchOffset = (Math.random() * 2 - 1) * audioConfig.rifleShotPitchJitter;
    const volumeOffset = (Math.random() * 2 - 1) * audioConfig.rifleShotVolumeJitter;
    const volume = THREE.MathUtils.clamp(audioConfig.enemyRifleShotVolume * (1 + volumeOffset), 0, 1);
    playPositionalOneShot(path, volume, enemy?.root, {
        refDistance: audioConfig.rifleShotRefDistance,
        maxDistance: audioConfig.rifleShotMaxDistance,
        rolloff: audioConfig.rifleShotRolloff,
        playbackRate: 1 + pitchOffset,
    });
}

function playEmptyMagIfReady(actorKey, emitter) {
    if (!audioState.interactionUnlocked) {
        return;
    }

    const now = performance.now();
    const lastAt = audioState.lastEmptyMagAt[actorKey] || 0;
    if ((now - lastAt) < 280) {
        return;
    }

    audioState.lastEmptyMagAt[actorKey] = now;
    playPositionalOneShot('../Sounds/empty_mag.mp3', audioConfig.emptyMagVolume, emitter, {
        refDistance: 5,
        maxDistance: 60,
        rolloff: 1.2,
    });
}

function updateFootstepAudio() {
    if (!audioState.interactionUnlocked || gameState.isPaused) {
        return;
    }

    const now = performance.now();
    const playerHorizontalSpeed = Math.hypot(playerState.velocity.x, playerState.velocity.z);
    const playerMoving = playerState.isGrounded && playerHorizontalSpeed > 1.2;
    const playerSprinting = !isAimActive()
        && hasMovementInputPressed()
        && (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight'));
    const playerFootstepInterval = playerSprinting
        ? audioConfig.playerFootstepRunIntervalMs
        : audioConfig.playerFootstepWalkIntervalMs;

    if (playerMoving && (now - audioState.playerFootstepLastAt) >= playerFootstepInterval) {
        audioState.playerFootstepLastAt = now;
        loadPositionalBuffer('../Sounds/character_footstep.mp3').then((buffer) => {
            let sound = audioState.playerFootstepSfx;
            if (!sound) {
                sound = new THREE.PositionalAudio(audioListener);
                sound.setLoop(false);
                sound.setBuffer(buffer);
                applyPositionalSettings(sound, audioConfig.footstepSingleVolume, {
                    refDistance: audioConfig.playerFootstepRefDistance,
                    maxDistance: audioConfig.playerFootstepMaxDistance,
                    rolloff: 2,
                });
                audioState.playerFootstepSfx = sound;
            } else if (!sound.buffer) {
                sound.setBuffer(buffer);
            }

            if (sound.parent !== playerRoot) {
                sound.parent?.remove(sound);
                playerRoot.add(sound);
            }

            if (sound.isPlaying) {
                sound.stop();
            }

            sound.play();
        }).catch(() => {});
    }

    enemies.forEach((enemy) => {
        if (!enemy || enemy.isDead || !enemy.isMoving) {
            return;
        }

        if (enemy.root.position.distanceTo(playerRoot.position) > audioConfig.enemyFootstepPlayableDistance) {
            return;
        }

        const lastAt = audioState.enemyFootstepLastAt.get(enemy) || 0;
        if ((now - lastAt) < audioConfig.enemyFootstepIntervalMs) {
            return;
        }

        audioState.enemyFootstepLastAt.set(enemy, now);
        playPositionalOneShot('../Sounds/character_footstep.mp3', audioConfig.enemyFootstepVolume, enemy.root, {
            refDistance: audioConfig.enemyFootstepRefDistance,
            maxDistance: audioConfig.enemyFootstepMaxDistance,
            rolloff: 2,
        });
    });
}

function stopPlayerFootstepSound() {
    const sound = audioState.playerFootstepSfx;
    if (!sound) {
        return;
    }

    if (sound.isPlaying) {
        sound.stop();
    }
}

function setupAudioUnlockHandlers() {
    const unlockAudio = () => {
        audioState.interactionUnlocked = true;
        startCityMusic();
    };

    document.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    startCityMusic();
}

function updateVitalsHud() {
    if (healthFillElement && healthValueElement) {
        const healthForBar = THREE.MathUtils.clamp(playerVitals.health, 0, playerVitals.overchargeMax);
        healthFillElement.style.width = `${THREE.MathUtils.clamp((healthForBar / playerVitals.baseMax) * 100, 0, 100)}%`;
        healthValueElement.textContent = String(Math.round(playerVitals.health));
    }

    if (shieldFillElement && shieldValueElement) {
        const shieldForBar = THREE.MathUtils.clamp(playerVitals.shield, 0, playerVitals.overchargeMax);
        shieldFillElement.style.width = `${THREE.MathUtils.clamp((shieldForBar / playerVitals.baseMax) * 100, 0, 100)}%`;
        shieldValueElement.textContent = String(Math.round(playerVitals.shield));
    }
}

function updatePowerupsHud() {
    if (speedPowerupIconElement) {
        speedPowerupIconElement.classList.toggle('active', speedPowerupState.active);
    }

    if (!powerupsListElement) {
        return;
    }

    powerupsListElement.innerHTML = '';

    if (!speedPowerupState.active) {
        return;
    }

    const itemElement = document.createElement('div');
    itemElement.className = 'powerup-item speed-boost';

    const label = document.createElement('div');
    label.textContent = `Speed Boost (${Math.ceil(speedPowerupState.timeRemaining)}s)`;

    itemElement.append(label);
    powerupsListElement.appendChild(itemElement);
}

function applyResourcePickup(resourceType) {
    const isHealth = resourceType === 'health';
    const currentValue = isHealth ? playerVitals.health : playerVitals.shield;

    if (currentValue >= playerVitals.baseMax) {
        const boostedValue = Math.min(playerVitals.overchargeMax, currentValue + 25);
        if (isHealth) {
            playerVitals.health = boostedValue;
        } else {
            playerVitals.shield = boostedValue;
        }
        updateVitalsHud();
        return;
    }

    const restoredValue = playerVitals.baseMax;
    if (isHealth) {
        playerVitals.health = restoredValue;
    } else {
        playerVitals.shield = restoredValue;
    }

    updateVitalsHud();
}

function applySpeedPowerup() {
    speedPowerupState.active = true;
    speedPowerupState.timeRemaining = speedPowerupState.durationSeconds;
    applyMovementSpeedMultiplier(speedPowerupState.speedMultiplier);
    updatePowerupsHud();
}

function applyUtilityPickupEffect(type) {
    if (type === 'medkit') {
        applyResourcePickup('health');
        playSoundEffect('../Sounds/regen.mp3', audioConfig.regenVolume);
        return;
    }

    if (type === 'shield') {
        applyResourcePickup('shield');
        playSoundEffect('../Sounds/regen.mp3', audioConfig.regenVolume);
        return;
    }

    if (type === 'thunder') {
        applySpeedPowerup();
        playSoundEffect('../Sounds/powerup.mp3', audioConfig.powerupVolume);
    }
}

function updateSpeedPowerup(deltaSeconds) {
    if (!speedPowerupState.active) {
        return;
    }

    speedPowerupState.timeRemaining = Math.max(0, speedPowerupState.timeRemaining - deltaSeconds);
    if (speedPowerupState.timeRemaining <= 0) {
        speedPowerupState.active = false;
        speedPowerupState.timeRemaining = 0;
        applyMovementSpeedMultiplier(1);
    }

    updatePowerupsHud();
}

function collectUtilityPickup(entry) {
    if (!entry || !entry.isActive) {
        return;
    }

    applyUtilityPickupEffect(entry.type);
    entry.isActive = false;
    entry.respawnRemaining = entry.respawnSeconds;
    scene.remove(entry.pivot);
}

async function loadUtilityPickup(modelPath, spawnPosition, options = {}) {
    const {
        targetSize = 0.55,
        type = 'medkit',
        respawnSeconds = 30,
        pickupRadius = 1.35,
    } = options;

    try {
        const gltf = await loader.loadAsync(modelPath);
        const model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            model.scale.setScalar(targetSize / maxDim);
        }

        const scaledBox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        scaledBox.getCenter(center);
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= scaledBox.min.y;

        setShadowProperties(model);

        const pivot = new THREE.Group();
        pivot.position.copy(spawnPosition);
        pivot.add(model);
        scene.add(pivot);

        utilityPickups.push({
            pivot,
            model,
            type,
            baseY: spawnPosition.y,
            phase: Math.random() * Math.PI * 2,
            respawnSeconds,
            respawnRemaining: 0,
            pickupRadius,
            isActive: true,
        });

        return pivot;
    } catch (error) {
        console.warn(`Utility pickup could not be loaded: ${modelPath}`, error);
        return null;
    }
}

function updateUtilityPickups(deltaSeconds, elapsed) {
    const SPIN_SPEED = 1.2;
    const FLOAT_AMPLITUDE = 0.15;
    const FLOAT_FREQUENCY = 1.4;

    utilityPickups.forEach((entry) => {
        if (!entry.isActive) {
            entry.respawnRemaining = Math.max(0, entry.respawnRemaining - deltaSeconds);
            if (entry.respawnRemaining <= 0) {
                entry.isActive = true;
                entry.respawnRemaining = 0;
                entry.pivot.position.y = entry.baseY;
                scene.add(entry.pivot);
            }
            return;
        }

        entry.pivot.rotation.y += SPIN_SPEED * deltaSeconds;
        entry.pivot.position.y = entry.baseY + Math.sin(elapsed * FLOAT_FREQUENCY + entry.phase) * FLOAT_AMPLITUDE;

        if (playerRoot.position.distanceTo(entry.pivot.position) <= entry.pickupRadius) {
            collectUtilityPickup(entry);
        }
    });
}

function createEnvironment() {
    const hemisphereLight = new THREE.HemisphereLight(0xbfd8ff, 0x182030, 1.6);
    scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
    directionalLight.position.set(12, 18, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(2048, 2048);
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 80;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    scene.add(directionalLight);

    const fillLight = new THREE.PointLight(0x6ea8ff, 10, 30, 2);
    fillLight.position.set(-8, 6, -6);
    scene.add(fillLight);

    const ground = new THREE.Mesh(
        new THREE.CircleGeometry(70, 64),
        new THREE.MeshStandardMaterial({
            color: 0x243040,
            roughness: 0.95,
            metalness: 0.02,
        }),
    );
    ground.name = 'fallback_ground';
    ground.position.y = FLOOR_Y_OFFSET;
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    registerGroundMesh(ground);

    const grid = new THREE.GridHelper(140, 70, 0xdaa520, 0x37506c);
    grid.position.y = FLOOR_Y_OFFSET + 0.02;
    grid.material.opacity = 0.45;
    grid.material.transparent = true;
    scene.add(grid);
}

function setShadowProperties(object) {
    object.traverse((child) => {
        if (!child.isMesh) {
            return;
        }

        child.castShadow = true;
        child.receiveShadow = true;

        if (Array.isArray(child.material)) {
            child.material.forEach((material) => {
                material.needsUpdate = true;
            });
            return;
        }

        if (child.material) {
            child.material.needsUpdate = true;
        }
    });
}

function playAction(name, transitionSeconds = 0.2) {
    const nextAction = animationActions.get(name);

    if (!nextAction || nextAction === activeAction) {
        return;
    }

    if (activeAction) {
        activeAction.fadeOut(transitionSeconds);
    }

    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;
    nextAction.reset().fadeIn(transitionSeconds).play();
    activeAction = nextAction;
}

function playEquipAction() {
    if (!animationBank.equip) {
        return false;
    }

    const equipAction = animationActions.get(animationBank.equip);
    if (!equipAction) {
        return false;
    }

    if (activeAction && activeAction !== equipAction) {
        activeAction.fadeOut(0.15);
    }

    isEquipAnimating = true;
    equipAction.reset();
    equipAction.setLoop(THREE.LoopOnce, 1);
    equipAction.clampWhenFinished = true;
    equipAction.fadeIn(0.15).play();
    activeAction = equipAction;
    return true;
}

function playReloadAction(name) {
    if (!name || !currentMixer) {
        return false;
    }

    const reloadAction = animationActions.get(name);
    if (!reloadAction) {
        return false;
    }

    if (activeAction && activeAction !== reloadAction) {
        activeAction.fadeOut(0.12);
    }

    isReloadAnimating = true;
    activeReloadActionName = name;
    reloadAction.reset();
    reloadAction.setLoop(THREE.LoopOnce, 1);
    reloadAction.clampWhenFinished = true;
    reloadAction.fadeIn(0.1).play();
    activeAction = reloadAction;
    return true;
}

function handleMixerFinished(event) {
    if (!isEquipAnimating) {
        const reloadAction = activeReloadActionName
            ? animationActions.get(activeReloadActionName)
            : null;

        if (isReloadAnimating && reloadAction && event.action === reloadAction) {
            if (hasWeaponEquipped && equippedWeaponType === 'rifle' && equippedWeaponCombatState) {
                const magazineSize = Math.max(0, equippedWeaponCombatState.magazineSize || weaponCombatDefaults.rifle.magazineSize);
                const needed = Math.max(0, magazineSize - Math.max(0, equippedWeaponCombatState.currentAmmo || 0));
                const toLoad = Math.min(needed, Math.max(0, equippedWeaponCombatState.totalAmmo || 0));

                equippedWeaponCombatState.currentAmmo = Math.max(0, equippedWeaponCombatState.currentAmmo || 0) + toLoad;
                equippedWeaponCombatState.totalAmmo = Math.max(0, equippedWeaponCombatState.totalAmmo || 0) - toLoad;
                updateWeaponHudValues();
            }

            isReloadAnimating = false;
            activeReloadActionName = null;
            lastGroundedActionName = getPostReloadActionName();

            if (lastGroundedActionName) {
                playAction(lastGroundedActionName, 0.3);
            }
        }

        return;
    }

    const equipAction = animationActions.get(animationBank.equip);
    if (!equipAction || event.action !== equipAction) {
        return;
    }

    isEquipAnimating = false;
    lastGroundedActionName = (hasWeaponEquipped && equippedWeaponType === 'rifle' && animationBank.idleGun)
        ? animationBank.idleGun
        : animationBank.idle;

    if (lastGroundedActionName) {
        playAction(lastGroundedActionName);
    }
}

function getPreferredClip(animations, names) {
    return names
        .map((name) => animations.find((clip) => clip.name.toLowerCase().includes(name)))
        .find(Boolean) || animations[0] || null;
}

function normalizeAnimationKey(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function findClipByNames(animations, names) {
    if (!animations || animations.length === 0) {
        return null;
    }

    const normalizedHints = names
        .map((name) => normalizeAnimationKey(name))
        .filter(Boolean);

    if (normalizedHints.length === 0) {
        return null;
    }

    return animations.find((clip) => {
        const clipName = String(clip.name || '').toLowerCase();
        const normalizedClipName = normalizeAnimationKey(clip.name);

        return normalizedHints.some((hint) => (
            clipName.includes(hint)
            || normalizedClipName.includes(hint)
            || hint.includes(normalizedClipName)
        ));
    }) || null;
}

function rebuildAnimationBank(animations) {
    const getByExactName = (name) => animations.find((clip) => clip.name === name)?.name || null;
    const nonWeaponIdle = animations.find((clip) => clip.name === 'player_idle')
        || animations.find((clip) => (
            /idle/i.test(clip.name)
            && !/rifle|gun|shoot|aim|run|walk|jump|fall|death|out/i.test(clip.name)
        ))
        || animations.find((clip) => !/rifle|gun|shoot|aim|run|walk|jump|fall|death|out/i.test(clip.name));

    animationBank.idle = nonWeaponIdle?.name
        || findClipByNames(animations, ['breath'])?.name
        || animations[0]?.name
        || null;
    animationBank.idleGun = getByExactName('player_rifle_idle')
        || findClipByNames(animations, ['rifle_idle', 'idle_gun', 'idlegun'])?.name
        || null;
    animationBank.aimGun = getByExactName('player_rifle_aim')
        || findClipByNames(animations, ['rifle_aim', 'aim'])?.name
        || animationBank.idleGun;
    animationBank.aimMoveGun = getByExactName('player_rifle_run')
        || findClipByNames(animations, ['rifle_run'])?.name
        || animationBank.walkGun;
    animationBank.shootStillGun = getByExactName('player_rifle_shoot_still')
        || findClipByNames(animations, ['rifle_shoot_still', 'shoot_still'])?.name
        || animationBank.idleGun;
    animationBank.shootWalkGun = getByExactName('player_rifle_shoot_walk')
        || findClipByNames(animations, ['rifle_shoot_walk', 'shoot_walk'])?.name
        || animationBank.walkGun
        || animationBank.shootStillGun;
    animationBank.reloadStillGun = getByExactName('rifle_reload_still')
        || getByExactName('player_rifle_reload_still')
        || findClipByNames(animations, ['rifle_reload_still', 'reload_still'])?.name
        || animationBank.idleGun;
    animationBank.reloadWalkGun = getByExactName('rifle_reload_walk')
        || getByExactName('player_rifle_reload_walk')
        || findClipByNames(animations, ['rifle_reload_walk', 'reload_walk'])?.name
        || animationBank.walkGun
        || animationBank.reloadStillGun;
    animationBank.walk = getByExactName('player_walk')
        || findClipByNames(animations, ['walk'])?.name
        || null;
    animationBank.run = getByExactName('player_run')
        || findClipByNames(animations, ['run', 'jog'])?.name
        || animationBank.walk;
    animationBank.walkGun = getByExactName('player_rifle_run')
        || findClipByNames(animations, ['rifle_run'])?.name
        || null;
    animationBank.runGun = getByExactName('player_rifle_walk')
        || getByExactName('player_rifle_run_noaim')
        || findClipByNames(animations, ['rifle_walk', 'run_noaim'])?.name
        || animationBank.walkGun;
    animationBank.jump = getByExactName('player_jump_up')
        || getByExactName('player_jump')
        || findClipByNames(animations, ['jump'])?.name
        || null;
    animationBank.fall = getByExactName('player_fall')
        || findClipByNames(animations, ['fall'])?.name
        || null;
    animationBank.equip = getByExactName('player_rifle_out')
        || findClipByNames(animations, ['rifle_out', 'equip', 'grab'])?.name
        || null;
}

function isAimActive() {
    return mouseState.isAimPressed && hasWeaponEquipped && equippedWeaponType === 'rifle';
}

function getAimFacingAngle() {
    camera.getWorldDirection(tempVectorA);
    tempVectorA.y = 0;

    if (tempVectorA.lengthSq() < 0.000001) {
        return playerState.facingAngle;
    }

    tempVectorA.normalize();
    return Math.atan2(tempVectorA.x, tempVectorA.z);
}

function setCharacterFacingAngle(angle, deltaSeconds) {
    const rotationFactor = 1 - Math.exp(-movementConfig.rotationSharpness * deltaSeconds);
    const shortestDelta = Math.atan2(
        Math.sin(angle - playerState.facingAngle),
        Math.cos(angle - playerState.facingAngle),
    );

    playerState.facingAngle += shortestDelta * rotationFactor;
    playerState.facingAngle = Math.atan2(
        Math.sin(playerState.facingAngle),
        Math.cos(playerState.facingAngle),
    );
    playerRoot.rotation.y = playerState.facingAngle;
}

function updateAnimationState(hasMoveInput, isSprinting) {
    if (isEquipAnimating || isReloadAnimating) {
        return;
    }

    const isRifleEquipped = hasWeaponEquipped && equippedWeaponType === 'rifle';
    const aiming = isAimActive();
    const baseIdle = (isRifleEquipped && aiming && animationBank.aimGun)
        ? animationBank.aimGun
        : ((isRifleEquipped && animationBank.idleGun) ? animationBank.idleGun : animationBank.idle);
    let actionName = baseIdle;

    if (!playerState.isGrounded) {
        if (playerState.velocity.y > 1 && animationBank.jump) {
            actionName = animationBank.jump;
        } else if (playerState.velocity.y <= 1 && animationBank.fall) {
            actionName = animationBank.fall;
        } else {
            actionName = lastGroundedActionName || animationBank.idle;
        }
    } else if (hasMoveInput) {
        if (isRifleEquipped) {
            if (mouseState.isFirePressed && canShootRifle() && animationBank.shootWalkGun) {
                actionName = animationBank.shootWalkGun;
            } else if (aiming) {
                actionName = animationBank.aimMoveGun || animationBank.walkGun || animationBank.runGun || animationBank.run;
            } else {
                actionName = isSprinting
                    ? (animationBank.runGun || animationBank.run)
                    : (animationBank.walkGun || animationBank.walk || animationBank.runGun || animationBank.run);
            }
        } else {
            actionName = isSprinting ? animationBank.run : (animationBank.walk || animationBank.run);
        }
        lastGroundedActionName = actionName || lastGroundedActionName;
    } else {
        if (isRifleEquipped && mouseState.isFirePressed && canShootRifle() && animationBank.shootStillGun) {
            actionName = animationBank.shootStillGun;
        }
        lastGroundedActionName = baseIdle || lastGroundedActionName;
    }

    if (actionName) {
        playAction(actionName);
    }

    if (activeAction) {
        activeAction.setEffectiveTimeScale(isSprinting ? 1.15 : 1);
    }
}

function registerGroundMesh(mesh) {
    if (!mesh || collisionState.groundMeshes.includes(mesh)) {
        return mesh;
    }

    collisionState.groundMeshes.push(mesh);
    return mesh;
}

function registerGroundRoot(root, filter = (mesh) => mesh.isMesh) {
    root.traverse((child) => {
        if (child.isMesh && filter(child)) {
            registerGroundMesh(child);
        }
    });

    return root;
}

function registerCollisionMesh(mesh) {
    if (!mesh || collisionState.colliderMeshes.includes(mesh)) {
        return mesh;
    }

    collisionState.colliderMeshes.push(mesh);
    return mesh;
}

function unregisterCollisionMesh(mesh) {
    const meshIndex = collisionState.colliderMeshes.indexOf(mesh);

    if (meshIndex >= 0) {
        collisionState.colliderMeshes.splice(meshIndex, 1);
    }

    return mesh;
}

function registerCollisionRoot(root, options = {}) {
    const {
        filter = (mesh) => Boolean(mesh.userData.collider) || /collider|wall|block|obstacle/i.test(mesh.name),
    } = options;

    root.traverse((child) => {
        if (child.isMesh && filter(child)) {
            registerCollisionMesh(child);
        }
    });

    return root;
}

function setGroundResolver(resolver) {
    collisionState.groundResolver = typeof resolver === 'function' ? resolver : () => 0;
}

function setCollisionResolver(resolver) {
    collisionState.customResolver = typeof resolver === 'function' ? resolver : null;
}

function getMovementInputDirection() {
    let inputForward = 0;
    let inputRight = 0;

    if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) {
        inputForward += 1;
    }
    if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) {
        inputForward -= 1;
    }
    if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) {
        inputRight -= 1;
    }
    if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) {
        inputRight += 1;
    }

    tempVectorA.set(inputRight, 0, inputForward);
    if (tempVectorA.lengthSq() === 0) {
        return tempVectorA;
    }

    camera.getWorldDirection(tempVectorB);
    tempVectorB.y = 0;
    if (tempVectorB.lengthSq() < 0.000001) {
        tempVectorB.set(Math.sin(cameraRig.yaw), 0, Math.cos(cameraRig.yaw));
    }
    tempVectorB.normalize();

    tempVectorC.crossVectors(tempVectorB, upAxis).normalize();

    return tempVectorA
        .set(0, 0, 0)
        .addScaledVector(tempVectorB, inputForward)
        .addScaledVector(tempVectorC, inputRight)
        .normalize();
}

function getGroundHeightAt(position) {
    let bestGroundHeight = collisionState.groundResolver(position, playerState);

    if (collisionState.groundMeshes.length === 0) {
        return bestGroundHeight;
    }

    tempVectorB.copy(position);
    tempVectorB.y += movementConfig.capsuleHeight + movementConfig.stepHeight + 3;
    groundRaycaster.set(tempVectorB, downwardAxis);
    groundRaycaster.far = movementConfig.capsuleHeight + movementConfig.stepHeight + 6;

    const intersections = groundRaycaster.intersectObjects(collisionState.groundMeshes, false);
    const validHit = intersections.find((hit) => {
        if (!hit.face || hit.face.normal.y <= 0.2) {
            return false;
        }

        return hit.point.y <= position.y + movementConfig.stepHeight + movementConfig.groundSnapDistance;
    });

    if (!validHit) {
        return bestGroundHeight;
    }

    bestGroundHeight = Math.max(bestGroundHeight, validHit.point.y);
    return bestGroundHeight;
}

function resolveHorizontalCollisions(currentPosition, candidatePosition) {
    const resolved = candidatePosition.clone();

    for (let iteration = 0; iteration < 2; iteration += 1) {
        collisionState.colliderMeshes.forEach((mesh) => {
            if (!mesh.parent) {
                return;
            }

            tempBox.setFromObject(mesh);

            const playerMinY = currentPosition.y;
            const playerMaxY = currentPosition.y + movementConfig.capsuleHeight;
            const steppedOver = tempBox.max.y <= currentPosition.y + movementConfig.stepHeight;
            const verticalMiss = playerMaxY <= tempBox.min.y || playerMinY >= tempBox.max.y;

            if (steppedOver || verticalMiss) {
                return;
            }

            const closestX = THREE.MathUtils.clamp(resolved.x, tempBox.min.x, tempBox.max.x);
            const closestZ = THREE.MathUtils.clamp(resolved.z, tempBox.min.z, tempBox.max.z);
            const deltaX = resolved.x - closestX;
            const deltaZ = resolved.z - closestZ;
            const distanceSquared = (deltaX * deltaX) + (deltaZ * deltaZ);
            const radiusSquared = movementConfig.capsuleRadius * movementConfig.capsuleRadius;

            if (distanceSquared >= radiusSquared) {
                return;
            }

            if (distanceSquared === 0) {
                tempBox.getCenter(tempVectorA);
                const pushFromCenterX = resolved.x - tempVectorA.x;
                const pushFromCenterZ = resolved.z - tempVectorA.z;

                if (Math.abs(pushFromCenterX) > Math.abs(pushFromCenterZ)) {
                    resolved.x = pushFromCenterX >= 0
                        ? tempBox.max.x + movementConfig.capsuleRadius
                        : tempBox.min.x - movementConfig.capsuleRadius;
                } else {
                    resolved.z = pushFromCenterZ >= 0
                        ? tempBox.max.z + movementConfig.capsuleRadius
                        : tempBox.min.z - movementConfig.capsuleRadius;
                }
                return;
            }

            const distance = Math.sqrt(distanceSquared);
            const penetration = movementConfig.capsuleRadius - distance;
            resolved.x += (deltaX / distance) * penetration;
            resolved.z += (deltaZ / distance) * penetration;
        });
    }

    if (collisionState.customResolver) {
        const customResolved = collisionState.customResolver({
            currentPosition,
            candidatePosition: resolved.clone(),
            playerState,
            movementConfig,
        });

        if (customResolved instanceof THREE.Vector3) {
            resolved.copy(customResolved);
        }
    }

    return resolved;
}

function updatePlayer(deltaSeconds) {
    const moveDirection = getMovementInputDirection().clone();
    const hasMoveInput = moveDirection.lengthSq() > 0;
    const aiming = isAimActive();
    const isSprinting = !aiming && (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight'));
    const targetSpeed = aiming
        ? movementConfig.aimSpeed
        : (isSprinting ? movementConfig.sprintSpeed : movementConfig.walkSpeed);
    const acceleration = playerState.isGrounded
        ? movementConfig.accelerationGround
        : movementConfig.accelerationAir;

    tempVectorA.set(playerState.velocity.x, 0, playerState.velocity.z);
    tempVectorB.copy(moveDirection).multiplyScalar(targetSpeed);
    tempVectorA.lerp(tempVectorB, 1 - Math.exp(-acceleration * deltaSeconds));
    playerState.velocity.x = tempVectorA.x;
    playerState.velocity.z = tempVectorA.z;

    if (aiming) {
        setCharacterFacingAngle(getAimFacingAngle(), deltaSeconds);
    } else if (hasMoveInput) {
        setCharacterFacingAngle(Math.atan2(moveDirection.x, moveDirection.z), deltaSeconds);
    }

    if (playerState.hasJumpQueued && playerState.isGrounded) {
        playerState.velocity.y = movementConfig.jumpStrength;
        playerState.isGrounded = false;
    }
    playerState.hasJumpQueued = false;

    playerState.velocity.y = Math.max(
        playerState.velocity.y - (movementConfig.gravity * deltaSeconds),
        -movementConfig.terminalVelocity,
    );

    const startPosition = playerRoot.position.clone();
    tempVectorC.set(playerState.velocity.x, 0, playerState.velocity.z);
    const horizontalCandidate = startPosition.clone().addScaledVector(tempVectorC, deltaSeconds);
    const resolvedHorizontalPosition = resolveHorizontalCollisions(startPosition, horizontalCandidate);

    playerRoot.position.x = resolvedHorizontalPosition.x;
    playerRoot.position.z = resolvedHorizontalPosition.z;
    playerState.velocity.x = (resolvedHorizontalPosition.x - startPosition.x) / Math.max(deltaSeconds, 0.0001);
    playerState.velocity.z = (resolvedHorizontalPosition.z - startPosition.z) / Math.max(deltaSeconds, 0.0001);

    const verticalCandidateY = playerRoot.position.y + (playerState.velocity.y * deltaSeconds);
    tempVectorC.copy(playerRoot.position);
    tempVectorC.y = verticalCandidateY;
    const groundHeight = getGroundHeightAt(tempVectorC);
    const canSnapToGround = playerState.velocity.y <= 0
        && verticalCandidateY <= groundHeight + movementConfig.groundSnapDistance;

    if (canSnapToGround) {
        playerRoot.position.y = groundHeight;
        playerState.velocity.y = 0;
        playerState.isGrounded = true;
        playerState.currentGroundHeight = groundHeight;
    } else {
        playerRoot.position.y = verticalCandidateY;
        playerState.isGrounded = false;
    }

    updateAnimationState(hasMoveInput, isSprinting);
}

function resolveCameraCollisionPosition(targetPosition, desiredPosition) {
    if (collisionState.colliderMeshes.length === 0) {
        return desiredPosition;
    }

    cameraCollisionTempA.subVectors(desiredPosition, targetPosition);
    const desiredDistance = cameraCollisionTempA.length();
    if (desiredDistance <= 0.0001) {
        return desiredPosition;
    }

    cameraCollisionTempA.normalize();
    cameraCollisionRaycaster.set(targetPosition, cameraCollisionTempA);
    cameraCollisionRaycaster.far = desiredDistance;

    const hits = cameraCollisionRaycaster.intersectObjects(collisionState.colliderMeshes, false);
    const blockingHit = hits.find((entry) => entry.distance > 0.0001);
    if (!blockingHit) {
        return desiredPosition;
    }

    const safeDistance = Math.max(
        cameraCollisionConfig.minDistanceFromTarget,
        blockingHit.distance - cameraCollisionConfig.wallPadding,
    );

    return cameraCollisionTempB.copy(targetPosition).addScaledVector(cameraCollisionTempA, safeDistance);
}

function updateThirdPersonCamera(deltaSeconds) {
    const aiming = isAimActive();
    const lookOffset = aiming ? cameraRig.aimLookOffset : cameraRig.lookOffset;
    const shoulderOffset = aiming ? cameraRig.aimShoulderOffset : cameraRig.shoulderOffset;
    const cameraDistance = THREE.MathUtils.clamp(
        cameraRig.distance + (aiming ? cameraRig.aimDistanceOffset : 0),
        cameraRig.minDistance,
        cameraRig.maxDistance,
    );

    tempVectorA.copy(playerRoot.position).add(lookOffset);
    cameraRig.target.lerp(tempVectorA, 1 - Math.exp(-cameraRig.targetSharpness * deltaSeconds));

    tempVectorB
        .set(shoulderOffset.x, shoulderOffset.y, cameraDistance)
        .applyEuler(new THREE.Euler(cameraRig.pitch, cameraRig.yaw, 0, 'YXZ'));

    tempVectorC.copy(cameraRig.target).add(tempVectorB);
    const collisionResolvedCameraPosition = resolveCameraCollisionPosition(cameraRig.target, tempVectorC);
    camera.position.lerp(collisionResolvedCameraPosition, 1 - Math.exp(-cameraRig.positionSharpness * deltaSeconds));
    camera.lookAt(cameraRig.target);
}

function updateMixers(deltaSeconds) {
    mixers.forEach((mixer) => mixer.update(deltaSeconds));
}

function updateCrosshairVisibility() {
    if (!crosshairElement) {
        return;
    }

    crosshairElement.classList.toggle('active', hasWeaponEquipped && mouseState.isAimPressed);
}

function updateWeaponHudVisibility() {
    if (!weaponHudElement) {
        return;
    }

    weaponHudElement.classList.toggle('active', hasWeaponEquipped && equippedWeaponType === 'rifle');
}

function updateWeaponHudValues() {
    if (!ammoCurrentElement || !ammoTotalElement || !fireModeElement) {
        return;
    }

    if (!hasWeaponEquipped || equippedWeaponType !== 'rifle' || !equippedWeaponCombatState) {
        ammoCurrentElement.textContent = '0';
        ammoTotalElement.textContent = '0';
        fireModeElement.textContent = 'AUTO';
        return;
    }

    ammoCurrentElement.textContent = String(Math.max(0, equippedWeaponCombatState.currentAmmo || 0));
    ammoTotalElement.textContent = String(Math.max(0, equippedWeaponCombatState.totalAmmo || 0));
    fireModeElement.textContent = equippedWeaponCombatState.fireMode === 'SEMI' ? 'SEMI' : 'AUTO';
}

function findWeaponMuzzleNode(root) {
    if (!root) {
        return null;
    }

    const nameHints = ['muzzle', 'barrel', 'nozzle', 'flash', 'tip', 'end'];
    let bestMatch = null;

    root.traverse((node) => {
        if (!node || bestMatch) {
            return;
        }

        const name = String(node.name || '').toLowerCase();
        if (!name) {
            return;
        }

        if (nameHints.some((hint) => name.includes(hint))) {
            bestMatch = node;
        }
    });

    return bestMatch;
}

function getWeaponMuzzleWorldPosition(outPosition) {
    if (cachedMuzzleNode) {
        cachedMuzzleNode.getWorldPosition(outPosition);
        return outPosition;
    }

    if (heldWeaponModel) {
        tempBox.setFromObject(heldWeaponModel);
        tempBox.getCenter(outPosition);

        camera.getWorldDirection(tempVectorA);
        tempVectorA.y = 0;
        if (tempVectorA.lengthSq() < 0.000001) {
            tempVectorA.set(0, 0, -1);
        } else {
            tempVectorA.normalize();
        }

        const weaponSize = new THREE.Vector3();
        tempBox.getSize(weaponSize);
        const forwardOffset = Math.max(weaponSize.z, weaponSize.x, 0.35) * 0.5;
        outPosition.addScaledVector(tempVectorA, forwardOffset);
        return outPosition;
    }

    if (heldWeaponPivot) {
        heldWeaponPivot.getWorldPosition(outPosition);
        return outPosition;
    }

    outPosition.copy(camera.position);
    return outPosition;
}

function spawnShotTracer(start, end, lifetime) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length <= 0.0001) {
        return;
    }
    direction.normalize();

    while (shotTracers.length >= effectsConfig.maxActiveShotTracers) {
        const oldest = shotTracers.shift();
        if (!oldest) {
            break;
        }
        scene.remove(oldest.line);
        oldest.line.geometry.dispose();
        if (oldest.line.material) {
            oldest.line.material.dispose();
        }
    }

    const tracerGeometry = new THREE.CylinderGeometry(0.018, 0.018, length, 8, 1, true);
    const tracerMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff2a8,
        transparent: true,
        opacity: 0.95,
    });
    const tracer = new THREE.Mesh(tracerGeometry, tracerMaterial);
    tracer.frustumCulled = false;

    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    tracer.position.copy(midpoint);
    tracer.quaternion.setFromUnitVectors(upAxis, direction);
    scene.add(tracer);

    shotTracers.push({
        line: tracer,
        life: lifetime,
        maxLife: lifetime,
    });
}

function updateShotTracers(deltaSeconds) {
    for (let index = shotTracers.length - 1; index >= 0; index -= 1) {
        const tracer = shotTracers[index];
        tracer.life -= deltaSeconds;

        if (tracer.line.material) {
            const lifeRatio = THREE.MathUtils.clamp(tracer.life / Math.max(tracer.maxLife, 0.0001), 0, 1);
            tracer.line.material.opacity = lifeRatio;
        }

        if (tracer.life > 0) {
            continue;
        }

        scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        if (tracer.line.material) {
            tracer.line.material.dispose();
        }
        shotTracers.splice(index, 1);
    }
}

function spawnMuzzleFlash(worldPosition) {
    while (muzzleFlashes.length >= effectsConfig.maxActiveMuzzleFlashes) {
        const oldest = muzzleFlashes.shift();
        if (!oldest) {
            break;
        }
        scene.remove(oldest.sprite);
        oldest.sprite.material.dispose();
    }

    const flashMaterial = new THREE.SpriteMaterial({
        color: 0xffeaa6,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: true,
    });
    const flash = new THREE.Sprite(flashMaterial);
    flash.position.copy(worldPosition);
    flash.scale.set(0.22, 0.22, 0.22);
    scene.add(flash);

    muzzleFlashes.push({
        sprite: flash,
        life: 0.045,
        maxLife: 0.045,
    });
}

function updateMuzzleFlashes(deltaSeconds) {
    for (let index = muzzleFlashes.length - 1; index >= 0; index -= 1) {
        const entry = muzzleFlashes[index];
        entry.life -= deltaSeconds;

        const lifeRatio = THREE.MathUtils.clamp(entry.life / Math.max(entry.maxLife, 0.0001), 0, 1);
        entry.sprite.material.opacity = 0.95 * lifeRatio;
        const scale = 0.18 + (0.1 * lifeRatio);
        entry.sprite.scale.set(scale, scale, scale);

        if (entry.life > 0) {
            continue;
        }

        scene.remove(entry.sprite);
        entry.sprite.material.dispose();
        muzzleFlashes.splice(index, 1);
    }
}

function updateScoreHud() {
    if (!scoreElement) {
        return;
    }

    scoreElement.textContent = String(Math.max(0, Math.floor(gameState.score)));
}

function formatHudTime(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimeHud() {
    if (!timeElement) {
        return;
    }

    timeElement.textContent = formatHudTime(gameState.elapsedSeconds);
}

function addScore(points) {
    gameState.score += Math.max(0, points);
    updateScoreHud();
}

function rewardAmmoOnEnemyKill(amount = 30) {
    if (!hasWeaponEquipped || equippedWeaponType !== 'rifle' || !equippedWeaponCombatState) {
        return;
    }

    equippedWeaponCombatState.totalAmmo = Math.max(0, equippedWeaponCombatState.totalAmmo || 0) + Math.max(0, amount);
    updateWeaponHudValues();
}

function updateGameTimer(deltaSeconds) {
    if (!gameState.timerRunning || gameState.isPlayerDead) {
        return;
    }

    gameState.elapsedSeconds += Math.max(0, deltaSeconds);
    updateTimeHud();
}

function handlePlayerDeath() {
    if (gameState.isPlayerDead) {
        return;
    }

    gameState.isPlayerDead = true;
    gameState.timerRunning = false;
    pressedKeys.clear();
    mouseState.isAimPressed = false;
    mouseState.isFirePressed = false;
    mouseState.hasSemiShotQueued = false;
    playerState.hasJumpQueued = false;
    stopPlayerRifleLoopSound();
    stopPlayerFootstepSound();

    if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
    }

    pauseOverlayElement?.classList.remove('active');
    ingameSettingsOverlayElement?.classList.remove('active');

    if (deathTimeElement) {
        deathTimeElement.textContent = formatHudTime(gameState.elapsedSeconds);
    }

    if (deathWaveElement) {
        deathWaveElement.textContent = `Wave ${Math.max(1, gameState.currentWave || 1)}`;
    }

    if (deathScoreElement) {
        deathScoreElement.textContent = String(Math.max(0, Math.floor(gameState.score || 0)));
    }

    deathOverlayElement?.classList.add('active');

    playPositionalOneShot('../Sounds/character_death.mp3', audioConfig.characterDeathVolume, playerRoot, {
        refDistance: 7,
        maxDistance: 90,
        rolloff: 1.2,
    });
}

function updateEnemiesHud() {
    if (!enemiesRemainingElement) {
        return;
    }

    const remainingEnemies = Math.max(0, gameState.currentWaveTargetKills - gameState.currentWaveKills);
    enemiesRemainingElement.textContent = String(remainingEnemies);
}

function updateWaveHud() {
    if (!waveElement) {
        return;
    }

    waveElement.textContent = String(Math.max(1, gameState.currentWave || 1));
}

function updateNextWaveCountdownHud() {
    if (!nextWaveCountdownElement) {
        return;
    }

    const shouldShow = gameState.pendingWaveStart
        && !gameState.isPlayerDead
        && gameState.waveDelayRemaining > 0;

    nextWaveCountdownElement.classList.toggle('active', shouldShow);
    if (!shouldShow) {
        nextWaveCountdownElement.textContent = '';
        return;
    }

    nextWaveCountdownElement.textContent = `Next wave in: ${Math.ceil(gameState.waveDelayRemaining)}s`;
}

function getAliveEnemiesCount() {
    return enemies.reduce((count, enemy) => count + (enemy.isDead ? 0 : 1), 0);
}

function cleanupDeadEnemies() {
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
        const enemy = enemies[index];
        if (!enemy.isDead) {
            continue;
        }

        enemy.hitMeshes?.forEach((mesh) => {
            enemyHitMeshOwner.delete(mesh.uuid);
        });

        enemy.weaponPivot?.parent?.remove(enemy.weaponPivot);
        enemy.root?.parent?.remove(enemy.root);

        const mixerIndex = mixers.indexOf(enemy.mixer);
        if (mixerIndex >= 0) {
            mixers.splice(mixerIndex, 1);
        }

        enemies.splice(index, 1);
    }
}

function getWaveSpawnPositions(count) {
    const basePoints = waveConfig.spawnPoints;
    const points = [];

    for (let index = 0; index < count; index += 1) {
        const spawnIndex = gameState.waveSpawnCursor + index;
        const template = basePoints[spawnIndex % basePoints.length];
        const cycle = Math.floor(spawnIndex / basePoints.length);
        const jitterRadius = cycle * 1.8;
        const angle = Math.random() * Math.PI * 2;
        const offsetX = Math.cos(angle) * jitterRadius;
        const offsetZ = Math.sin(angle) * jitterRadius;

        points.push(new THREE.Vector3(
            template.x + offsetX,
            template.y,
            template.z + offsetZ,
        ));
    }

    return points;
}

async function spawnEnemiesForCurrentWave() {
    if (gameState.isPlayerDead || gameState.isWaveSpawning) {
        return;
    }

    const remainingToSpawn = Math.max(0, gameState.currentWaveTargetKills - gameState.currentWaveSpawned);
    if (remainingToSpawn <= 0) {
        return;
    }

    const aliveCount = getAliveEnemiesCount();
    const availableSlots = Math.max(0, waveConfig.maxConcurrentEnemies - aliveCount);
    const spawnCount = Math.min(remainingToSpawn, availableSlots);
    if (spawnCount <= 0) {
        return;
    }

    gameState.isWaveSpawning = true;
    const spawnPositions = getWaveSpawnPositions(spawnCount);
    gameState.currentWaveSpawned += spawnCount;
    gameState.waveSpawnCursor += spawnCount;

    await Promise.all(spawnPositions.map((spawnPosition, spawnIndex) => (
        loadEnemyGuard(spawnPosition).catch((error) => {
            console.warn(`Enemy could not be loaded at wave ${gameState.currentWave} spawn ${spawnIndex + 1}.`, error);
        })
    )));

    gameState.isWaveSpawning = false;
    updateEnemiesHud();
}

async function startNextWave() {
    if (gameState.isPlayerDead || gameState.isWaveSpawning) {
        return;
    }

    gameState.pendingWaveStart = false;
    gameState.waveDelayRemaining = 0;
    updateNextWaveCountdownHud();

    cleanupDeadEnemies();
    gameState.currentWave += 1;
    updateWaveHud();

    const enemiesToSpawn = waveConfig.baseEnemies
        + ((gameState.currentWave - 1) * waveConfig.enemiesIncrementPerWave);
    gameState.currentWaveTargetKills = Math.max(0, enemiesToSpawn);
    gameState.currentWaveKills = 0;
    gameState.currentWaveSpawned = 0;
    gameState.waveSpawnCursor = 0;
    updateEnemiesHud();

    await spawnEnemiesForCurrentWave();
}

function registerEnemyKillForWaveProgress() {
    if (gameState.currentWaveTargetKills <= 0) {
        return;
    }

    gameState.currentWaveKills = Math.min(
        gameState.currentWaveTargetKills,
        gameState.currentWaveKills + 1,
    );
}

function updateWaveSystem(deltaSeconds) {
    if (gameState.isPlayerDead || gameState.isWaveSpawning) {
        updateNextWaveCountdownHud();
        return;
    }

    if (gameState.pendingWaveStart) {
        gameState.waveDelayRemaining = Math.max(
            0,
            gameState.waveDelayRemaining - Math.max(0, deltaSeconds || 0),
        );

        if (gameState.waveDelayRemaining <= 0) {
            gameState.pendingWaveStart = false;
            updateNextWaveCountdownHud();
            startNextWave();
            return;
        }

        updateNextWaveCountdownHud();

        return;
    }

    if (gameState.currentWave <= 0 || gameState.currentWaveTargetKills <= 0) {
        gameState.pendingWaveStart = true;
        gameState.waveDelayRemaining = waveConfig.initialWaveDelaySeconds;
        updateNextWaveCountdownHud();
        return;
}

    const aliveCount = getAliveEnemiesCount();
    const waveCompleted = gameState.currentWaveKills >= gameState.currentWaveTargetKills
        && gameState.currentWaveSpawned >= gameState.currentWaveTargetKills;

    if (waveCompleted) {
        if (aliveCount > 0) {
            return;
        }

        cleanupDeadEnemies();
        gameState.pendingWaveStart = true;
        gameState.waveDelayRemaining = waveConfig.intermissionDelaySeconds;
        updateNextWaveCountdownHud();
        return;
    }

    updateNextWaveCountdownHud();
    spawnEnemiesForCurrentWave();
}

function applyDamageToPlayer(amount) {
    let pendingDamage = Math.max(0, amount);
    if (pendingDamage <= 0) {
        return;
    }

    const shieldDamage = Math.min(playerVitals.shield, pendingDamage);
    playerVitals.shield -= shieldDamage;
    pendingDamage -= shieldDamage;

    if (pendingDamage > 0) {
        playerVitals.health = Math.max(0, playerVitals.health - pendingDamage);
    }

    playPositionalOneShot('../Sounds/character_hit.mp3', audioConfig.characterHitVolume, playerRoot, {
        refDistance: 6,
        maxDistance: 70,
        rolloff: 1.2,
    });

    updateVitalsHud();

    if (playerVitals.health <= 0) {
        handlePlayerDeath();
    }
}

function buildEnemyAnimationBank(animations) {
    const byExact = (name) => animations.find((clip) => clip.name === name)?.name || null;

    return {
        idleGun: byExact('enemy_rifle_idle')
            || findClipByNames(animations, ['enemy_rifle_idle', 'rifle_idle'])?.name
            || animations[0]?.name
            || null,
        walkGun: byExact('enemy_rifle_walk')
            || findClipByNames(animations, ['enemy_rifle_walk', 'rifle_walk'])?.name
            || null,
        shootStillGun: byExact('enemy_rifle_shoot_still')
            || findClipByNames(animations, ['enemy_rifle_shoot_still', 'shoot_still'])?.name
            || null,
        reloadStillGun: byExact('enemy_rifle_reload_stand')
            || findClipByNames(animations, ['enemy_rifle_reload_stand', 'reload_stand'])?.name
            || null,
        reloadWalkGun: byExact('enemy_rifle_reload_walk')
            || findClipByNames(animations, ['enemy_rifle_reload_walk', 'reload_walk'])?.name
            || null,
        deathGun: byExact('enemy_rifle_death')
            || findClipByNames(animations, ['enemy_rifle_death', 'death'])?.name
            || null,
    };
}

function findEnemyRifleSockets(root) {
    const sockets = {
        reload: null,
        death: null,
    };

    if (!root) {
        return sockets;
    }

    root.traverse((node) => {
        const rawName = String(node.name || '');
        const n = rawName.toLowerCase();

        if (!sockets.reload && (rawName === 'RifleEnemySocket_Reload' || n.includes('rifleenemysocket_reload'))) {
            sockets.reload = node;
        }

        if (!sockets.death && (rawName === 'RifleEnemySocket_Death' || n.includes('rifleenemysocket_death'))) {
            sockets.death = node;
        }
    });

    return sockets;
}

function getEnemyActionName(enemy) {
    return enemy.activeAction?.getClip?.()?.name || '';
}

function getEnemySocketKeyForAction(actionName) {
    const action = String(actionName || '').toLowerCase();
    if (action.includes('death')) {
        return 'death';
    }
    return 'reload';
}

function updateEnemyWeaponSocketAttachment(enemy) {
    if (!enemy || !enemy.weaponPivot || !enemy.weaponSockets) {
        return;
    }

    const desiredSocketKey = getEnemySocketKeyForAction(getEnemyActionName(enemy));
    const targetSocket = enemy.weaponSockets[desiredSocketKey] || enemy.weaponSockets.reload || enemy.weaponSockets.death;

    if (!targetSocket) {
        return;
    }

    if (enemy.weaponBone !== targetSocket) {
        enemy.weaponBone?.remove(enemy.weaponPivot);
        targetSocket.add(enemy.weaponPivot);
        enemy.weaponBone = targetSocket;
        applyWeaponHoldTransform(enemy.weaponPivot, 'rifle', true);
    }
}

function playEnemyAction(enemy, name, options = {}) {
    if (!enemy || !name) {
        return false;
    }

    const {
        transitionSeconds = 0.15,
        loopOnce = false,
    } = options;

    const nextAction = enemy.animationActions.get(name);
    if (!nextAction || nextAction === enemy.activeAction) {
        return false;
    }

    if (enemy.activeAction) {
        enemy.activeAction.fadeOut(transitionSeconds);
    }

    nextAction.reset();
    nextAction.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, loopOnce ? 1 : Infinity);
    nextAction.clampWhenFinished = loopOnce;
    nextAction.fadeIn(transitionSeconds).play();
    enemy.activeAction = nextAction;
    return true;
}

function completeEnemyReload(enemy) {
    if (!enemy || !enemy.isReloading || enemy.isDead) {
        return;
    }

    const magazineSize = enemyConfig.magazineSize;
    const needed = Math.max(0, magazineSize - enemy.ammoInMag);
    const toLoad = Math.min(needed, enemy.ammoReserve);
    enemy.ammoInMag += toLoad;
    enemy.ammoReserve -= toLoad;
    enemy.isReloading = false;
    enemy.reloadActionName = null;
    enemy.reloadTimeRemaining = 0;
}

function startEnemyReload(enemy, moving) {
    if (!enemy || enemy.isDead || enemy.isReloading) {
        return false;
    }

    if (enemy.ammoInMag > 0 || enemy.ammoReserve <= 0) {
        return false;
    }

    const reloadClip = moving
        ? (enemy.animationBank.reloadWalkGun || enemy.animationBank.reloadStillGun)
        : (enemy.animationBank.reloadStillGun || enemy.animationBank.reloadWalkGun);

    if (!reloadClip) {
        return false;
    }

    enemy.isReloading = true;
    enemy.reloadActionName = reloadClip;
    enemy.reloadTimeRemaining = enemyConfig.reloadDurationSafety;
    playEnemyAction(enemy, reloadClip, { transitionSeconds: 0.1, loopOnce: true });
    playPositionalOneShot('../Sounds/rifle_reload2.mp3', audioConfig.reloadVolume, enemy.root, {
        refDistance: 7,
        maxDistance: 85,
        rolloff: 1.1,
    });
    return true;
}

function handleEnemyMixerFinished(enemy, event) {
    if (!enemy || !event?.action) {
        return;
    }

    if (enemy.isReloading) {
        const reloadAction = enemy.reloadActionName
            ? enemy.animationActions.get(enemy.reloadActionName)
            : null;

        if (reloadAction && event.action === reloadAction) {
            completeEnemyReload(enemy);
        }
    }
}

function registerEnemyHitMeshes(enemy) {
    enemy.hitMeshes = [];
    enemy.root.traverse((node) => {
        if (!node.isMesh) {
            return;
        }

        enemy.hitMeshes.push(node);
        enemyHitMeshOwner.set(node.uuid, enemy);
    });
}

function applyDamageToEnemy(enemy, amount) {
    if (!enemy || enemy.isDead) {
        return;
    }

    enemy.health = Math.max(0, enemy.health - Math.max(0, amount));
    if (enemy.health > 0) {
        playPositionalOneShot('../Sounds/character_hit.mp3', audioConfig.characterHitVolume, enemy.root, {
            refDistance: 6,
            maxDistance: 70,
            rolloff: 1.2,
        });
        return;
    }

    enemy.isDead = true;
    enemy.state = 'dead';
    enemy.isReloading = false;
    enemy.reloadActionName = null;
    enemy.reloadTimeRemaining = 0;
    if (enemy.animationBank.deathGun) {
        playEnemyAction(enemy, enemy.animationBank.deathGun, { transitionSeconds: 0.12, loopOnce: true });
    }
    playPositionalOneShot('../Sounds/character_death.mp3', audioConfig.characterDeathVolume, enemy.root, {
        refDistance: 7,
        maxDistance: 90,
        rolloff: 1.2,
    });

    addScore(100);
    rewardAmmoOnEnemyKill(30);
    registerEnemyKillForWaveProgress();
    updateEnemyWeaponSocketAttachment(enemy);
    updateEnemiesHud();
}

function getEnemyMuzzleWorldPosition(enemy, outPosition) {
    if (enemy.cachedMuzzleNode) {
        enemy.cachedMuzzleNode.getWorldPosition(outPosition);
        return outPosition;
    }

    if (enemy.weaponModel) {
        tempBox.setFromObject(enemy.weaponModel);
        tempBox.getCenter(outPosition);
        return outPosition;
    }

    if (enemy.weaponPivot) {
        enemy.weaponPivot.getWorldPosition(outPosition);
        return outPosition;
    }

    enemy.root.getWorldPosition(outPosition);
    outPosition.y += 1.35;
    return outPosition;
}

function getAliveEnemyHitMeshes() {
    const meshes = [];
    enemies.forEach((enemy) => {
        if (enemy.isDead || !enemy.hitMeshes) {
            return;
        }

        enemy.hitMeshes.forEach((mesh) => {
            if (mesh.parent) {
                meshes.push(mesh);
            }
        });
    });

    return meshes;
}

function enemyHasLineOfSight(enemy, distanceToPlayer) {
    if (!enemy || enemy.isDead || distanceToPlayer > enemyConfig.sightRadius) {
        return false;
    }

    const origin = new THREE.Vector3();
    const playerPoint = new THREE.Vector3();
    getEnemyMuzzleWorldPosition(enemy, origin);
    playerPoint.copy(playerRoot.position);
    playerPoint.y += 1.1;

    tempVectorA.subVectors(playerPoint, origin);
    const distance = tempVectorA.length();
    if (distance <= 0.001) {
        return true;
    }

    tempVectorA.normalize();
    enemySightRaycaster.set(origin, tempVectorA);
    enemySightRaycaster.far = distance;
    const blockers = enemySightRaycaster.intersectObjects(collisionState.colliderMeshes, false);
    return blockers.length === 0;
}

function pickEnemyPatrolTarget(enemy) {
    const randomAngle = Math.random() * Math.PI * 2;
    const randomDistance = enemyConfig.patrolRadius * (0.35 + (Math.random() * 0.65));
    const target = new THREE.Vector3(
        enemy.spawnPosition.x + (Math.cos(randomAngle) * randomDistance),
        enemy.root.position.y,
        enemy.spawnPosition.z + (Math.sin(randomAngle) * randomDistance),
    );
    target.y = getGroundHeightAt(target);
    enemy.patrolTarget = target;
}

function resolveEnemyHorizontalCollisions(enemy, currentPosition, candidatePosition) {
    const resolved = candidatePosition.clone();

    for (let iteration = 0; iteration < 2; iteration += 1) {
        collisionState.colliderMeshes.forEach((mesh) => {
            if (!mesh.parent) {
                return;
            }

            tempBox.setFromObject(mesh);

            const playerMinY = currentPosition.y;
            const playerMaxY = currentPosition.y + enemyConfig.capsuleHeight;
            const steppedOver = tempBox.max.y <= currentPosition.y + enemyConfig.stepHeight;
            const verticalMiss = playerMaxY <= tempBox.min.y || playerMinY >= tempBox.max.y;

            if (steppedOver || verticalMiss) {
                return;
            }

            const closestX = THREE.MathUtils.clamp(resolved.x, tempBox.min.x, tempBox.max.x);
            const closestZ = THREE.MathUtils.clamp(resolved.z, tempBox.min.z, tempBox.max.z);
            const deltaX = resolved.x - closestX;
            const deltaZ = resolved.z - closestZ;
            const distanceSquared = (deltaX * deltaX) + (deltaZ * deltaZ);
            const radiusSquared = enemyConfig.capsuleRadius * enemyConfig.capsuleRadius;

            if (distanceSquared >= radiusSquared) {
                return;
            }

            if (distanceSquared === 0) {
                tempBox.getCenter(tempVectorA);
                const pushFromCenterX = resolved.x - tempVectorA.x;
                const pushFromCenterZ = resolved.z - tempVectorA.z;

                if (Math.abs(pushFromCenterX) > Math.abs(pushFromCenterZ)) {
                    resolved.x = pushFromCenterX >= 0
                        ? tempBox.max.x + enemyConfig.capsuleRadius
                        : tempBox.min.x - enemyConfig.capsuleRadius;
                } else {
                    resolved.z = pushFromCenterZ >= 0
                        ? tempBox.max.z + enemyConfig.capsuleRadius
                        : tempBox.min.z - enemyConfig.capsuleRadius;
                }
                return;
            }

            const distance = Math.sqrt(distanceSquared);
            const penetration = enemyConfig.capsuleRadius - distance;
            resolved.x += (deltaX / distance) * penetration;
            resolved.z += (deltaZ / distance) * penetration;
        });
    }

    return resolved;
}

function updateEnemyPatrolMovement(enemy, deltaSeconds) {
    if (!enemy.patrolTarget) {
        pickEnemyPatrolTarget(enemy);
    }

    tempVectorA.subVectors(enemy.patrolTarget, enemy.root.position);
    tempVectorA.y = 0;
    const distance = tempVectorA.length();

    if (distance <= enemyConfig.patrolReachDistance) {
        enemy.patrolIdleTime = Math.max(0, (enemy.patrolIdleTime || 0) - deltaSeconds);
        if (enemy.patrolIdleTime <= 0) {
            enemy.patrolIdleTime = 0.6 + (Math.random() * 1.2);
            pickEnemyPatrolTarget(enemy);
        }
        return false;
    }

    tempVectorB.copy(tempVectorA).normalize();
    const stepDistance = Math.min(distance, enemyConfig.patrolSpeed * deltaSeconds);
    const startPosition = enemy.root.position.clone();
    const candidatePosition = startPosition.clone().addScaledVector(tempVectorB, stepDistance);
    const resolvedPosition = resolveEnemyHorizontalCollisions(enemy, startPosition, candidatePosition);
    enemy.root.position.x = resolvedPosition.x;
    enemy.root.position.z = resolvedPosition.z;
    enemy.root.position.y = getGroundHeightAt(enemy.root.position);

    const movedX = enemy.root.position.x - startPosition.x;
    const movedZ = enemy.root.position.z - startPosition.z;
    const movedDistance = Math.sqrt((movedX * movedX) + (movedZ * movedZ));

    if (movedDistance > 0.001) {
        enemy.facingAngle = Math.atan2(movedX, movedZ);
        enemy.root.rotation.y = enemy.facingAngle;
        enemy.blockedRepathCooldown = 0;
        return true;
    }

    enemy.blockedRepathCooldown = Math.max(0, (enemy.blockedRepathCooldown || 0) - deltaSeconds);
    if (enemy.blockedRepathCooldown <= 0) {
        enemy.patrolTarget = null;
        enemy.blockedRepathCooldown = 0.14 + (Math.random() * 0.12);
    }

    return false;
}

function enemyShootPlayer(enemy) {
    if (!enemy || enemy.isDead || enemy.isReloading || enemy.ammoInMag <= 0) {
        return;
    }

    const shotOrigin = new THREE.Vector3();
    const targetPoint = new THREE.Vector3().copy(playerRoot.position);
    targetPoint.y += 1.1;

    getEnemyMuzzleWorldPosition(enemy, shotOrigin);
    tempVectorA.subVectors(targetPoint, shotOrigin);
    const shotDistance = Math.min(tempVectorA.length(), enemyConfig.shootRange);
    if (shotDistance <= 0.0001) {
        return;
    }

    playRifleShotSoundForEnemy(enemy);

    tempVectorA.normalize();
    const willHitPlayer = Math.random() < enemyConfig.accuracyChance;
    if (!willHitPlayer) {
        const horizontalPerp = new THREE.Vector3().crossVectors(tempVectorA, upAxis);
        if (horizontalPerp.lengthSq() < 0.0001) {
            horizontalPerp.set(1, 0, 0);
        } else {
            horizontalPerp.normalize();
        }

        const verticalPerp = new THREE.Vector3().crossVectors(horizontalPerp, tempVectorA).normalize();
        const horizontalOffset = (Math.random() * 2 - 1) * enemyConfig.missSpreadStrength;
        const verticalOffset = (Math.random() * 2 - 1) * enemyConfig.missSpreadStrength;
        tempVectorA
            .addScaledVector(horizontalPerp, horizontalOffset)
            .addScaledVector(verticalPerp, verticalOffset)
            .normalize();
    }

    bulletBlockerRaycaster.set(shotOrigin, tempVectorA);
    bulletBlockerRaycaster.far = shotDistance;
    const blockerHits = bulletBlockerRaycaster.intersectObjects(
        collisionState.colliderMeshes.concat(collisionState.groundMeshes),
        false,
    );

    let effectiveRange = shotDistance;
    let blockingPoint = null;
    if (blockerHits.length > 0) {
        effectiveRange = Math.min(effectiveRange, blockerHits[0].distance);
        blockingPoint = blockerHits[0].point;
    }

    let playerHit = null;
    if (willHitPlayer) {
        enemyShotRaycaster.set(shotOrigin, tempVectorA);
        enemyShotRaycaster.far = effectiveRange;
        const playerHits = enemyShotRaycaster.intersectObject(playerCollider, false);
        if (playerHits.length > 0) {
            playerHit = playerHits[0];
        }
    }

    const tracerEnd = new THREE.Vector3().copy(shotOrigin).addScaledVector(tempVectorA, effectiveRange);
    if (playerHit) {
        tracerEnd.copy(playerHit.point);
        applyDamageToPlayer(enemyConfig.damagePerShot);
    } else if (blockingPoint) {
        tracerEnd.copy(blockingPoint);
    }

    spawnMuzzleFlash(shotOrigin);
    spawnShotTracer(shotOrigin, tracerEnd, 0.06);
    enemy.ammoInMag = Math.max(0, enemy.ammoInMag - 1);
}

function updateEnemy(enemy, deltaSeconds) {
    if (!enemy) {
        return;
    }

    enemy.isMoving = false;
    updateEnemyWeaponSocketAttachment(enemy);

    if (enemy.isDead) {
        return;
    }

    const distanceToPlayer = enemy.root.position.distanceTo(playerRoot.position);
    const canSeePlayer = enemyHasLineOfSight(enemy, distanceToPlayer);
    enemy.state = canSeePlayer ? 'engage' : 'patrol';

    if (enemy.isReloading) {
        enemy.reloadTimeRemaining = Math.max(0, enemy.reloadTimeRemaining - deltaSeconds);
        if (enemy.reloadTimeRemaining <= 0) {
            completeEnemyReload(enemy);
        }
    }

    if (enemy.state === 'engage') {
        tempVectorA.subVectors(playerRoot.position, enemy.root.position);
        tempVectorA.y = 0;
        if (tempVectorA.lengthSq() > 0.0001) {
            tempVectorA.normalize();
            enemy.facingAngle = Math.atan2(tempVectorA.x, tempVectorA.z);
            enemy.root.rotation.y = enemy.facingAngle;
        }

        if (enemy.isReloading) {
            playEnemyAction(enemy, enemy.reloadActionName || enemy.animationBank.reloadStillGun);
            return;
        }

        if (enemy.ammoInMag <= 0) {
            if (startEnemyReload(enemy, false)) {
                return;
            }
            playEmptyMagIfReady('enemy', enemy.root);
        }

        if (enemy.animationBank.shootStillGun) {
            playEnemyAction(enemy, enemy.animationBank.shootStillGun, { transitionSeconds: 0.08 });
        }

        enemy.shotCooldown = Math.max(0, enemy.shotCooldown - deltaSeconds);
        if (enemy.shotCooldown <= 0 && enemy.ammoInMag > 0) {
            enemyShootPlayer(enemy);
            enemy.shotCooldown = enemyConfig.shootInterval;
            return;
        }
        return;
    }

    const didMove = updateEnemyPatrolMovement(enemy, deltaSeconds);
    enemy.isMoving = didMove;

    if (enemy.isReloading) {
        playEnemyAction(enemy, enemy.reloadActionName || (didMove ? enemy.animationBank.reloadWalkGun : enemy.animationBank.reloadStillGun));
        return;
    }

    if (enemy.ammoInMag <= 0) {
        startEnemyReload(enemy, didMove);
        if (enemy.isReloading) {
            return;
        }
    }

    if (didMove) {
        playEnemyAction(enemy, enemy.animationBank.walkGun || enemy.animationBank.idleGun);
    } else {
        playEnemyAction(enemy, enemy.animationBank.idleGun);
    }
}

function updateEnemies(deltaSeconds) {
    enemies.forEach((enemy) => updateEnemy(enemy, deltaSeconds));
}

async function loadEnemyGuard(spawnPosition) {
    const [characterGltf, weaponGltf] = await Promise.all([
        loader.loadAsync('../Characters/enemy_GUARD.glb'),
        loader.loadAsync('../Weapons/AK-47.glb'),
    ]);

    const root = characterGltf.scene;
    root.position.copy(spawnPosition);
    root.position.y = getGroundHeightAt(root.position) + PLAYER_MODEL_Y_OFFSET;
    root.scale.setScalar(1);
    setShadowProperties(root);
    scene.add(root);

    const mixer = new THREE.AnimationMixer(root);
    mixers.push(mixer);

    const animationActionsMap = new Map();
    characterGltf.animations.forEach((clip) => {
        animationActionsMap.set(clip.name, mixer.clipAction(clip));
    });

    const enemy = {
        root,
        mixer,
        animationActions: animationActionsMap,
        animationBank: buildEnemyAnimationBank(characterGltf.animations),
        activeAction: null,
        state: 'patrol',
        health: enemyConfig.maxHealth,
        isDead: false,
        isReloading: false,
        reloadActionName: null,
        reloadTimeRemaining: 0,
        ammoInMag: enemyConfig.magazineSize,
        ammoReserve: enemyConfig.reserveAmmo,
        shotCooldown: 0,
        spawnPosition: spawnPosition.clone(),
        patrolTarget: null,
        patrolIdleTime: 0,
        blockedRepathCooldown: 0,
        facingAngle: 0,
        weaponPivot: null,
        weaponBone: null,
        weaponModel: null,
        cachedMuzzleNode: null,
        weaponSockets: findEnemyRifleSockets(root),
        hitMeshes: [],
    };

    const weaponModel = weaponGltf.scene.clone();
    setShadowProperties(weaponModel);
    tempBox.setFromObject(weaponModel);
    tempBox.getSize(tempVectorA);
    const maxDim = Math.max(tempVectorA.x, tempVectorA.y, tempVectorA.z);
    if (maxDim > 0) {
        weaponModel.scale.setScalar(0.85 / maxDim);
    }

    tempBox.setFromObject(weaponModel);
    tempBox.getCenter(tempVectorA);
    weaponModel.position.x -= tempVectorA.x;
    weaponModel.position.z -= tempVectorA.z;
    weaponModel.position.y -= tempBox.min.y;

    const weaponPivot = new THREE.Group();
    weaponPivot.add(weaponModel);

    const defaultSocket = enemy.weaponSockets.reload || enemy.weaponSockets.death;
    if (defaultSocket) {
        const handWorldScale = new THREE.Vector3();
        defaultSocket.getWorldScale(handWorldScale);
        const inverseScaleX = Math.abs(handWorldScale.x) > 0.0001 ? 1 / handWorldScale.x : 1;
        const inverseScaleY = Math.abs(handWorldScale.y) > 0.0001 ? 1 / handWorldScale.y : 1;
        const inverseScaleZ = Math.abs(handWorldScale.z) > 0.0001 ? 1 / handWorldScale.z : 1;
        weaponPivot.scale.set(inverseScaleX, inverseScaleY, inverseScaleZ);

        defaultSocket.add(weaponPivot);
        enemy.weaponBone = defaultSocket;
        applyWeaponHoldTransform(weaponPivot, 'rifle', true);
    }

    enemy.weaponPivot = weaponPivot;
    enemy.weaponModel = weaponModel;
    enemy.cachedMuzzleNode = findWeaponMuzzleNode(weaponModel);

    registerEnemyHitMeshes(enemy);
    enemies.push(enemy);
    mixer.addEventListener('finished', (event) => handleEnemyMixerFinished(enemy, event));

    playEnemyAction(enemy, enemy.animationBank.idleGun || enemy.animationBank.walkGun);
    updateEnemiesHud();
    return enemy;
}

function canShootRifle() {
    return Boolean(
        hasWeaponEquipped
        && equippedWeaponType === 'rifle'
        && equippedWeaponCombatState
        && equippedWeaponCombatState.currentAmmo > 0,
    );
}

function hasMovementInputPressed() {
    return Boolean(
        pressedKeys.has('KeyW')
        || pressedKeys.has('ArrowUp')
        || pressedKeys.has('KeyS')
        || pressedKeys.has('ArrowDown')
        || pressedKeys.has('KeyA')
        || pressedKeys.has('ArrowLeft')
        || pressedKeys.has('KeyD')
        || pressedKeys.has('ArrowRight'),
    );
}

function getPostReloadActionName() {
    const isRifleEquipped = hasWeaponEquipped && equippedWeaponType === 'rifle';
    const moving = hasMovementInputPressed();
    const aiming = isAimActive();
    const sprinting = !aiming && (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight'));

    if (!isRifleEquipped) {
        if (moving) {
            return sprinting
                ? (animationBank.run || animationBank.walk || animationBank.idle)
                : (animationBank.walk || animationBank.run || animationBank.idle);
        }

        return animationBank.idle;
    }

    if (moving) {
        if (aiming) {
            return animationBank.aimMoveGun || animationBank.walkGun || animationBank.runGun || animationBank.idleGun || animationBank.idle;
        }

        return sprinting
            ? (animationBank.runGun || animationBank.run || animationBank.walkGun || animationBank.idleGun || animationBank.idle)
            : (animationBank.walkGun || animationBank.walk || animationBank.runGun || animationBank.run || animationBank.idleGun || animationBank.idle);
    }

    if (aiming) {
        return animationBank.aimGun || animationBank.idleGun || animationBank.idle;
    }

    return animationBank.idleGun || animationBank.idle;
}

function startRifleReload() {
    if (!hasWeaponEquipped || equippedWeaponType !== 'rifle' || !equippedWeaponCombatState) {
        return false;
    }

    if (isEquipAnimating || isReloadAnimating) {
        return false;
    }

    const magazineSize = Math.max(0, equippedWeaponCombatState.magazineSize || weaponCombatDefaults.rifle.magazineSize);
    const currentAmmo = Math.max(0, equippedWeaponCombatState.currentAmmo || 0);
    const reserveAmmo = Math.max(0, equippedWeaponCombatState.totalAmmo || 0);

    if (currentAmmo >= magazineSize || reserveAmmo <= 0) {
        return false;
    }

    const moving = hasMovementInputPressed();
    const reloadClip = moving
        ? (animationBank.reloadWalkGun || animationBank.reloadStillGun)
        : (animationBank.reloadStillGun || animationBank.reloadWalkGun);

    if (!reloadClip) {
        return false;
    }

    mouseState.isFirePressed = false;
    firingState.shotCooldown = 0;
    const didStartReload = playReloadAction(reloadClip);
    if (didStartReload) {
        stopPlayerRifleLoopSound();
        playPositionalOneShot('../Sounds/rifle_reload2.mp3', audioConfig.reloadVolume, getPlayerShotEmitter(), {
            refDistance: 7,
            maxDistance: 85,
            rolloff: 1.1,
        });
    }
    return didStartReload;
}

function shootRifleOnce() {
    if (!canShootRifle()) {
        return false;
    }

    equippedWeaponCombatState.currentAmmo = Math.max(0, equippedWeaponCombatState.currentAmmo - 1);

    const maxRange = equippedWeaponCombatState.range || weaponCombatDefaults.rifle.range;
    camera.getWorldDirection(tempVectorA);
    tempVectorA.normalize();

    getWeaponMuzzleWorldPosition(tempVectorB);
    tempVectorB.addScaledVector(tempVectorA, 0.06);
    spawnMuzzleFlash(tempVectorB);
    tempVectorC.copy(tempVectorB).addScaledVector(tempVectorA, maxRange);

    bulletBlockerRaycaster.set(tempVectorB, tempVectorA);
    bulletBlockerRaycaster.far = maxRange;
    const blockerHits = bulletBlockerRaycaster.intersectObjects(
        collisionState.colliderMeshes.concat(collisionState.groundMeshes),
        false,
    );

    let effectiveRange = maxRange;
    let blockingPoint = null;
    if (blockerHits.length > 0) {
        effectiveRange = Math.min(effectiveRange, blockerHits[0].distance);
        blockingPoint = blockerHits[0].point;
    }

    shotRaycaster.set(tempVectorB, tempVectorA);
    shotRaycaster.far = effectiveRange;
    const enemyHits = shotRaycaster.intersectObjects(getAliveEnemyHitMeshes(), false);

    if (enemyHits.length > 0) {
        tempVectorC.copy(enemyHits[0].point);
        const hitEnemy = enemyHitMeshOwner.get(enemyHits[0].object.uuid);
        if (hitEnemy && !hitEnemy.isDead) {
            applyDamageToEnemy(hitEnemy, 34);
        }
    } else if (blockingPoint) {
        tempVectorC.copy(blockingPoint);
    }

    spawnShotTracer(tempVectorB, tempVectorC, equippedWeaponCombatState.tracerLifetime || weaponCombatDefaults.rifle.tracerLifetime);
    updateWeaponHudValues();
    return true;
}

function updateWeaponFiring(deltaSeconds) {
    firingState.shotCooldown = Math.max(0, firingState.shotCooldown - deltaSeconds);

    const shouldPlayPlayerRifleLoop = Boolean(
        !isReloadAnimating
        && !isEquipAnimating
        && mouseState.isFirePressed
        && hasWeaponEquipped
        && equippedWeaponType === 'rifle'
        && equippedWeaponCombatState
        && equippedWeaponCombatState.currentAmmo > 0,
    );

    if (shouldPlayPlayerRifleLoop) {
        startPlayerRifleLoopSound();
    } else {
        stopPlayerRifleLoopSound();
    }

    if (isReloadAnimating || isEquipAnimating) {
        return;
    }

    if (
        mouseState.isFirePressed
        && hasWeaponEquipped
        && equippedWeaponType === 'rifle'
        && equippedWeaponCombatState
        && equippedWeaponCombatState.currentAmmo <= 0
        && !isReloadAnimating
    ) {
        playEmptyMagIfReady('player', getPlayerShotEmitter());
    }

    if (!mouseState.isFirePressed || !canShootRifle()) {
        return;
    }

    const fireMode = equippedWeaponCombatState.fireMode === 'SEMI' ? 'SEMI' : 'AUTO';
    const interval = 1 / (equippedWeaponCombatState.shotsPerSecond || weaponCombatDefaults.rifle.shotsPerSecond);

    if (fireMode === 'SEMI') {
        if (!mouseState.hasSemiShotQueued || firingState.shotCooldown > 0) {
            return;
        }

        if (shootRifleOnce()) {
            firingState.shotCooldown += interval;
            mouseState.hasSemiShotQueued = false;
        }
        return;
    }

    while (mouseState.isFirePressed && firingState.shotCooldown <= 0 && canShootRifle()) {
        if (!shootRifleOnce()) {
            break;
        }
        firingState.shotCooldown += interval;
    }
}

function updateHudHints() {
    const notificationPanel = document.getElementById('notification-panel');

    if (!notificationPanel) {
        return;
    }

    notificationPanel.classList.add('active');
    notificationPanel.innerHTML = [
        'WASD move relative to camera',
        'Shift sprint',
        'Right click aim',
        'Space jump',
        'E pick up weapon',
        'X toggle fire mode (AUTO/SEMI)',
        'Collect pickups by touching them',
        'Move mouse to look around',
        'Left click to lock cursor',
    ].map((text) => `<div class="notification-message">${text}</div>`).join('');
}

function requestGamePointerLock() {
    if (!renderer?.domElement || document.pointerLockElement === renderer.domElement) {
        return;
    }

    try {
        const lockResult = renderer.domElement.requestPointerLock();
        if (lockResult && typeof lockResult.catch === 'function') {
            lockResult.catch(() => {});
        }
    } catch (_error) {
        // Ignore failed lock attempts (usually caused by missing user activation).
    }
}

function pauseGame() {
    if (!pauseOverlayElement || gameState.isPlayerDead) {
        return;
    }

    gameState.isPaused = true;
    pauseOverlayElement.classList.add('active');
    pressedKeys.clear();
    mouseState.isAimPressed = false;
    mouseState.isFirePressed = false;
    mouseState.hasSemiShotQueued = false;
    playerState.hasJumpQueued = false;

    if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
    }
    stopPlayerRifleLoopSound();
    stopPlayerFootstepSound();

    if (audioState.cityMusic && !audioState.cityMusic.paused) {
        audioState.pausedCityMusicAt = true;
        audioState.cityMusic.pause();
    } else {
        audioState.pausedCityMusicAt = false;
    }

}

function resumeGame() {
    if (!pauseOverlayElement) {
        return;
    }

    gameState.isPaused = false;
    pauseOverlayElement.classList.remove('active');
    ingameSettingsOverlayElement?.classList.remove('active');
    pressedKeys.clear();
    mouseState.isAimPressed = false;
    mouseState.isFirePressed = false;
    mouseState.hasSemiShotQueued = false;
    playerState.hasJumpQueued = false;
    mouseState.hasMoveReference = false;

    if (audioState.pausedCityMusicAt) {
        startCityMusic();
        audioState.pausedCityMusicAt = false;
    }

    requestGamePointerLock();
}

function togglePauseGame() {
    if (gameState.isPaused) {
        resumeGame();
        return;
    }

    pauseGame();
}

function setupPauseMenuListeners() {
    if (!pauseOverlayElement) {
        return;
    }

    if (continueButtonElement) {
        continueButtonElement.addEventListener('click', () => {
            resumeGame();
        });
    }

    if (settingsButtonElement && ingameSettingsOverlayElement) {
        settingsButtonElement.addEventListener('click', () => {
            ingameSettingsOverlayElement.classList.add('active');
        });
    }

    if (closeSettingsButtonElement && ingameSettingsOverlayElement) {
        closeSettingsButtonElement.addEventListener('click', () => {
            ingameSettingsOverlayElement.classList.remove('active');
        });
    }

    if (backToGameButtonElement && ingameSettingsOverlayElement) {
        backToGameButtonElement.addEventListener('click', () => {
            ingameSettingsOverlayElement.classList.remove('active');
        });
    }

    if (menuButtonElement) {
        menuButtonElement.addEventListener('click', () => {
            window.location.href = 'mainmenu.html';
        });
    }
}

function setupDeathScreenListeners() {
    if (retryButtonElement) {
        retryButtonElement.addEventListener('click', () => {
            window.location.reload();
        });
    }

    if (deathMenuButtonElement) {
        deathMenuButtonElement.addEventListener('click', () => {
            window.location.href = 'mainmenu.html';
        });
    }
}

function handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

function animate() {
    const deltaSeconds = Math.min(clock.getDelta(), 0.05);
    if (!gameState.isPaused && !gameState.isPlayerDead) {
        weaponTime += deltaSeconds;

        updateGameTimer(deltaSeconds);
        updateSpeedPowerup(deltaSeconds);
        updatePlayer(deltaSeconds);
        updateThirdPersonCamera(deltaSeconds);
        updateMixers(deltaSeconds);
        updateRifleSocketAttachment();
        updateHeldWeaponAlignment();
        updateWeaponFiring(deltaSeconds);
        updateShotTracers(deltaSeconds);
        updateMuzzleFlashes(deltaSeconds);
        updateEnemies(deltaSeconds);
        updateFootstepAudio();
        updateWaveSystem(deltaSeconds);
        updateCrosshairVisibility();
        updateWeaponHudVisibility();
        updateWeaponHudValues();
        updateWeaponPickups(deltaSeconds, weaponTime);
        updateUtilityPickups(deltaSeconds, weaponTime);
    }
    renderer.render(scene, camera);

    requestAnimationFrame(animate);
}

function attachInputHandlers() {
    renderer.domElement.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    renderer.domElement.addEventListener('click', () => {
        requestGamePointerLock();
    });

    renderer.domElement.addEventListener('mousedown', (event) => {
        if (event.button === 0) {
            mouseState.isFirePressed = true;
            mouseState.hasSemiShotQueued = true;
        }

        if (event.button === 2) {
            event.preventDefault();
            mouseState.isAimPressed = true;
        }
    });

    window.addEventListener('mouseup', (event) => {
        if (event.button === 0) {
            mouseState.isFirePressed = false;
        }

        if (event.button === 2) {
            mouseState.isAimPressed = false;
        }
    });

    renderer.domElement.addEventListener('mouseenter', () => {
        mouseState.isHoveringCanvas = true;
        mouseState.hasMoveReference = false;
    });

    renderer.domElement.addEventListener('mouseleave', () => {
        mouseState.isHoveringCanvas = false;
        mouseState.hasMoveReference = false;
    });

    document.addEventListener('pointerlockchange', () => {
        mouseState.pointerLockActive = document.pointerLockElement === renderer.domElement;
        mouseState.hasMoveReference = false;

        if (!mouseState.pointerLockActive && !gameState.isPaused && !gameState.isPlayerDead) {
            pauseGame();
        }
    });

    window.addEventListener('mousemove', (event) => {
        let deltaX = 0;
        let deltaY = 0;

        if (mouseState.pointerLockActive) {
            deltaX = event.movementX;
            deltaY = event.movementY;
        } else {
            if (!mouseState.isHoveringCanvas) {
                return;
            }

            if (!mouseState.hasMoveReference) {
                mouseState.lastX = event.clientX;
                mouseState.lastY = event.clientY;
                mouseState.hasMoveReference = true;
                return;
            }

            deltaX = event.clientX - mouseState.lastX;
            deltaY = event.clientY - mouseState.lastY;
            mouseState.lastX = event.clientX;
            mouseState.lastY = event.clientY;
        }

        cameraRig.yaw -= deltaX * mouseState.sensitivity;
        cameraRig.pitch = THREE.MathUtils.clamp(
            cameraRig.pitch - (deltaY * mouseState.sensitivity),
            -1.1,
            1.1,
        );
    });

    renderer.domElement.addEventListener('wheel', (event) => {
        event.preventDefault();
    }, { passive: false });

    window.addEventListener('keydown', (event) => {
        if (gameState.isPlayerDead) {
            return;
        }

        if (event.code === 'Escape' && !event.repeat) {
            event.preventDefault();

            if (gameState.isPaused && ingameSettingsOverlayElement?.classList.contains('active')) {
                ingameSettingsOverlayElement.classList.remove('active');
                return;
            }

            togglePauseGame();
            return;
        }

        if (gameState.isPaused) {
            return;
        }

        pressedKeys.add(event.code);

        if (event.code === 'Space') {
            event.preventDefault();
            if (playerState.isGrounded) {
                playPositionalOneShot('../Sounds/player_jump.mp3', audioConfig.jumpVolume, playerRoot, {
                    refDistance: 6,
                    maxDistance: 70,
                    rolloff: 1.2,
                });
            }
            playerState.hasJumpQueued = true;
        }

        if (event.code === 'KeyE') {
            const nearby = getClosestWeaponPickup();
            if (nearby) pickUpWeapon(nearby);
        }

        if (event.code === 'KeyR' && !event.repeat) {
            event.preventDefault();
            startRifleReload();
        }

        if (event.code === 'KeyX' && !event.repeat) {
            event.preventDefault();

            if (!hasWeaponEquipped || equippedWeaponType !== 'rifle' || !equippedWeaponCombatState) {
                return;
            }

            equippedWeaponCombatState.fireMode = equippedWeaponCombatState.fireMode === 'SEMI' ? 'AUTO' : 'SEMI';
            firingState.shotCooldown = 0;
            mouseState.isFirePressed = false;
            mouseState.hasSemiShotQueued = false;
            updateWeaponHudValues();
        }
    });

    window.addEventListener('keyup', (event) => {
        pressedKeys.delete(event.code);
    });

    window.addEventListener('blur', () => {
        pressedKeys.clear();
        stopPlayerRifleLoopSound();
        stopPlayerFootstepSound();
        mouseState.pointerLockActive = false;
        mouseState.hasMoveReference = false;
        mouseState.isHoveringCanvas = false;
        mouseState.isAimPressed = false;
        mouseState.isFirePressed = false;
        mouseState.hasSemiShotQueued = false;
        playerState.hasJumpQueued = false;
    });

    window.addEventListener('resize', handleResize);
}

async function loadCharacterModel(modelPath = '../Characters/player_SWAG.glb') {
    const gltf = await loader.loadAsync(modelPath);

    if (currentCharacter) {
        playerRoot.remove(currentCharacter);
    }

    if (currentMixer) {
        currentMixer.removeEventListener('finished', handleMixerFinished);
        const mixerIndex = mixers.indexOf(currentMixer);
        if (mixerIndex >= 0) {
            mixers.splice(mixerIndex, 1);
        }
    }

    animationActions.clear();
    Object.keys(animationBank).forEach((key) => {
        animationBank[key] = null;
    });
    activeAction = null;
    lastGroundedActionName = null;
    isEquipAnimating = false;
    isReloadAnimating = false;
    activeReloadActionName = null;

    if (heldWeaponPivot && heldWeaponBone) {
        heldWeaponBone.remove(heldWeaponPivot);
    }
    heldWeaponPivot = null;
    heldWeaponBone = null;
    heldWeaponModel = null;
    cachedMuzzleNode = null;
    equippedWeapon = null;
    hasWeaponEquipped = false;
    equippedWeaponType = null;
    equippedWeaponCombatState = null;
    cachedLeftHandBone = null;
    isUsingWeaponSocket = false;
    cachedRifleSockets = null;
    currentRifleSocketState = null;
    firingState.shotCooldown = 0;

    currentCharacter = gltf.scene;
    currentCharacter.position.set(0, PLAYER_MODEL_Y_OFFSET, 0);
    currentCharacter.rotation.set(0, 0, 0);
    currentCharacter.scale.setScalar(1);
    setShadowProperties(currentCharacter);
    playerRoot.add(currentCharacter);

    if (gltf.animations.length > 0) {
        currentMixer = new THREE.AnimationMixer(currentCharacter);
        currentMixer.addEventListener('finished', handleMixerFinished);
        mixers.push(currentMixer);

        gltf.animations.forEach((clip) => {
            animationActions.set(clip.name, currentMixer.clipAction(clip));
        });

        rebuildAnimationBank(gltf.animations);
        lastGroundedActionName = animationBank.idle;
        if (animationBank.idle) {
            playAction(animationBank.idle);
        }
    }

    return gltf;
}

async function loadWeaponPickup(modelPath, spawnPosition, targetSize = 0.55) {
    try {
        const gltf = await loader.loadAsync(modelPath);
        const model = gltf.scene;
        const weaponType = getWeaponType(modelPath);

        // Auto-scale so the longest axis fits within targetSize units
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            model.scale.setScalar(targetSize / maxDim);
        }

        // Center horizontally and sit the mesh base at pivot origin
        const scaledBox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        scaledBox.getCenter(center);
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= scaledBox.min.y;

        setShadowProperties(model);

        const pivot = new THREE.Group();
        pivot.position.copy(spawnPosition);
        pivot.add(model);
        scene.add(pivot);

        weaponPickups.push({
            pivot,
            model,
            modelPath,
            targetSize,
            baseY: spawnPosition.y,
            phase: Math.random() * Math.PI * 2,
            combatState: createWeaponCombatState(weaponType),
        });
        return pivot;
    } catch (error) {
        console.warn(`Weapon pickup could not be loaded: ${modelPath}`, error);
        return null;
    }
}

function updateWeaponPickups(deltaSeconds, elapsed) {
    const SPIN_SPEED = 1.2;
    const FLOAT_AMPLITUDE = 0.15;
    const FLOAT_FREQUENCY = 1.4;

    weaponPickups.forEach(({ pivot, baseY, phase }) => {
        pivot.rotation.y += SPIN_SPEED * deltaSeconds;
        pivot.position.y = baseY + Math.sin(elapsed * FLOAT_FREQUENCY + phase) * FLOAT_AMPLITUDE;
    });
}

function findRightHandBone() {
    if (!currentCharacter) return null;
    let exactMatch = null;
    currentCharacter.traverse((node) => {
        if (!exactMatch && node.name === 'mixamorig:RightHand') {
            exactMatch = node;
        }
    });

    if (exactMatch) {
        return exactMatch;
    }

    let found = null;
    currentCharacter.traverse((node) => {
        if (found) return;
        const n = node.name.toLowerCase();
        if (
            n.includes('righthand') ||
            n === 'hand.r' ||
            n === 'hand_r' ||
            n === 'rhand' ||
            n === 'r_hand'
        ) {
            found = node;
        }
    });
    return found;
}

function findRifleSockets() {
    if (!currentCharacter) return null;

    const byKey = {
        aim: null,
        idle: null,
        walk: null,
        run: null,
        default: null,
    };

    currentCharacter.traverse((node) => {
        const rawName = String(node.name || '');
        const n = rawName.toLowerCase();

        if (!n.includes('riflesocket') && !n.includes('rifle_socket')) {
            return;
        }

        if (!byKey.default || rawName === 'RifleSocket') {
            byKey.default = node;
        }

        if (!byKey.idle && (n.includes('idle') || rawName === 'RifleSocket_Idle' || rawName === 'RifleSocketIdle')) {
            byKey.idle = node;
        }

        if (!byKey.aim && (n.includes('aim') || rawName === 'RifleSocket_Aim' || rawName === 'RifleSocketAim')) {
            byKey.aim = node;
        }

        if (!byKey.walk && (n.includes('walk') || rawName === 'RifleSocket_Walk' || rawName === 'RifleSocketWalk')) {
            byKey.walk = node;
        }

        if (!byKey.run && (n.includes('run') || rawName === 'RifleSocket_Run' || rawName === 'RifleSocketRun')) {
            byKey.run = node;
        }
    });

    if (!byKey.default && !byKey.aim && !byKey.idle && !byKey.walk && !byKey.run) {
        return null;
    }

    return byKey;
}

function getRifleSocketStateForAction(actionName) {
    const n = String(actionName || '').toLowerCase();
    if (n.includes('reload')) return 'walk';
    if (n.includes('shoot')) return 'walk';
    if (n.includes('aim')) return 'walk';
    if (n.includes('run')) return 'run';
    if (n.includes('walk')) return 'walk';
    return 'idle';
}

function getCurrentActionName() {
    return activeAction?.getClip?.()?.name || '';
}

function getRifleAttachBoneForCurrentAction() {
    if (!cachedRifleSockets) {
        return { bone: null, socketState: null };
    }

    const socketState = getRifleSocketStateForAction(getCurrentActionName());
    const stateSocket = cachedRifleSockets[socketState];
    const fallbackSocket = cachedRifleSockets.default || cachedRifleSockets.idle || cachedRifleSockets.aim || cachedRifleSockets.walk || cachedRifleSockets.run;

    return {
        bone: stateSocket || fallbackSocket,
        socketState,
    };
}

function getWeaponAttachBone(weaponType) {
    if (weaponType === 'rifle') {
        const { bone: rifleSocket, socketState } = getRifleAttachBoneForCurrentAction();
        if (rifleSocket) {
            return {
                bone: rifleSocket,
                usingSocket: true,
                socketState,
            };
        }
    }

    const rightHand = findRightHandBone();
    return {
        bone: rightHand,
        usingSocket: false,
        socketState: null,
    };
}

function findLeftHandBone() {
    if (!currentCharacter) return null;
    let exactMatch = null;
    currentCharacter.traverse((node) => {
        if (!exactMatch && node.name === 'mixamorig:LeftHand') {
            exactMatch = node;
        }
    });

    if (exactMatch) {
        return exactMatch;
    }

    let found = null;
    currentCharacter.traverse((node) => {
        if (found) return;
        const n = node.name.toLowerCase();
        if (
            n.includes('lefthand') ||
            n === 'hand.l' ||
            n === 'hand_l' ||
            n === 'lhand' ||
            n === 'l_hand'
        ) {
            found = node;
        }
    });
    return found;
}

function updateHeldWeaponAlignment() {
    if (!heldWeaponPivot || !heldWeaponBone || equippedWeaponType !== 'rifle' || !cachedLeftHandBone || isUsingWeaponSocket) return;

    const leftHandWorldPos = new THREE.Vector3();
    cachedLeftHandBone.getWorldPosition(leftHandWorldPos);

    heldWeaponPivot.lookAt(leftHandWorldPos);
    heldWeaponPivot.rotateY(weaponHoldTransforms.rifle.barrelFacingOffset || 0);
    heldWeaponPivot.rotateZ(weaponHoldTransforms.rifle.barrelRoll);
}

function updateRifleSocketAttachment() {
    if (!heldWeaponPivot || !heldWeaponBone || equippedWeaponType !== 'rifle' || !isUsingWeaponSocket) return;

    const { bone: targetSocket, socketState } = getRifleAttachBoneForCurrentAction();
    if (!targetSocket) return;

    if (targetSocket !== heldWeaponBone) {
        heldWeaponBone.remove(heldWeaponPivot);
        targetSocket.add(heldWeaponPivot);
        heldWeaponBone = targetSocket;
        applyWeaponHoldTransform(heldWeaponPivot, 'rifle', true);
    }

    currentRifleSocketState = socketState;
}

function getClosestWeaponPickup(maxDistance = 2.5) {
    let closest = null;
    let closestDist = maxDistance;
    weaponPickups.forEach((entry) => {
        const d = playerRoot.position.distanceTo(entry.pivot.position);
        if (d < closestDist) {
            closestDist = d;
            closest = entry;
        }
    });
    return closest;
}

function getWeaponType(modelPath) {
    const path = String(modelPath || '').toLowerCase();
    if (path.includes('ak-47') || path.includes('m4a1')) {
        return 'rifle';
    }
    return 'handgun';
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

    const hasSkyName = /(^|[^a-z0-9])sky([^a-z0-9]|$)/i.test(meshName)
        || meshName.includes('skybox')
        || meshName.includes('skydome');

    if (hasSkyName || excludeNameHints.some((hint) => meshName.includes(hint))) {
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

    tempVectorA.subVectors(bounds.max, bounds.min);
    const localWidth = Math.abs(tempVectorA.x);
    const localHeight = Math.abs(tempVectorA.y);
    const localDepth = Math.abs(tempVectorA.z);

    mesh.getWorldScale(tempVectorB);
    const worldWidth = localWidth * Math.abs(tempVectorB.x);
    const worldHeight = localHeight * Math.abs(tempVectorB.y);
    const worldDepth = localDepth * Math.abs(tempVectorB.z);

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

function applyWeaponHoldTransform(pivot, weaponType, useSocket = false) {
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

function pickUpWeapon(entry) {
    scene.remove(entry.pivot);
    const idx = weaponPickups.indexOf(entry);
    if (idx >= 0) weaponPickups.splice(idx, 1);

    if (heldWeaponPivot && heldWeaponBone) {
        heldWeaponBone.remove(heldWeaponPivot);
        heldWeaponPivot = null;
        heldWeaponBone = null;
        heldWeaponModel = null;
        cachedMuzzleNode = null;
        currentRifleSocketState = null;
    }

    const weaponType = getWeaponType(entry.modelPath);
    cachedRifleSockets = weaponType === 'rifle' ? findRifleSockets() : null;
    const { bone: handBone, usingSocket, socketState } = getWeaponAttachBone(weaponType);
    if (!handBone) {
        console.warn('No valid weapon attach bone found (RifleSocket or RightHand).');
        equippedWeapon = null;
        hasWeaponEquipped = false;
        equippedWeaponType = null;
        equippedWeaponCombatState = null;
        isUsingWeaponSocket = false;
        cachedRifleSockets = null;
        currentRifleSocketState = null;
        updateWeaponHudValues();
        return;
    }

    const heldModel = entry.model.clone();
    heldModel.position.set(0, 0, 0);
    setShadowProperties(heldModel);

    const holdPivot = new THREE.Group();
    holdPivot.add(heldModel);

    const handWorldScale = new THREE.Vector3();
    handBone.getWorldScale(handWorldScale);
    const inverseScaleX = Math.abs(handWorldScale.x) > 0.0001 ? 1 / handWorldScale.x : 1;
    const inverseScaleY = Math.abs(handWorldScale.y) > 0.0001 ? 1 / handWorldScale.y : 1;
    const inverseScaleZ = Math.abs(handWorldScale.z) > 0.0001 ? 1 / handWorldScale.z : 1;
    holdPivot.scale.set(inverseScaleX, inverseScaleY, inverseScaleZ);

    applyWeaponHoldTransform(holdPivot, weaponType, usingSocket);
    handBone.add(holdPivot);

    heldWeaponPivot = holdPivot;
    heldWeaponBone = handBone;
    heldWeaponModel = heldModel;
    cachedMuzzleNode = findWeaponMuzzleNode(heldModel);
    isUsingWeaponSocket = usingSocket;
    currentRifleSocketState = socketState;
    equippedWeapon = entry;
    cachedLeftHandBone = findLeftHandBone();
    hasWeaponEquipped = true;
    equippedWeaponType = weaponType;
    equippedWeaponCombatState = weaponType === 'rifle'
        ? (entry.combatState || {
            magazineSize: weaponCombatDefaults.rifle.magazineSize,
            currentAmmo: weaponCombatDefaults.rifle.magazineSize,
            totalAmmo: weaponCombatDefaults.rifle.totalAmmo,
            shotsPerSecond: weaponCombatDefaults.rifle.shotsPerSecond,
            range: weaponCombatDefaults.rifle.range,
            tracerLifetime: weaponCombatDefaults.rifle.tracerLifetime,
            fireMode: weaponCombatDefaults.rifle.fireMode,
        })
        : null;

    if (equippedWeaponCombatState && equippedWeaponCombatState.fireMode !== 'SEMI') {
        equippedWeaponCombatState.fireMode = 'AUTO';
    }
    firingState.shotCooldown = 0;
    mouseState.hasSemiShotQueued = false;
    updateWeaponHudValues();

    if (!playEquipAction()) {
        if (weaponType === 'rifle' && animationBank.idleGun) {
            playAction(animationBank.idleGun);
        } else if (animationBank.idle) {
            playAction(animationBank.idle);
        }
    }

    isReloadAnimating = false;
    activeReloadActionName = null;
}

async function loadArenaMap(modelPath = '../Maps/arena_city.glb', options = {}) {
    const {
        registerGround = true,
        registerColliders = false,
        colliderFilter = (mesh) => Boolean(mesh.userData.collider) || /collider|wall|block|obstacle/i.test(mesh.name),
    } = options;

    try {
        const gltf = await loader.loadAsync(modelPath);
        const map = gltf.scene;
        map.position.set(0, FLOOR_Y_OFFSET, 0);
        map.scale.setScalar(1);
        setShadowProperties(map);
        scene.add(map);

        if (registerGround) {
            registerGroundRoot(map);
        }

        if (registerColliders) {
            registerCollisionRoot(map, { filter: colliderFilter });
        }

        return gltf;
    } catch (error) {
        console.warn('Arena map could not be loaded, using fallback ground only.', error);
        return null;
    }
}

function createWeaponCombatState(weaponType) {
    if (weaponType !== 'rifle') {
        return null;
    }

    return {
        magazineSize: weaponCombatDefaults.rifle.magazineSize,
        currentAmmo: weaponCombatDefaults.rifle.magazineSize,
        totalAmmo: weaponCombatDefaults.rifle.totalAmmo,
        shotsPerSecond: weaponCombatDefaults.rifle.shotsPerSecond,
        range: weaponCombatDefaults.rifle.range,
        tracerLifetime: weaponCombatDefaults.rifle.tracerLifetime,
        fireMode: weaponCombatDefaults.rifle.fireMode,
    };
}

createEnvironment();
setupAudioUnlockHandlers();
ensureCityMusic();
updateHudHints();
updateWeaponHudValues();
setupPauseMenuListeners();
setupDeathScreenListeners();
attachInputHandlers();
loadArenaMap('../Maps/arena_city.glb', {
    registerGround: true,
    registerColliders: true,
    colliderFilter: shouldUseAsMapCollider,
});
loadCharacterModel('../Characters/player_SWAG.glb').catch((error) => {
        console.error('Character model could not be loaded.', error);
});

const WEAPON_SPAWN_Y = FLOOR_Y_OFFSET + 1.0;
loadWeaponPickup('../Weapons/AK-47.glb', new THREE.Vector3(-6, WEAPON_SPAWN_Y, -8),  0.85);
loadWeaponPickup('../Weapons/Glock.glb',  new THREE.Vector3( 8, WEAPON_SPAWN_Y,  2),  0.30);
loadWeaponPickup('../Weapons/M4A1.glb',  new THREE.Vector3( 0, WEAPON_SPAWN_Y, -12), 0.85);

const PICKUP_SPAWN_Y = FLOOR_Y_OFFSET + 1.0;
loadUtilityPickup('../PickUps/First Aid Kit.glb', new THREE.Vector3(-10, PICKUP_SPAWN_Y, 10), {
    type: 'medkit',
    targetSize: 0.58,
    respawnSeconds: 30,
    pickupRadius: 1.35,
});
loadUtilityPickup('../PickUps/shield.glb', new THREE.Vector3(11, PICKUP_SPAWN_Y, -6), {
    type: 'shield',
    targetSize: 0.66,
    respawnSeconds: 30,
    pickupRadius: 1.35,
});
loadUtilityPickup('../PickUps/Pickup Thunder.glb', new THREE.Vector3(3, PICKUP_SPAWN_Y, 15), {
    type: 'thunder',
    targetSize: 0.72,
    respawnSeconds: 30,
    pickupRadius: 1.35,
});

updateVitalsHud();
updatePowerupsHud();
updateEnemiesHud();
updateWaveHud();
updateScoreHud();
updateTimeHud();
gameState.pendingWaveStart = true;
gameState.waveDelayRemaining = waveConfig.initialWaveDelaySeconds;
updateNextWaveCountdownHud();

handleResize();
updateThirdPersonCamera(0.016);
animate();

window.arenaScene = {
    scene,
    camera,
    renderer,
    playerRoot,
    playerState,
    cameraRig,
    movementConfig,
    loadArenaMap,
    loadCharacterModel,
    playAction,
    registerGroundMesh,
    registerGroundRoot,
    registerCollisionMesh,
    registerCollisionRoot,
    unregisterCollisionMesh,
    setGroundResolver,
    setCollisionResolver,
    loadEnemyGuard,
    setPlayerDebugVisible(visible) {
        playerCollider.visible = Boolean(visible);
    },
    get animationBank() {
        return { ...animationBank };
    },
    get animationNames() {
        return [...animationActions.keys()];
    },
};