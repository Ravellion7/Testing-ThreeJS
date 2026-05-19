import * as THREE from 'three';
import {
    audioState, audioConfig, audioListener,
    positionalAudioLoader, positionalAudioBuffers, positionalAudioLoading,
    playerRoot, enemies, playerState, gameState, weaponState,
} from './game-state.js';
import { getSavedSettings } from './settings-utils.js';

// ── Non-positional sound effect ───────────────────────────────
export function playSoundEffect(path, volume = 1) {
    if (!audioState.interactionUnlocked) return;
    const settings = getSavedSettings();
    if (settings.muteAll) return;
    const finalVolume = volume * (settings.effectsVolume / 100);
    const sound = new Audio(path);
    sound.volume = THREE.MathUtils.clamp(finalVolume, 0, 1);
    sound.play().catch(() => {});
}

// ── Positional audio helpers ──────────────────────────────────
export function loadPositionalBuffer(path) {
    const cached = positionalAudioBuffers.get(path);
    if (cached) return Promise.resolve(cached);
    const loading = positionalAudioLoading.get(path);
    if (loading) return loading;
    const promise = new Promise((resolve, reject) => {
        positionalAudioLoader.load(path,
            (buffer) => {
                positionalAudioBuffers.set(path, buffer);
                positionalAudioLoading.delete(path);
                resolve(buffer);
            },
            undefined,
            (error) => { positionalAudioLoading.delete(path); reject(error); },
        );
    });
    positionalAudioLoading.set(path, promise);
    return promise;
}

export function applyPositionalSettings(sound, volume, settings = {}) {
    sound.setRefDistance(settings.refDistance ?? audioConfig.positionalRefDistance);
    sound.setMaxDistance(settings.maxDistance ?? audioConfig.positionalMaxDistance);
    sound.setRolloffFactor(settings.rolloff ?? audioConfig.positionalRolloff);
    sound.setDistanceModel('inverse');
    sound.setVolume(THREE.MathUtils.clamp(volume, 0, 1));
}

export function playPositionalOneShot(path, volume, emitter, settings = {}) {
    if (!audioState.interactionUnlocked || !emitter) return;
    const gameSettings = getSavedSettings();
    if (gameSettings.muteAll) return;
    const finalVolume = volume * (gameSettings.effectsVolume / 100);
    loadPositionalBuffer(path).then((buffer) => {
        if (!emitter) return;
        const sound = new THREE.PositionalAudio(audioListener);
        sound.setBuffer(buffer);
        sound.setLoop(false);
        applyPositionalSettings(sound, finalVolume, settings);
        if (settings.playbackRate) {
            sound.setPlaybackRate(THREE.MathUtils.clamp(settings.playbackRate, 0.9, 1.1));
        }
        emitter.add(sound);
        sound.play();
        if (sound.source) {
            sound.source.onended = () => {
                if (sound.parent) sound.parent.remove(sound);
                sound.disconnect();
            };
        }
    }).catch(() => {});
}

// ── City music ────────────────────────────────────────────────
export function ensureCityMusic() {
    const settings = getSavedSettings();
    const targetVolume = settings.muteAll ? 0 : audioConfig.cityMusicVolume * (settings.musicVolume / 100);
    if (audioState.cityMusic) {
        audioState.cityMusic.volume = targetVolume;
        return audioState.cityMusic;
    }
    const music = new Audio('../Sounds/city_music.mp3');
    music.loop = true;
    music.volume = targetVolume;
    audioState.cityMusic = music;
    return music;
}

export function startCityMusic() {
    if (!audioState.interactionUnlocked) return;
    ensureCityMusic().play().catch(() => {});
}

export function setupAudioUnlockHandlers() {
    const unlock = () => {
        audioState.interactionUnlocked = true;
        startCityMusic();
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    startCityMusic();
}

// ── Rifle shot sounds ─────────────────────────────────────────
export function getEquippedRifleShotSoundPath() {
    const path = String(weaponState.equippedWeapon?.modelPath || '').toLowerCase();
    return path.includes('m4a1') ? '../Sounds/m4_shot.mp3' : '../Sounds/ak47_shot.mp3';
}

export function getPlayerShotEmitter() {
    return weaponState.heldWeaponPivot || weaponState.currentCharacter || playerRoot;
}

export function stopPlayerRifleLoopSound() {
    const activeKey = audioState.activePlayerRifleLoopKey;
    if (!activeKey) return;
    const sound = audioState.playerRifleLoopSfx[activeKey];
    if (sound) {
        if (sound.isPlaying) sound.stop();
        sound.parent?.remove(sound);
    }
    audioState.activePlayerRifleLoopKey = null;
}

export function startPlayerRifleLoopSound() {
    if (!audioState.interactionUnlocked) return;
    const path = getEquippedRifleShotSoundPath();
    const key = path.includes('m4') ? 'm4' : 'ak';
    const emitter = getPlayerShotEmitter();
    if (!emitter) return;

    if (audioState.activePlayerRifleLoopKey && audioState.activePlayerRifleLoopKey !== key) {
        stopPlayerRifleLoopSound();
    }
    audioState.activePlayerRifleLoopKey = key;

    loadPositionalBuffer(path).then((buffer) => {
        if (audioState.activePlayerRifleLoopKey !== key) return;
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
        if (!sound.isPlaying) sound.play();
    }).catch(() => {});
}

export function playRifleShotSoundForEnemy(enemy) {
    if (!audioState.interactionUnlocked) return;
    const now = performance.now();
    if ((now - audioState.lastEnemyRifleShotAt) < audioConfig.enemyRifleShotMinIntervalMs) return;
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

export function playEmptyMagIfReady(actorKey, emitter) {
    if (!audioState.interactionUnlocked) return;
    const now = performance.now();
    const lastAt = audioState.lastEmptyMagAt[actorKey] || 0;
    if ((now - lastAt) < 280) return;
    audioState.lastEmptyMagAt[actorKey] = now;
    playPositionalOneShot('../Sounds/empty_mag.mp3', audioConfig.emptyMagVolume, emitter, {
        refDistance: 5, maxDistance: 60, rolloff: 1.2,
    });
}

// ── Footstep audio ────────────────────────────────────────────
export function stopPlayerFootstepSound() {
    const sound = audioState.playerFootstepSfx;
    if (!sound) return;
    if (sound.isPlaying) sound.stop();
}

function hasMovementInputPressed(pressedKeys, settings) {
    return Boolean(
        pressedKeys.has(settings.controls.moveForward) || pressedKeys.has('ArrowUp') ||
        pressedKeys.has(settings.controls.moveBackward) || pressedKeys.has('ArrowDown') ||
        pressedKeys.has(settings.controls.moveLeft) || pressedKeys.has('ArrowLeft') ||
        pressedKeys.has(settings.controls.moveRight) || pressedKeys.has('ArrowRight'),
    );
}

export function updateFootstepAudio(pressedKeys) {
    if (!audioState.interactionUnlocked || gameState.isPaused) return;
    const now = performance.now();
    const settings = getSavedSettings();
    const { hasWeaponEquipped, equippedWeaponType } = weaponState;
    const isAimPressed = window._arenaMouseState?.isAimPressed ?? false;
    const isAiming = isAimPressed && hasWeaponEquipped && equippedWeaponType === 'rifle';
    const playerHorizontalSpeed = Math.hypot(playerState.velocity.x, playerState.velocity.z);
    const playerMoving = playerState.isGrounded && playerHorizontalSpeed > 1.2;
    const playerSprinting = !isAiming && hasMovementInputPressed(pressedKeys, settings)
        && (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight'));
    const interval = playerSprinting
        ? audioConfig.playerFootstepRunIntervalMs
        : audioConfig.playerFootstepWalkIntervalMs;

    if (playerMoving && (now - audioState.playerFootstepLastAt) >= interval) {
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
            if (sound.isPlaying) sound.stop();
            sound.play();
        }).catch(() => {});
    }

    enemies.forEach((enemy) => {
        if (!enemy || enemy.isDead || !enemy.isMoving) return;
        if (enemy.root.position.distanceTo(playerRoot.position) > audioConfig.enemyFootstepPlayableDistance) return;
        const lastAt = audioState.enemyFootstepLastAt.get(enemy) || 0;
        if ((now - lastAt) < audioConfig.enemyFootstepIntervalMs) return;
        audioState.enemyFootstepLastAt.set(enemy, now);
        playPositionalOneShot('../Sounds/character_footstep.mp3', audioConfig.enemyFootstepVolume, enemy.root, {
            refDistance: audioConfig.enemyFootstepRefDistance,
            maxDistance: audioConfig.enemyFootstepMaxDistance,
            rolloff: 2,
        });
    });
}
