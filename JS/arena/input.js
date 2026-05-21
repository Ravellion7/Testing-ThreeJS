import {
    renderer, camera, scene, gameState, playerState, playerVitals, playerRoot,
    mouseState, pressedKeys, cameraRig, weaponState, firingState, audioConfig, audioState,
} from './game-state.js';
import { getSavedSettings, saveSettings } from './settings-utils.js';
import {
    pauseOverlayElement, ingameSettingsOverlayElement, continueButtonElement,
    settingsButtonElement, menuButtonElement, closeSettingsButtonElement,
    backToGameButtonElement, retryButtonElement, deathMenuButtonElement,
    deathTimeElement, deathWaveElement, deathScoreElement,
    victoryOverlayElement, victoryRetryButtonElement, victoryMenuButtonElement,
    formatHudTime, updateWeaponHudValues, updateVitalsHud, updateTimeHud, addScore
} from './hud.js';
import {
    startCityMusic, ensureCityMusic, stopPlayerRifleLoopSound, stopPlayerFootstepSound,
    playPositionalOneShot,
} from './audio.js';
import { startRifleReload, pickUpWeapon, rewardAmmoOnEnemyKill } from './weapons.js';
import { getClosestWeaponPickup } from './pickups.js';
import { leaveMultiplayerArenaSession, notifyServerPickupCollect, submitLeaderboardScore } from './multiplayer.js';
import { getHorizontalDistanceXZ } from './pickups.js';

// ── Pointer lock ──────────────────────────────────────────────
export function requestGamePointerLock() {
    if (!renderer?.domElement || document.pointerLockElement === renderer.domElement) return;
    try {
        const r = renderer.domElement.requestPointerLock();
        if (r?.catch) r.catch(() => {});
    } catch {}
}

// ── Pause / Resume ────────────────────────────────────────────
export function pauseGame() {
    if (!pauseOverlayElement || gameState.isPlayerDead) return;
    gameState.isPaused = true;
    pauseOverlayElement.classList.add('active');
    pressedKeys.clear();
    mouseState.isAimPressed = false; mouseState.isFirePressed = false;
    mouseState.hasSemiShotQueued = false; playerState.hasJumpQueued = false;
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    stopPlayerRifleLoopSound(); stopPlayerFootstepSound();
    if (audioState.cityMusic && !audioState.cityMusic.paused) { audioState.pausedCityMusicAt = true; audioState.cityMusic.pause(); }
    else audioState.pausedCityMusicAt = false;
}

export function resumeGame() {
    if (!pauseOverlayElement) return;
    gameState.isPaused = false;
    pauseOverlayElement.classList.remove('active');
    ingameSettingsOverlayElement?.classList.remove('active');
    pressedKeys.clear();
    mouseState.isAimPressed = false; mouseState.isFirePressed = false;
    mouseState.hasSemiShotQueued = false; playerState.hasJumpQueued = false; mouseState.hasMoveReference = false;
    if (audioState.pausedCityMusicAt) { startCityMusic(); audioState.pausedCityMusicAt = false; }
    requestGamePointerLock();
}

export function togglePauseGame() {
    if (gameState.isPaused) resumeGame(); else pauseGame();
}

// ── Player death ──────────────────────────────────────────────
export function handlePlayerDeath() {
    if (gameState.isPlayerDead) return;
    // Never trigger death after victory - message ordering can cause both in the same frame
    if (gameState.isVictory) return;
    gameState.isPlayerDead = true; gameState.timerRunning = false;
    pressedKeys.clear(); mouseState.isAimPressed = false; mouseState.isFirePressed = false;
    mouseState.hasSemiShotQueued = false; playerState.hasJumpQueued = false;
    stopPlayerRifleLoopSound(); stopPlayerFootstepSound();
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    pauseOverlayElement?.classList.remove('active');
    ingameSettingsOverlayElement?.classList.remove('active');
    if (deathTimeElement) deathTimeElement.textContent = formatHudTime(gameState.elapsedSeconds);
    if (deathWaveElement) deathWaveElement.textContent = `Wave ${Math.max(1, gameState.currentWave || 1)}`;
    if (deathScoreElement) deathScoreElement.textContent = String(Math.max(0, Math.floor(gameState.score || 0)));
    
    if (gameState.gameMode === 'koth') {
        const respawnOverlay = document.getElementById('respawn-overlay');
        if (respawnOverlay) respawnOverlay.style.display = 'flex';
    } else {
        document.getElementById('death-overlay')?.classList.add('active');
        submitLeaderboardScore(Math.max(0, Math.floor(gameState.score || 0)));
    }
    
    playPositionalOneShot('../Sounds/character_death.mp3', audioConfig.characterDeathVolume, playerRoot, { refDistance: 7, maxDistance: 90, rolloff: 1.2 });
}

export function applyDamageToPlayer(amount) {
    let dmg = Math.max(0, amount); if (dmg <= 0) return;
    const shieldDmg = Math.min(playerVitals.shield, dmg);
    playerVitals.shield -= shieldDmg; dmg -= shieldDmg;
    if (dmg > 0) playerVitals.health = Math.max(0, playerVitals.health - dmg);
    playPositionalOneShot('../Sounds/character_hit.mp3', audioConfig.characterHitVolume, playerRoot, { refDistance: 6, maxDistance: 70, rolloff: 1.2 });
    updateVitalsHud();
    if (playerVitals.health <= 0 && !gameState.isPlayerDead && !gameState.isVictory) window._arenaHandlePlayerDeath?.();
}

// ── Game timer ────────────────────────────────────────────────
export function updateGameTimer(deltaSeconds) {
    if (!gameState.timerRunning || gameState.isPlayerDead) return;
    gameState.elapsedSeconds += Math.max(0, deltaSeconds);
    updateTimeHud();
}

// ── Resize ────────────────────────────────────────────────────
export function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

// ── Pause menu setup ──────────────────────────────────────────
export function setupPauseMenuListeners() {
    if (!pauseOverlayElement) return;
    continueButtonElement?.addEventListener('click', () => resumeGame());
    settingsButtonElement?.addEventListener('click', () => ingameSettingsOverlayElement?.classList.add('active'));
    closeSettingsButtonElement?.addEventListener('click', () => ingameSettingsOverlayElement?.classList.remove('active'));
    backToGameButtonElement?.addEventListener('click', () => ingameSettingsOverlayElement?.classList.remove('active'));
    menuButtonElement?.addEventListener('click', () => {
        leaveMultiplayerArenaSession('Returning to main menu');
        setTimeout(() => { window.location.href = 'mainmenu.html'; }, 80);
    });
}

export function setupDeathScreenListeners() {
    retryButtonElement?.addEventListener('click', () => {
        leaveMultiplayerArenaSession('Retrying match');
        setTimeout(() => window.location.reload(), 80);
    });
    deathMenuButtonElement?.addEventListener('click', () => {
        leaveMultiplayerArenaSession('Returning to main menu');
        setTimeout(() => { window.location.href = 'mainmenu.html'; }, 80);
    });
    victoryRetryButtonElement?.addEventListener('click', () => {
        leaveMultiplayerArenaSession('Retrying match');
        setTimeout(() => window.location.reload(), 80);
    });
    victoryMenuButtonElement?.addEventListener('click', () => {
        leaveMultiplayerArenaSession('Returning to main menu');
        setTimeout(() => { window.location.href = 'mainmenu.html'; }, 80);
    });
}

// ── In-game settings modal ────────────────────────────────────
export function setupIngameSettingsModal() {
    const overlay = document.getElementById('ingame-settings-overlay');
    if (!overlay) return;
    const musicSlider = document.getElementById('ingame-music-volume');
    const musicValue = document.getElementById('ingame-music-value');
    const effectsSlider = document.getElementById('ingame-effects-volume');
    const effectsValue = document.getElementById('ingame-effects-value');
    const muteAll = document.getElementById('ingame-mute-all');
    const qualitySelect = document.getElementById('ingame-graphics-quality');
    const shadowsCb = document.getElementById('ingame-enable-shadows');
    const particlesCb = document.getElementById('ingame-enable-particles');
    const resetBtn = document.getElementById('ingame-reset-controls');

    const getFriendly = (c) => {
        if (!c) return 'NONE';
        if (c.startsWith('Key')) return c.slice(3);
        if (c.startsWith('Digit')) return c.slice(5);
        const map = { Space: 'Space', ArrowUp: 'Arrow Up', ArrowDown: 'Arrow Down', ArrowLeft: 'Arrow Left', ArrowRight: 'Arrow Right', Mouse0: 'Left Mouse', Mouse1: 'Middle Mouse', Mouse2: 'Right Mouse' };
        return map[c] || c;
    };
    const setSlidersDisabled = (d) => {
        if (d) { musicSlider?.setAttribute('disabled', 'true'); effectsSlider?.setAttribute('disabled', 'true'); }
        else { musicSlider?.removeAttribute('disabled'); effectsSlider?.removeAttribute('disabled'); }
    };
    const populateUI = () => {
        const s = getSavedSettings();
        if (musicSlider) { musicSlider.value = s.musicVolume; if (musicValue) musicValue.textContent = s.musicVolume + '%'; }
        if (effectsSlider) { effectsSlider.value = s.effectsVolume; if (effectsValue) effectsValue.textContent = s.effectsVolume + '%'; }
        if (muteAll) { muteAll.checked = s.muteAll; setSlidersDisabled(s.muteAll); }
        document.querySelectorAll('.ingame-key-bind-btn').forEach((b) => { const a = b.dataset.action; if (a && s.controls[a]) b.textContent = getFriendly(s.controls[a]); });
        if (qualitySelect) qualitySelect.value = s.graphics.quality;
        if (shadowsCb) shadowsCb.checked = s.graphics.shadows;
        if (particlesCb) particlesCb.checked = s.graphics.particles;
    };
    populateUI();
    document.getElementById('settings-btn')?.addEventListener('click', populateUI);
    musicSlider?.addEventListener('input', (e) => { const s = getSavedSettings(); s.musicVolume = parseInt(e.target.value); if (musicValue) musicValue.textContent = s.musicVolume + '%'; saveSettings(s); ensureCityMusic(); });
    effectsSlider?.addEventListener('input', (e) => { const s = getSavedSettings(); s.effectsVolume = parseInt(e.target.value); if (effectsValue) effectsValue.textContent = s.effectsVolume + '%'; saveSettings(s); });
    muteAll?.addEventListener('change', (e) => { const s = getSavedSettings(); s.muteAll = e.target.checked; setSlidersDisabled(s.muteAll); saveSettings(s); ensureCityMusic(); });
    qualitySelect?.addEventListener('change', (e) => { const s = getSavedSettings(); s.graphics.quality = e.target.value; saveSettings(s); });
    shadowsCb?.addEventListener('change', (e) => { const s = getSavedSettings(); s.graphics.shadows = e.target.checked; saveSettings(s); });
    particlesCb?.addEventListener('change', (e) => { const s = getSavedSettings(); s.graphics.particles = e.target.checked; saveSettings(s); });
    resetBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const s = getSavedSettings();
        s.controls = { moveForward: 'KeyW', moveLeft: 'KeyA', moveBackward: 'KeyS', moveRight: 'KeyD', use: 'KeyE', shoot: 'Mouse0', reload: 'KeyR' };
        saveSettings(s); populateUI();
    });

    // Key bind modal
    let activeBtn = null;
    const modal = document.createElement('div');
    modal.id = 'ingame-key-bind-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;z-index:10000';
    modal.innerHTML = `<div style="background:#110d0a;border:2px solid #daa520;padding:30px;text-align:center;font-family:monospace;color:#fff;box-shadow:0 0 20px rgba(218,165,32,.3)"><h3 style="color:#daa520;margin-top:0">Press any key...</h3><p>Press the key you want to assign</p><button id="ingame-cancel-bind" style="background:#2d2418;border:1px solid #a8906e;color:#d4c5a9;padding:8px 16px;cursor:pointer;margin-top:15px;font-family:monospace">Cancel</button></div>`;
    document.body.appendChild(modal);
    const closeModal = () => { modal.style.display = 'none'; activeBtn = null; window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onMouse); };
    document.getElementById('ingame-cancel-bind')?.addEventListener('click', (e) => { e.stopPropagation(); closeModal(); });
    document.querySelectorAll('.ingame-key-bind-btn').forEach((b) => { b.addEventListener('click', () => { activeBtn = b; modal.style.display = 'flex'; window.addEventListener('keydown', onKey); window.addEventListener('mousedown', onMouse); }); });
    function onKey(e) { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { closeModal(); return; } if (activeBtn) { const s = getSavedSettings(); s.controls[activeBtn.dataset.action] = e.code; saveSettings(s); activeBtn.textContent = getFriendly(e.code); closeModal(); } }
    function onMouse(e) {
        if (e.target.id === 'ingame-cancel-bind' || e.target.closest('#ingame-cancel-bind')) return;
        e.preventDefault(); e.stopPropagation();
        if (activeBtn) { const s = getSavedSettings(); const mc = 'Mouse' + e.button; s.controls[activeBtn.dataset.action] = mc; saveSettings(s); activeBtn.textContent = getFriendly(mc); closeModal(); }
    }
}

// ── Input handler attachment ──────────────────────────────────
export function attachInputHandlers(utilityPickups, weaponPickups, multiplayerState, isMultiplayerArenaEnabled) {

    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    renderer.domElement.addEventListener('click', () => requestGamePointerLock());

    renderer.domElement.addEventListener('mousedown', (e) => {
        const bind = getSavedSettings().controls.shoot;
        const isMouseShoot = bind.startsWith('Mouse');
        const btn = isMouseShoot ? parseInt(bind.slice(5)) : 0;
        if ((isMouseShoot && e.button === btn) || (!isMouseShoot && e.button === 0)) { mouseState.isFirePressed = true; mouseState.hasSemiShotQueued = true; }
        if (e.button === 2) { e.preventDefault(); mouseState.isAimPressed = true; }
    });

    window.addEventListener('mouseup', (e) => {
        const bind = getSavedSettings().controls.shoot;
        const isMouseShoot = bind.startsWith('Mouse');
        const btn = isMouseShoot ? parseInt(bind.slice(5)) : 0;
        if ((isMouseShoot && e.button === btn) || (!isMouseShoot && e.button === 0)) mouseState.isFirePressed = false;
        if (e.button === 2) mouseState.isAimPressed = false;
    });

    renderer.domElement.addEventListener('mouseenter', () => { mouseState.isHoveringCanvas = true; mouseState.hasMoveReference = false; });
    renderer.domElement.addEventListener('mouseleave', () => { mouseState.isHoveringCanvas = false; mouseState.hasMoveReference = false; });

    document.addEventListener('pointerlockchange', () => {
        mouseState.pointerLockActive = document.pointerLockElement === renderer.domElement;
        mouseState.hasMoveReference = false;
        if (!mouseState.pointerLockActive && !gameState.isPaused && !gameState.isPlayerDead) pauseGame();
    });

    window.addEventListener('mousemove', (e) => {
        let dx = 0, dy = 0;
        if (mouseState.pointerLockActive) { dx = e.movementX; dy = e.movementY; }
        else {
            if (!mouseState.isHoveringCanvas) return;
            if (!mouseState.hasMoveReference) { mouseState.lastX = e.clientX; mouseState.lastY = e.clientY; mouseState.hasMoveReference = true; return; }
            dx = e.clientX - mouseState.lastX; dy = e.clientY - mouseState.lastY;
            mouseState.lastX = e.clientX; mouseState.lastY = e.clientY;
        }
        cameraRig.yaw -= dx * mouseState.sensitivity;
        cameraRig.pitch = Math.max(-1.1, Math.min(1.1, cameraRig.pitch - dy * mouseState.sensitivity));
    });

    renderer.domElement.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    window.addEventListener('keydown', (e) => {
        if (gameState.isPlayerDead) return;
        if (e.code === 'Escape' && !e.repeat) {
            e.preventDefault();
            if (gameState.isPaused && ingameSettingsOverlayElement?.classList.contains('active')) { ingameSettingsOverlayElement.classList.remove('active'); return; }
            togglePauseGame(); return;
        }
        if (gameState.isPaused) return;
        pressedKeys.add(e.code);
        const settings = getSavedSettings();
        if (e.code === settings.controls.shoot) { mouseState.isFirePressed = true; mouseState.hasSemiShotQueued = true; }
        if (e.code === 'Space') {
            e.preventDefault();
            if (playerState.isGrounded) {
                playPositionalOneShot('../Sounds/player_jump.mp3', audioConfig.jumpVolume, playerRoot, { refDistance: 6, maxDistance: 70, rolloff: 1.2 });
            }
            playerState.hasJumpQueued = true;
        }
        if (e.code === settings.controls.use) {
            const nearby = getClosestWeaponPickup();
            if (nearby) { notifyServerPickupCollect(nearby, 'weapon'); pickUpWeapon(nearby, weaponPickups, multiplayerState, isMultiplayerArenaEnabled, scene); }
            if (isMultiplayerArenaEnabled() && multiplayerState.sharedArenaActive) {
                const nu = utilityPickups.find((entry) => entry?.id && entry.isActive && entry.pivot?.parent && getHorizontalDistanceXZ(playerRoot.position, entry.pivot.position) <= (entry.pickupRadius || 1.35));
                if (nu) { nu.lastCollectRequestAt = performance.now(); notifyServerPickupCollect(nu, 'utility'); }
            }
        }
        if (e.code === settings.controls.reload && !e.repeat) { e.preventDefault(); startRifleReload(); }
        if (e.code === 'KeyX' && !e.repeat) {
            e.preventDefault();
            const { equippedWeaponCombatState, hasWeaponEquipped, equippedWeaponType } = weaponState;
            if (!hasWeaponEquipped || equippedWeaponType !== 'rifle' || !equippedWeaponCombatState) return;
            equippedWeaponCombatState.fireMode = equippedWeaponCombatState.fireMode === 'SEMI' ? 'AUTO' : 'SEMI';
            firingState.shotCooldown = 0; mouseState.isFirePressed = false; mouseState.hasSemiShotQueued = false;
            updateWeaponHudValues();
        }
    });

    window.addEventListener('keyup', (e) => {
        pressedKeys.delete(e.code);
        if (e.code === getSavedSettings().controls.shoot) mouseState.isFirePressed = false;
    });

    window.addEventListener('blur', () => {
        pressedKeys.clear(); stopPlayerRifleLoopSound(); stopPlayerFootstepSound();
        mouseState.pointerLockActive = false; mouseState.hasMoveReference = false;
        mouseState.isHoveringCanvas = false; mouseState.isAimPressed = false;
        mouseState.isFirePressed = false; mouseState.hasSemiShotQueued = false; playerState.hasJumpQueued = false;
    });

    window.addEventListener('resize', handleResize);

    window._arenaMouseState = mouseState;
    window._arenaPlayerState = playerState;
    window._arenaHandlePlayerDeath = handlePlayerDeath;
    window._arenaApplyDamageToPlayer = applyDamageToPlayer;
    window._arenaStopPlayerLoops = () => {
        pressedKeys.clear();
        mouseState.isAimPressed = false;
        mouseState.isFirePressed = false;
        mouseState.hasSemiShotQueued = false;
        playerState.hasJumpQueued = false;
        stopPlayerRifleLoopSound();
        stopPlayerFootstepSound();
    };
    window._arenaSubmitScore = () => {
        submitLeaderboardScore(Math.max(0, Math.floor(gameState.score || 0)));
    };
    window._arenaRewardAmmoOnKill = () => {
        rewardAmmoOnEnemyKill(30);
    };
    window._arenaAddScore = (amount) => {
        addScore(amount);
    };
}
