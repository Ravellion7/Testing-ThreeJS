import * as THREE from 'three';
import {
    scene, loader, weaponPickups, utilityPickups,
    playerRoot, playerVitals, speedPowerupState, movementConfig, baseMovementSpeeds,
    multiplayerState, weaponState,
} from './game-state.js';
import { getSavedSettings } from './settings-utils.js';
import { updateVitalsHud, updatePowerupsHud } from './hud.js';
import { playSoundEffect } from './audio.js';
import { setShadowProperties } from './map-loader.js';

export function getHorizontalDistanceXZ(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

// ── Speed powerup ─────────────────────────────────────────────
export function applyMovementSpeedMultiplier(multiplier = 1) {
    movementConfig.walkSpeed = baseMovementSpeeds.walk * multiplier;
    movementConfig.sprintSpeed = baseMovementSpeeds.sprint * multiplier;
    movementConfig.aimSpeed = baseMovementSpeeds.aim * multiplier;
}

export function applySpeedPowerup() {
    speedPowerupState.active = true;
    speedPowerupState.timeRemaining = speedPowerupState.durationSeconds;
    applyMovementSpeedMultiplier(speedPowerupState.speedMultiplier);
    updatePowerupsHud();
}

export function applyServerSpeedBoostSnapshot(remainingSeconds) {
    const remaining = Math.max(0, Number(remainingSeconds) || 0);
    if (remaining > 0) {
        speedPowerupState.active = true;
        speedPowerupState.timeRemaining = remaining;
        applyMovementSpeedMultiplier(speedPowerupState.speedMultiplier);
        updatePowerupsHud();
        return;
    }
    if (speedPowerupState.active || speedPowerupState.timeRemaining > 0) {
        speedPowerupState.active = false;
        speedPowerupState.timeRemaining = 0;
        applyMovementSpeedMultiplier(1);
        updatePowerupsHud();
    }
}

export function updateSpeedPowerup(deltaSeconds) {
    if (!speedPowerupState.active) return;
    speedPowerupState.timeRemaining = Math.max(0, speedPowerupState.timeRemaining - deltaSeconds);
    if (speedPowerupState.timeRemaining <= 0) {
        speedPowerupState.active = false;
        speedPowerupState.timeRemaining = 0;
        applyMovementSpeedMultiplier(1);
    }
    updatePowerupsHud();
}

// ── Resource pickup (health / shield) ────────────────────────
function applyResourcePickup(resourceType) {
    const audioConfig = { regenVolume: 0.5 };
    const isHealth = resourceType === 'health';
    const current = isHealth ? playerVitals.health : playerVitals.shield;
    if (current >= playerVitals.baseMax) {
        const boosted = Math.min(playerVitals.overchargeMax, current + 25);
        if (isHealth) playerVitals.health = boosted; else playerVitals.shield = boosted;
    } else {
        if (isHealth) playerVitals.health = playerVitals.baseMax; else playerVitals.shield = playerVitals.baseMax;
    }
    updateVitalsHud();
}

export function applyUtilityPickupEffect(type) {
    if (type === 'medkit') { applyResourcePickup('health'); playSoundEffect('../Sounds/regen.mp3', 0.5); return; }
    if (type === 'shield') { applyResourcePickup('shield'); playSoundEffect('../Sounds/regen.mp3', 0.5); return; }
    if (type === 'thunder') { applySpeedPowerup(); playSoundEffect('../Sounds/powerup.mp3', 0.55); }
}

export function collectUtilityPickup(entry) {
    if (!entry || !entry.isActive) return;
    applyUtilityPickupEffect(entry.type);
    entry.isActive = false;
    entry.respawnRemaining = entry.respawnSeconds;
    scene.remove(entry.pivot);
}

export function applyPickupActiveState(entry, isActive) {
    if (!entry) return;
    entry.isActive = Boolean(isActive);
    if (entry.isActive) {
        if (!entry.pivot.parent) { entry.pivot.position.y = entry.baseY; scene.add(entry.pivot); }
    } else {
        if (entry.pivot.parent) scene.remove(entry.pivot);
    }
}

// ── Utility pickup loader ─────────────────────────────────────
export async function loadUtilityPickup(modelPath, spawnPosition, options = {}) {
    const { id = null, targetSize = 0.55, type = 'medkit', respawnSeconds = 30, pickupRadius = 1.35 } = options;
    try {
        const gltf = await loader.loadAsync(modelPath);
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3(); box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) model.scale.setScalar(targetSize / maxDim);
        const scaledBox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3(); scaledBox.getCenter(center);
        model.position.x -= center.x; model.position.z -= center.z; model.position.y -= scaledBox.min.y;
        setShadowProperties(model);
        const pivot = new THREE.Group();
        pivot.position.copy(spawnPosition);
        pivot.add(model); scene.add(pivot);
        utilityPickups.push({ id, pivot, model, type, baseY: spawnPosition.y, phase: Math.random() * Math.PI * 2, respawnSeconds, respawnRemaining: 0, pickupRadius, isActive: true, lastCollectRequestAt: 0 });
        return pivot;
    } catch (e) { console.warn(`Utility pickup failed: ${modelPath}`, e); return null; }
}

export function updateUtilityPickups(deltaSeconds, elapsed, notifyServerPickupCollect) {
    const SPIN = 1.2, AMP = 0.15, FREQ = 1.4;
    const serverAuth = multiplayerState.enabled && multiplayerState.sharedArenaActive;
    utilityPickups.forEach((entry) => {
        if (!entry.isActive) {
            if (!serverAuth) {
                entry.respawnRemaining = Math.max(0, entry.respawnRemaining - deltaSeconds);
                if (entry.respawnRemaining <= 0) {
                    entry.isActive = true; entry.respawnRemaining = 0;
                    entry.pivot.position.y = entry.baseY; scene.add(entry.pivot);
                }
            }
            return;
        }
        entry.pivot.rotation.y += SPIN * deltaSeconds;
        entry.pivot.position.y = entry.baseY + Math.sin(elapsed * FREQ + entry.phase) * AMP;
        if (serverAuth) {
            const d = getHorizontalDistanceXZ(playerRoot.position, entry.pivot.position);
            if (d <= entry.pickupRadius) {
                const now = performance.now();
                if ((now - (entry.lastCollectRequestAt || 0)) >= 250) {
                    entry.lastCollectRequestAt = now;
                    notifyServerPickupCollect(entry, 'utility');
                }
            }
            return;
        }
        if (getHorizontalDistanceXZ(playerRoot.position, entry.pivot.position) <= entry.pickupRadius) {
            collectUtilityPickup(entry);
        }
    });
}

// ── Weapon pickup loader & animation ─────────────────────────
export function getWeaponType(modelPath) {
    const p = String(modelPath || '').toLowerCase();
    return (p.includes('ak-47') || p.includes('m4a1')) ? 'rifle' : 'handgun';
}

export function createWeaponCombatState(weaponType) {
    if (weaponType !== 'rifle') return null;
    const magSize = 30;
    return { magazineSize: magSize, currentAmmo: magSize, totalAmmo: 180, shotsPerSecond: 10, range: 240, tracerLifetime: 0.07, fireMode: 'AUTO' };
}

export async function loadWeaponPickup(modelPath, spawnPosition, targetSize = 0.55, pickupId = null) {
    try {
        const gltf = await loader.loadAsync(modelPath);
        const model = gltf.scene;
        const weaponType = getWeaponType(modelPath);
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3(); box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) model.scale.setScalar(targetSize / maxDim);
        const scaledBox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3(); scaledBox.getCenter(center);
        model.position.x -= center.x; model.position.z -= center.z; model.position.y -= scaledBox.min.y;
        setShadowProperties(model);
        const pivot = new THREE.Group();
        pivot.position.copy(spawnPosition); pivot.add(model); scene.add(pivot);
        weaponPickups.push({ id: pickupId, pivot, model, modelPath, targetSize, baseY: spawnPosition.y, phase: Math.random() * Math.PI * 2, isActive: true, combatState: createWeaponCombatState(weaponType) });
        return pivot;
    } catch (e) { console.warn(`Weapon pickup failed: ${modelPath}`, e); return null; }
}

export function updateWeaponPickups(deltaSeconds, elapsed) {
    const SPIN = 1.2, AMP = 0.15, FREQ = 1.4;
    weaponPickups.forEach(({ pivot, baseY, phase, isActive }) => {
        if (isActive === false || !pivot?.parent) return;
        pivot.rotation.y += SPIN * deltaSeconds;
        pivot.position.y = baseY + Math.sin(elapsed * FREQ + phase) * AMP;
    });
}

export function getClosestWeaponPickup(maxDistance = 2.5) {
    let closest = null, closestDist = maxDistance;
    weaponPickups.forEach((entry) => {
        if (entry.isActive === false || !entry.pivot?.parent) return;
        const d = playerRoot.position.distanceTo(entry.pivot.position);
        if (d < closestDist) { closestDist = d; closest = entry; }
    });
    return closest;
}
