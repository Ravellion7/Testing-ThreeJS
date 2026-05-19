import * as THREE from 'three';
import {
    scene, loader, camera, playerRoot, weaponState, firingState, mouseState, pressedKeys,
    animationActions, animationBank, mixers, weaponPickups, weaponCombatDefaults,
    shotTracers, muzzleFlashes, effectsConfig, collisionState,
    tempVectorA, tempVectorB, tempVectorC, tempBox, upAxis,
    shotRaycaster, bulletBlockerRaycaster, weaponHoldTransforms, applyWeaponHoldTransform,
    PLAYER_MODEL_Y_OFFSET, timeState,
} from './game-state.js';
import { getSavedSettings } from './settings-utils.js';
import { updateWeaponHudValues, updateWeaponHudVisibility } from './hud.js';
import {
    playPositionalOneShot, startPlayerRifleLoopSound, stopPlayerRifleLoopSound,
    getPlayerShotEmitter, playEmptyMagIfReady, getEquippedRifleShotSoundPath,
} from './audio.js';
import { playEquipAction, playReloadAction, playAction, rebuildAnimationBank } from './animations.js';
import { setShadowProperties } from './map-loader.js';
import { getWeaponType, createWeaponCombatState } from './pickups.js';

// ── Bone finders ──────────────────────────────────────────────
export function findRightHandBone() {
    if (!weaponState.currentCharacter) return null;
    let found = null;
    weaponState.currentCharacter.traverse((n) => {
        if (found) return;
        if (n.name === 'mixamorig:RightHand') { found = n; return; }
        const name = String(n.name || '').toLowerCase();
        if (name.includes('righthand') || name === 'hand.r' || name === 'hand_r' || name === 'rhand' || name === 'r_hand') found = n;
    });
    return found;
}

export function findLeftHandBone() {
    if (!weaponState.currentCharacter) return null;
    let found = null;
    weaponState.currentCharacter.traverse((n) => {
        if (found) return;
        if (n.name === 'mixamorig:LeftHand') { found = n; return; }
        const name = String(n.name || '').toLowerCase();
        if (name.includes('lefthand') || name === 'hand.l' || name === 'hand_l' || name === 'lhand' || name === 'l_hand') found = n;
    });
    return found;
}

export function findRifleSockets() {
    if (!weaponState.currentCharacter) return null;
    const by = { aim: null, idle: null, walk: null, run: null, default: null };
    weaponState.currentCharacter.traverse((n) => {
        const raw = String(n.name || ''), name = raw.toLowerCase();
        if (!name.includes('riflesocket') && !name.includes('rifle_socket')) return;
        if (!by.default || raw === 'RifleSocket') by.default = n;
        if (!by.idle && (name.includes('idle') || raw === 'RifleSocket_Idle' || raw === 'RifleSocketIdle')) by.idle = n;
        if (!by.aim && (name.includes('aim') || raw === 'RifleSocket_Aim' || raw === 'RifleSocketAim')) by.aim = n;
        if (!by.walk && (name.includes('walk') || raw === 'RifleSocket_Walk' || raw === 'RifleSocketWalk')) by.walk = n;
        if (!by.run && (name.includes('run') || raw === 'RifleSocket_Run' || raw === 'RifleSocketRun')) by.run = n;
    });
    return (!by.default && !by.aim && !by.idle && !by.walk && !by.run) ? null : by;
}

export function findWeaponMuzzleNode(root) {
    if (!root) return null;
    const hints = ['muzzle', 'barrel', 'nozzle', 'flash', 'tip', 'end'];
    let best = null;
    root.traverse((n) => {
        if (best) return;
        const name = String(n.name || '').toLowerCase();
        if (name && hints.some((h) => name.includes(h))) best = n;
    });
    return best;
}

export function getCurrentActionName() {
    return weaponState.activeAction?.getClip?.()?.name || '';
}

function getRifleSocketStateForAction(actionName) {
    const n = String(actionName || '').toLowerCase();
    if (n.includes('reload') || n.includes('shoot') || n.includes('aim') || n.includes('walk')) return 'walk';
    if (n.includes('run')) return 'run';
    return 'idle';
}

function getRifleAttachBoneForCurrentAction() {
    if (!weaponState.cachedRifleSockets) return { bone: null, socketState: null };
    const socketState = getRifleSocketStateForAction(getCurrentActionName());
    const sock = weaponState.cachedRifleSockets[socketState];
    const fallback = weaponState.cachedRifleSockets.default || weaponState.cachedRifleSockets.idle || weaponState.cachedRifleSockets.aim || weaponState.cachedRifleSockets.walk || weaponState.cachedRifleSockets.run;
    return { bone: sock || fallback, socketState };
}

export function updateRifleSocketAttachment() {
    if (!weaponState.heldWeaponPivot || !weaponState.heldWeaponBone || weaponState.equippedWeaponType !== 'rifle' || !weaponState.isUsingWeaponSocket) return;
    const { bone: target, socketState } = getRifleAttachBoneForCurrentAction();
    if (!target) return;
    if (target !== weaponState.heldWeaponBone) {
        weaponState.heldWeaponBone.remove(weaponState.heldWeaponPivot);
        target.add(weaponState.heldWeaponPivot);
        weaponState.heldWeaponBone = target;
        applyWeaponHoldTransform(weaponState.heldWeaponPivot, 'rifle', true);
    }
    weaponState.currentRifleSocketState = socketState;
}

export function updateHeldWeaponAlignment() {
    if (!weaponState.heldWeaponPivot || !weaponState.heldWeaponBone || weaponState.equippedWeaponType !== 'rifle' || !weaponState.cachedLeftHandBone || weaponState.isUsingWeaponSocket) return;
    const lhPos = new THREE.Vector3();
    weaponState.cachedLeftHandBone.getWorldPosition(lhPos);
    weaponState.heldWeaponPivot.lookAt(lhPos);
    weaponState.heldWeaponPivot.rotateY(weaponHoldTransforms.rifle.barrelFacingOffset || 0);
    weaponState.heldWeaponPivot.rotateZ(weaponHoldTransforms.rifle.barrelRoll);
}

export function getWeaponMuzzleWorldPosition(outPosition) {
    if (weaponState.cachedMuzzleNode) { weaponState.cachedMuzzleNode.getWorldPosition(outPosition); return outPosition; }
    if (weaponState.heldWeaponModel) {
        tempBox.setFromObject(weaponState.heldWeaponModel); tempBox.getCenter(outPosition);
        camera.getWorldDirection(tempVectorA); tempVectorA.y = 0;
        if (tempVectorA.lengthSq() < 0.000001) tempVectorA.set(0, 0, -1); else tempVectorA.normalize();
        const ws = new THREE.Vector3(); tempBox.getSize(ws);
        outPosition.addScaledVector(tempVectorA, Math.max(ws.z, ws.x, 0.35) * 0.5);
        return outPosition;
    }
    if (weaponState.heldWeaponPivot) { weaponState.heldWeaponPivot.getWorldPosition(outPosition); return outPosition; }
    outPosition.copy(camera.position);
    return outPosition;
}

// ── Shot tracers & muzzle flashes ─────────────────────────────
export function spawnShotTracer(start, end, lifetime) {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len <= 0.0001) return;
    dir.normalize();
    while (shotTracers.length >= effectsConfig.maxActiveShotTracers) {
        const old = shotTracers.shift();
        if (old) { scene.remove(old.line); old.line.geometry.dispose(); old.line.material?.dispose(); }
    }
    const geo = new THREE.CylinderGeometry(0.018, 0.018, len, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.95 });
    const tracer = new THREE.Mesh(geo, mat);
    tracer.frustumCulled = false;
    tracer.position.copy(new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5));
    tracer.quaternion.setFromUnitVectors(upAxis, dir);
    scene.add(tracer);
    shotTracers.push({ line: tracer, life: lifetime, maxLife: lifetime });
}

export function updateShotTracers(deltaSeconds) {
    for (let i = shotTracers.length - 1; i >= 0; i--) {
        const t = shotTracers[i]; t.life -= deltaSeconds;
        if (t.line.material) t.line.material.opacity = THREE.MathUtils.clamp(t.life / Math.max(t.maxLife, 0.0001), 0, 1);
        if (t.life > 0) continue;
        scene.remove(t.line); t.line.geometry.dispose(); t.line.material?.dispose();
        shotTracers.splice(i, 1);
    }
}

export function spawnMuzzleFlash(worldPosition) {
    while (muzzleFlashes.length >= effectsConfig.maxActiveMuzzleFlashes) {
        const old = muzzleFlashes.shift();
        if (old) { scene.remove(old.sprite); old.sprite.material.dispose(); }
    }
    const mat = new THREE.SpriteMaterial({ color: 0xffeaa6, transparent: true, opacity: 0.95, depthWrite: false, depthTest: true });
    const flash = new THREE.Sprite(mat);
    flash.position.copy(worldPosition); flash.scale.set(0.22, 0.22, 0.22);
    scene.add(flash);
    muzzleFlashes.push({ sprite: flash, life: 0.045, maxLife: 0.045 });
}

export function updateMuzzleFlashes(deltaSeconds) {
    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
        const e = muzzleFlashes[i]; e.life -= deltaSeconds;
        const ratio = THREE.MathUtils.clamp(e.life / Math.max(e.maxLife, 0.0001), 0, 1);
        e.sprite.material.opacity = 0.95 * ratio;
        const s = 0.18 + 0.1 * ratio; e.sprite.scale.set(s, s, s);
        if (e.life > 0) continue;
        scene.remove(e.sprite); e.sprite.material.dispose();
        muzzleFlashes.splice(i, 1);
    }
}

// ── Shooting ──────────────────────────────────────────────────
export function canShootRifle() {
    const { hasWeaponEquipped, equippedWeaponType, equippedWeaponCombatState } = weaponState;
    return Boolean(hasWeaponEquipped && equippedWeaponType === 'rifle' && equippedWeaponCombatState && equippedWeaponCombatState.currentAmmo > 0);
}

export function getAliveEnemyHitMeshes(enemies, enemyHitMeshOwner) {
    const meshes = [];
    enemies.forEach((enemy) => {
        if (enemy.isDead || !enemy.hitMeshes) return;
        enemy.hitMeshes.forEach((mesh) => { if (mesh.parent) meshes.push(mesh); });
    });
    return meshes;
}

import { spawnBulletImpactParticles } from './particles.js';

export function shootRifleOnce(enemies, enemyHitMeshOwner, applyDamageToEnemy, notifyServerRifleShot, isMultiplayerArenaEnabled, multiplayerState) {
    if (!canShootRifle()) return false;
    const { equippedWeaponCombatState } = weaponState;
    equippedWeaponCombatState.currentAmmo = Math.max(0, equippedWeaponCombatState.currentAmmo - 1);
    const maxRange = equippedWeaponCombatState.range || weaponCombatDefaults.rifle.range;
    camera.getWorldDirection(tempVectorA); tempVectorA.normalize();
    getWeaponMuzzleWorldPosition(tempVectorB);
    tempVectorB.addScaledVector(tempVectorA, 0.06);
    spawnMuzzleFlash(tempVectorB);
    tempVectorC.copy(tempVectorB).addScaledVector(tempVectorA, maxRange);
    bulletBlockerRaycaster.set(tempVectorB, tempVectorA); bulletBlockerRaycaster.far = maxRange;
    const blockers = bulletBlockerRaycaster.intersectObjects(collisionState.colliderMeshes.concat(collisionState.groundMeshes), false);
    let effectiveRange = maxRange, blockingPoint = null;
    if (blockers.length > 0) { effectiveRange = Math.min(effectiveRange, blockers[0].distance); blockingPoint = blockers[0].point; }
    shotRaycaster.set(tempVectorB, tempVectorA); shotRaycaster.far = effectiveRange;
    
    let hitNormal = new THREE.Vector3(0, 1, 0);
    const isServerAuth = isMultiplayerArenaEnabled() && multiplayerState.sharedArenaActive;
    if (isServerAuth) {
        notifyServerRifleShot(tempVectorA);
        if (blockingPoint) {
            tempVectorC.copy(blockingPoint);
            if (blockers[0].face) hitNormal.copy(blockers[0].face.normal).applyQuaternion(blockers[0].object.quaternion);
        }
    } else {
        const hits = shotRaycaster.intersectObjects(getAliveEnemyHitMeshes(enemies, enemyHitMeshOwner), false);
        if (hits.length > 0) {
            tempVectorC.copy(hits[0].point);
            if (hits[0].face) hitNormal.copy(hits[0].face.normal).applyQuaternion(hits[0].object.quaternion);
            const hitEnemy = enemyHitMeshOwner.get(hits[0].object.uuid);
            if (hitEnemy && !hitEnemy.isDead) applyDamageToEnemy(hitEnemy, 34);
        } else if (blockingPoint) {
            tempVectorC.copy(blockingPoint);
            if (blockers[0].face) hitNormal.copy(blockers[0].face.normal).applyQuaternion(blockers[0].object.quaternion);
        }
    }
    
    // Spawn physical spark particle effects on collision point
    spawnBulletImpactParticles(tempVectorC, hitNormal);
    
    spawnShotTracer(tempVectorB, tempVectorC, equippedWeaponCombatState.tracerLifetime || weaponCombatDefaults.rifle.tracerLifetime);
    updateWeaponHudValues();
    return true;
}

export function startRifleReload() {
    const { hasWeaponEquipped, equippedWeaponType, equippedWeaponCombatState, isEquipAnimating, isReloadAnimating } = weaponState;
    if (!hasWeaponEquipped || equippedWeaponType !== 'rifle' || !equippedWeaponCombatState) return false;
    if (isEquipAnimating || isReloadAnimating) return false;
    const magSize = Math.max(0, equippedWeaponCombatState.magazineSize || weaponCombatDefaults.rifle.magazineSize);
    const current = Math.max(0, equippedWeaponCombatState.currentAmmo || 0);
    const reserve = Math.max(0, equippedWeaponCombatState.totalAmmo || 0);
    if (current >= magSize || reserve <= 0) return false;
    const settings = getSavedSettings();
    const moving = pressedKeys.has(settings.controls.moveForward) || pressedKeys.has('ArrowUp') ||
        pressedKeys.has(settings.controls.moveBackward) || pressedKeys.has('ArrowDown') ||
        pressedKeys.has(settings.controls.moveLeft) || pressedKeys.has('ArrowLeft') ||
        pressedKeys.has(settings.controls.moveRight) || pressedKeys.has('ArrowRight');
    const clip = moving ? (animationBank.reloadWalkGun || animationBank.reloadStillGun) : (animationBank.reloadStillGun || animationBank.reloadWalkGun);
    if (!clip) return false;
    mouseState.isFirePressed = false; firingState.shotCooldown = 0;
    const started = playReloadAction(clip);
    if (started) {
        stopPlayerRifleLoopSound();
        playPositionalOneShot('../Sounds/rifle_reload2.mp3', 0.52, getPlayerShotEmitter(), { refDistance: 7, maxDistance: 85, rolloff: 1.1 });
    }
    return started;
}

export function updateWeaponFiring(deltaSeconds, enemies, enemyHitMeshOwner, applyDamageToEnemy, notifyServerRifleShot, isMultiplayerArenaEnabled, multiplayerState) {
    firingState.shotCooldown = Math.max(0, firingState.shotCooldown - deltaSeconds);
    const { hasWeaponEquipped, equippedWeaponType, equippedWeaponCombatState, isReloadAnimating, isEquipAnimating } = weaponState;
    const shouldLoop = Boolean(!isReloadAnimating && !isEquipAnimating && mouseState.isFirePressed && hasWeaponEquipped && equippedWeaponType === 'rifle' && equippedWeaponCombatState && equippedWeaponCombatState.currentAmmo > 0);
    if (shouldLoop) startPlayerRifleLoopSound(); else stopPlayerRifleLoopSound();
    if (isReloadAnimating || isEquipAnimating) return;
    if (mouseState.isFirePressed && hasWeaponEquipped && equippedWeaponType === 'rifle' && equippedWeaponCombatState && equippedWeaponCombatState.currentAmmo <= 0 && !isReloadAnimating) {
        playEmptyMagIfReady('player', getPlayerShotEmitter());
    }
    if (!mouseState.isFirePressed || !canShootRifle()) return;
    const fireMode = equippedWeaponCombatState.fireMode === 'SEMI' ? 'SEMI' : 'AUTO';
    const interval = 1 / (equippedWeaponCombatState.shotsPerSecond || weaponCombatDefaults.rifle.shotsPerSecond);
    if (fireMode === 'SEMI') {
        if (!mouseState.hasSemiShotQueued || firingState.shotCooldown > 0) return;
        if (shootRifleOnce(enemies, enemyHitMeshOwner, applyDamageToEnemy, notifyServerRifleShot, isMultiplayerArenaEnabled, multiplayerState)) { firingState.shotCooldown += interval; mouseState.hasSemiShotQueued = false; }
        return;
    }
    while (mouseState.isFirePressed && firingState.shotCooldown <= 0 && canShootRifle()) {
        if (!shootRifleOnce(enemies, enemyHitMeshOwner, applyDamageToEnemy, notifyServerRifleShot, isMultiplayerArenaEnabled, multiplayerState)) break;
        firingState.shotCooldown += interval;
    }
}

// ── Weapon equip (pickUpWeapon) ───────────────────────────────
export function pickUpWeapon(entry, weaponPickups, multiplayerState, isMultiplayerArenaEnabled, scene) {
    if (!entry || entry.isActive === false) return;
    entry.isActive = false; scene.remove(entry.pivot);
    if (!(isMultiplayerArenaEnabled() && multiplayerState.sharedArenaActive)) {
        const idx = weaponPickups.indexOf(entry);
        if (idx >= 0) weaponPickups.splice(idx, 1);
    }
    if (weaponState.heldWeaponPivot && weaponState.heldWeaponBone) {
        weaponState.heldWeaponBone.remove(weaponState.heldWeaponPivot);
        weaponState.heldWeaponPivot = null; weaponState.heldWeaponBone = null;
        weaponState.heldWeaponModel = null; weaponState.cachedMuzzleNode = null;
        weaponState.currentRifleSocketState = null;
    }
    const wType = getWeaponType(entry.modelPath);
    weaponState.cachedRifleSockets = wType === 'rifle' ? findRifleSockets() : null;
    const sockets = weaponState.cachedRifleSockets;
    const sock = sockets ? (sockets.default || sockets.idle || sockets.aim || sockets.walk || sockets.run) : null;
    const rightHand = sock || findRightHandBone();
    const usingSocket = Boolean(sock);
    if (!rightHand) {
        console.warn('No valid weapon attach bone found.');
        weaponState.equippedWeapon = null; weaponState.hasWeaponEquipped = false;
        weaponState.equippedWeaponType = null; weaponState.equippedWeaponCombatState = null;
        weaponState.isUsingWeaponSocket = false; weaponState.cachedRifleSockets = null;
        weaponState.currentRifleSocketState = null; updateWeaponHudValues(); return;
    }
    const held = entry.model.clone();
    held.position.set(0, 0, 0); setShadowProperties(held);
    const pivot = new THREE.Group(); pivot.add(held);
    const hs = new THREE.Vector3(); rightHand.getWorldScale(hs);
    pivot.scale.set(Math.abs(hs.x) > 0.0001 ? 1 / hs.x : 1, Math.abs(hs.y) > 0.0001 ? 1 / hs.y : 1, Math.abs(hs.z) > 0.0001 ? 1 / hs.z : 1);
    applyWeaponHoldTransform(pivot, wType, usingSocket);
    rightHand.add(pivot);
    weaponState.heldWeaponPivot = pivot; weaponState.heldWeaponBone = rightHand;
    weaponState.heldWeaponModel = held; weaponState.cachedMuzzleNode = findWeaponMuzzleNode(held);
    weaponState.isUsingWeaponSocket = usingSocket; weaponState.equippedWeapon = entry;
    weaponState.cachedLeftHandBone = findLeftHandBone();
    weaponState.hasWeaponEquipped = true; weaponState.equippedWeaponType = wType;
    weaponState.equippedWeaponCombatState = wType === 'rifle'
        ? (entry.combatState || createWeaponCombatState('rifle'))
        : null;
    if (weaponState.equippedWeaponCombatState && weaponState.equippedWeaponCombatState.fireMode !== 'SEMI') weaponState.equippedWeaponCombatState.fireMode = 'AUTO';
    firingState.shotCooldown = 0; mouseState.hasSemiShotQueued = false;
    updateWeaponHudValues();
    if (!playEquipAction()) {
        if (wType === 'rifle' && animationBank.idleGun) playAction(animationBank.idleGun);
        else if (animationBank.idle) playAction(animationBank.idle);
    }
    weaponState.isReloadAnimating = false; weaponState.activeReloadActionName = null;
}

export function rewardAmmoOnEnemyKill(amount = 30) {
    const { hasWeaponEquipped, equippedWeaponType, equippedWeaponCombatState } = weaponState;
    if (!hasWeaponEquipped || equippedWeaponType !== 'rifle' || !equippedWeaponCombatState) return;
    equippedWeaponCombatState.totalAmmo = Math.max(0, equippedWeaponCombatState.totalAmmo || 0) + Math.max(0, amount);
    updateWeaponHudValues();
}

// ── Character model loader ────────────────────────────────────
export async function loadCharacterModel(modelPath = '../Characters/player_SWAG.glb') {
    const gltf = await loader.loadAsync(modelPath);
    if (weaponState.currentCharacter) playerRoot.remove(weaponState.currentCharacter);
    if (weaponState.currentMixer) {
        weaponState.currentMixer.removeEventListener('finished', window._arenaHandleMixerFinished);
        const idx = mixers.indexOf(weaponState.currentMixer);
        if (idx >= 0) mixers.splice(idx, 1);
    }
    animationActions.clear();
    Object.keys(animationBank).forEach((k) => { animationBank[k] = null; });
    weaponState.activeAction = null; weaponState.lastGroundedActionName = null;
    weaponState.isEquipAnimating = false; weaponState.isReloadAnimating = false; weaponState.activeReloadActionName = null;
    if (weaponState.heldWeaponPivot && weaponState.heldWeaponBone) weaponState.heldWeaponBone.remove(weaponState.heldWeaponPivot);
    weaponState.heldWeaponPivot = null; weaponState.heldWeaponBone = null; weaponState.heldWeaponModel = null;
    weaponState.cachedMuzzleNode = null; weaponState.equippedWeapon = null;
    weaponState.hasWeaponEquipped = false; weaponState.equippedWeaponType = null;
    weaponState.equippedWeaponCombatState = null; weaponState.cachedLeftHandBone = null;
    weaponState.isUsingWeaponSocket = false; weaponState.cachedRifleSockets = null;
    weaponState.currentRifleSocketState = null; firingState.shotCooldown = 0;
    weaponState.currentCharacter = gltf.scene;
    weaponState.currentCharacter.position.set(0, PLAYER_MODEL_Y_OFFSET, 0);
    weaponState.currentCharacter.rotation.set(0, 0, 0);
    weaponState.currentCharacter.scale.setScalar(1);
    setShadowProperties(weaponState.currentCharacter);
    playerRoot.add(weaponState.currentCharacter);
    if (gltf.animations.length > 0) {
        weaponState.currentMixer = new THREE.AnimationMixer(weaponState.currentCharacter);
        weaponState.currentMixer.addEventListener('finished', window._arenaHandleMixerFinished);
        mixers.push(weaponState.currentMixer);
        gltf.animations.forEach((clip) => { animationActions.set(clip.name, weaponState.currentMixer.clipAction(clip)); });
        rebuildAnimationBank(gltf.animations);
        weaponState.lastGroundedActionName = animationBank.idle;
        if (animationBank.idle) playAction(animationBank.idle);
    }
    return gltf;
}
