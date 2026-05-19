import * as THREE from 'three';
import {
    gameState, playerVitals, speedPowerupState, multiplayerState, weaponState,
} from './game-state.js';

// ── DOM element references ────────────────────────────────────
export const crosshairElement = document.querySelector('.center-crosshair');
export const weaponHudElement = document.querySelector('.hud-bottom-right');
export const ammoCurrentElement = document.getElementById('ammo-current');
export const ammoTotalElement = document.getElementById('ammo-total');
export const fireModeElement = document.getElementById('fire-mode');
export const healthFillElement = document.getElementById('health-fill');
export const healthValueElement = document.getElementById('health-value');
export const shieldFillElement = document.getElementById('shield-fill');
export const shieldValueElement = document.getElementById('shield-value');
export const powerupsListElement = document.getElementById('powerups-list');
export const speedPowerupIconElement = document.getElementById('speed-powerup-icon');
export const enemiesRemainingElement = document.getElementById('enemies-remaining');
export const waveElement = document.getElementById('wave');
export const nextWaveCountdownElement = document.getElementById('next-wave-countdown');
export const scoreElement = document.getElementById('score');
export const timeElement = document.getElementById('time');
export const pauseOverlayElement = document.getElementById('pause-overlay');
export const continueButtonElement = document.getElementById('continue-btn');
export const settingsButtonElement = document.getElementById('settings-btn');
export const menuButtonElement = document.getElementById('menu-btn');
export const ingameSettingsOverlayElement = document.getElementById('ingame-settings-overlay');
export const closeSettingsButtonElement = document.getElementById('close-settings-btn');
export const backToGameButtonElement = document.getElementById('back-to-game-btn');
export const deathOverlayElement = document.getElementById('death-overlay');
export const deathTimeElement = document.getElementById('death-time');
export const deathWaveElement = document.getElementById('death-wave');
export const deathScoreElement = document.getElementById('death-score');
export const retryButtonElement = document.getElementById('retry-btn');
export const deathMenuButtonElement = document.getElementById('death-menu-btn');

// ── Formatters ────────────────────────────────────────────────
export function formatHudTime(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ── HUD update functions ──────────────────────────────────────
export function updateVitalsHud() {
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

export function updatePowerupsHud() {
    if (speedPowerupIconElement) {
        speedPowerupIconElement.classList.toggle('active', speedPowerupState.active);
    }
    if (!powerupsListElement) return;
    powerupsListElement.innerHTML = '';
    if (!speedPowerupState.active) return;
    const itemElement = document.createElement('div');
    itemElement.className = 'powerup-item speed-boost';
    const label = document.createElement('div');
    label.textContent = `Speed Boost (${Math.ceil(speedPowerupState.timeRemaining)}s)`;
    itemElement.append(label);
    powerupsListElement.appendChild(itemElement);
}

export function updateWeaponHudValues() {
    if (!ammoCurrentElement || !ammoTotalElement || !fireModeElement) return;
    const { hasWeaponEquipped, equippedWeaponType, equippedWeaponCombatState } = weaponState;
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

export function updateWeaponHudVisibility() {
    if (!weaponHudElement) return;
    const { hasWeaponEquipped, equippedWeaponType } = weaponState;
    weaponHudElement.classList.toggle('active', hasWeaponEquipped && equippedWeaponType === 'rifle');
}

export function updateCrosshairVisibility() {
    if (!crosshairElement) return;
    const { hasWeaponEquipped } = weaponState;
    crosshairElement.classList.toggle('active', hasWeaponEquipped && isAimActive());
}

// NOTE: isAimActive is imported lazily to avoid circular deps with weapons.js
function isAimActive() {
    const { hasWeaponEquipped, equippedWeaponType } = weaponState;
    return (
        (window._arenaMouseState?.isAimPressed ?? false) &&
        hasWeaponEquipped &&
        equippedWeaponType === 'rifle'
    );
}

export function updateScoreHud() {
    if (!scoreElement) return;
    scoreElement.textContent = String(Math.max(0, Math.floor(gameState.score)));
}

export function updateTimeHud() {
    if (!timeElement) return;
    timeElement.textContent = formatHudTime(gameState.elapsedSeconds);
}

export function updateEnemiesHud() {
    if (!enemiesRemainingElement) return;
    const remainingEnemies = Math.max(0, gameState.currentWaveTargetKills - gameState.currentWaveKills);
    enemiesRemainingElement.textContent = String(remainingEnemies);
}

export function updateWaveHud() {
    if (!waveElement) return;
    waveElement.textContent = String(Math.max(1, gameState.currentWave || 1));
}

export function updateNextWaveCountdownHud() {
    if (!nextWaveCountdownElement) return;
    const shouldShow = gameState.pendingWaveStart
        && !gameState.isPlayerDead
        && gameState.waveDelayRemaining > 0
        && (!multiplayerState.enabled || multiplayerState.matchStarted);
    nextWaveCountdownElement.classList.toggle('active', shouldShow);
    if (!shouldShow) {
        nextWaveCountdownElement.textContent = '';
        return;
    }
    nextWaveCountdownElement.textContent = `Next wave in: ${Math.ceil(gameState.waveDelayRemaining)}s`;
}

export function addScore(points) {
    gameState.score += Math.max(0, points);
    updateScoreHud();
}

export function updateHudHints() {
    const notificationPanel = document.getElementById('notification-panel');
    if (!notificationPanel) return;
    notificationPanel.classList.add('active');
    notificationPanel.innerHTML = [
        'WASD move relative to camera', 'Shift sprint', 'Right click aim',
        'Space jump', 'E pick up weapon', 'X toggle fire mode (AUTO/SEMI)',
        'Collect pickups by touching them', 'Move mouse to look around',
        'Left click to lock cursor',
    ].map((text) => `<div class="notification-message">${text}</div>`).join('');
}

export function showMultiplayerAnnouncement(text) {
    const cont = document.getElementById('announcement-container') || (() => {
        const el = document.createElement('div');
        el.id = 'announcement-container';
        el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:10px;z-index:10000;align-items:center;pointer-events:none';
        document.body.appendChild(el);
        return el;
    })();

    const toast = document.createElement('div');
    toast.style.cssText = 'background:rgba(17,13,10,.85);border:1px solid #daa520;box-shadow:0 0 15px rgba(218,165,32,.25);border-radius:6px;padding:12px 24px;color:#fff;font-family:monospace;font-size:14px;letter-spacing:.05em;text-transform:uppercase;animation:fade-in-out 4s forwards;text-shadow:0 0 4px rgba(218,165,32,.5);pointer-events:none;transform:translateY(-20px);opacity:0;transition:all .3s ease';
    toast.innerHTML = text;
    cont.appendChild(toast);

    if (!document.getElementById('announcement-styles')) {
        const style = document.createElement('style');
        style.id = 'announcement-styles';
        style.textContent = `@keyframes fade-in-out{0%{transform:translateY(-20px);opacity:0}10%{transform:translateY(0);opacity:1}90%{transform:translateY(0);opacity:1}100%{transform:translateY(-10px);opacity:0}}`;
        document.head.appendChild(style);
    }
    setTimeout(() => toast.remove(), 4000);
}
