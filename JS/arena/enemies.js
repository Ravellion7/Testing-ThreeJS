import * as THREE from 'three';
import {
    scene, loader, enemies, enemyHitMeshOwner, mixers,
    enemyConfig, waveConfig, gameState, playerRoot, playerCollider,
    collisionState, tempVectorA, tempVectorB, tempBox, upAxis,
    enemySightRaycaster, enemyShotRaycaster, bulletBlockerRaycaster,
    FLOOR_Y_OFFSET, PLAYER_MODEL_Y_OFFSET, applyWeaponHoldTransform, maxWaves,
} from './game-state.js';
import { updateEnemiesHud, updateWaveHud, updateNextWaveCountdownHud, addScore } from './hud.js';
import { playPositionalOneShot, playRifleShotSoundForEnemy, playEmptyMagIfReady } from './audio.js';
import { buildEnemyAnimationBank } from './animations.js';
import { getGroundHeightAt, resolveEnemyHorizontalCollisions } from './collision.js';
import { setShadowProperties } from './map-loader.js';
import { rewardAmmoOnEnemyKill, spawnMuzzleFlash, spawnShotTracer, findWeaponMuzzleNode } from './weapons.js';

// ── Enemy socket finders ──────────────────────────────────────
function findEnemyRifleSockets(root) {
    const sockets = { reload: null, death: null };
    if (!root) return sockets;
    root.traverse((n) => {
        const raw = String(n.name || ''), name = raw.toLowerCase();
        if (!sockets.reload && (raw === 'RifleEnemySocket_Reload' || name.includes('rifleenemysocket_reload'))) sockets.reload = n;
        if (!sockets.death && (raw === 'RifleEnemySocket_Death' || name.includes('rifleenemysocket_death'))) sockets.death = n;
    });
    return sockets;
}

// ── Enemy animation actions ───────────────────────────────────
export function playEnemyAction(enemy, name, options = {}) {
    if (!enemy || !name) return false;
    const { transitionSeconds = 0.15, loopOnce = false } = options;
    const next = enemy.animationActions.get(name);
    if (!next || next === enemy.activeAction) return false;
    if (enemy.activeAction) enemy.activeAction.fadeOut(transitionSeconds);
    next.reset();
    next.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, loopOnce ? 1 : Infinity);
    next.clampWhenFinished = loopOnce;
    next.fadeIn(transitionSeconds).play();
    enemy.activeAction = next;
    return true;
}

function getEnemySocketKeyForAction(actionName) {
    return String(actionName || '').toLowerCase().includes('death') ? 'death' : 'reload';
}

export function updateEnemyWeaponSocketAttachment(enemy) {
    if (!enemy?.weaponPivot || !enemy?.weaponSockets) return;
    const key = getEnemySocketKeyForAction(enemy.activeAction?.getClip?.()?.name || '');
    const target = enemy.weaponSockets[key] || enemy.weaponSockets.reload || enemy.weaponSockets.death;
    if (!target) return;
    if (enemy.weaponBone !== target) {
        enemy.weaponBone?.remove(enemy.weaponPivot);
        target.add(enemy.weaponPivot);
        enemy.weaponBone = target;
        applyWeaponHoldTransform(enemy.weaponPivot, 'rifle', true);
    }
}

// ── Enemy hit meshes ──────────────────────────────────────────
function registerEnemyHitMeshes(enemy) {
    enemy.hitMeshes = [];
    enemy.root.traverse((n) => {
        if (!n.isMesh) return;
        enemy.hitMeshes.push(n);
        enemyHitMeshOwner.set(n.uuid, enemy);
    });
}

// ── Damage ────────────────────────────────────────────────────
export function applyDamageToEnemy(enemy, amount) {
    if (!enemy || enemy.isDead) return;
    enemy.health = Math.max(0, enemy.health - Math.max(0, amount));
    if (enemy.health > 0) {
        playPositionalOneShot('../Sounds/character_hit.mp3', 0.55, enemy.root, { refDistance: 6, maxDistance: 70, rolloff: 1.2 });
        return;
    }
    enemy.isDead = true; enemy.state = 'dead';
    enemy.isReloading = false; enemy.reloadActionName = null; enemy.reloadTimeRemaining = 0;
    if (enemy.animationBank.deathGun) playEnemyAction(enemy, enemy.animationBank.deathGun, { transitionSeconds: 0.12, loopOnce: true });
    playPositionalOneShot('../Sounds/character_death.mp3', 0.62, enemy.root, { refDistance: 7, maxDistance: 90, rolloff: 1.2 });
    addScore(100); rewardAmmoOnEnemyKill(30); registerEnemyKillForWaveProgress();
    updateEnemyWeaponSocketAttachment(enemy); updateEnemiesHud();
}

// ── Enemy muzzle ──────────────────────────────────────────────
function getEnemyMuzzleWorldPosition(enemy, out) {
    if (enemy.cachedMuzzleNode) { enemy.cachedMuzzleNode.getWorldPosition(out); return out; }
    if (enemy.weaponModel) { tempBox.setFromObject(enemy.weaponModel); tempBox.getCenter(out); return out; }
    if (enemy.weaponPivot) { enemy.weaponPivot.getWorldPosition(out); return out; }
    enemy.root.getWorldPosition(out); out.y += 1.35; return out;
}

// ── Enemy reload ──────────────────────────────────────────────
function completeEnemyReload(enemy) {
    if (!enemy?.isReloading || enemy.isDead) return;
    const needed = Math.max(0, enemyConfig.magazineSize - enemy.ammoInMag);
    const load = Math.min(needed, enemy.ammoReserve);
    enemy.ammoInMag += load; enemy.ammoReserve -= load;
    enemy.isReloading = false; enemy.reloadActionName = null; enemy.reloadTimeRemaining = 0;
}

function startEnemyReload(enemy, moving) {
    if (!enemy || enemy.isDead || enemy.isReloading) return false;
    if (enemy.ammoInMag > 0 || enemy.ammoReserve <= 0) return false;
    const clip = moving ? (enemy.animationBank.reloadWalkGun || enemy.animationBank.reloadStillGun) : (enemy.animationBank.reloadStillGun || enemy.animationBank.reloadWalkGun);
    if (!clip) return false;
    enemy.isReloading = true; enemy.reloadActionName = clip; enemy.reloadTimeRemaining = enemyConfig.reloadDurationSafety;
    playEnemyAction(enemy, clip, { transitionSeconds: 0.1, loopOnce: true });
    playPositionalOneShot('../Sounds/rifle_reload2.mp3', 0.52, enemy.root, { refDistance: 7, maxDistance: 85, rolloff: 1.1 });
    return true;
}

function handleEnemyMixerFinished(enemy, event) {
    if (!enemy || !event?.action) return;
    if (enemy.isReloading) {
        const ra = enemy.reloadActionName ? enemy.animationActions.get(enemy.reloadActionName) : null;
        if (ra && event.action === ra) completeEnemyReload(enemy);
    }
}

// ── Enemy LOS ─────────────────────────────────────────────────
function enemyHasLineOfSight(enemy, dist) {
    if (!enemy || enemy.isDead || dist > enemyConfig.sightRadius) return false;
    const origin = new THREE.Vector3(), target = new THREE.Vector3();
    getEnemyMuzzleWorldPosition(enemy, origin);
    target.copy(playerRoot.position); target.y += 1.1;
    tempVectorA.subVectors(target, origin);
    const d = tempVectorA.length();
    if (d <= 0.001) return true;
    tempVectorA.normalize();
    enemySightRaycaster.set(origin, tempVectorA); enemySightRaycaster.far = d;
    return enemySightRaycaster.intersectObjects(collisionState.colliderMeshes, false).length === 0;
}

// ── Patrol ────────────────────────────────────────────────────
function pickEnemyPatrolTarget(enemy) {
    const angle = Math.random() * Math.PI * 2;
    const dist = enemyConfig.patrolRadius * (0.35 + Math.random() * 0.65);
    const target = new THREE.Vector3(enemy.spawnPosition.x + Math.cos(angle) * dist, enemy.root.position.y, enemy.spawnPosition.z + Math.sin(angle) * dist);
    target.y = getGroundHeightAt(target);
    enemy.patrolTarget = target;
}

function updateEnemyPatrolMovement(enemy, deltaSeconds) {
    if (!enemy.patrolTarget) pickEnemyPatrolTarget(enemy);
    tempVectorA.subVectors(enemy.patrolTarget, enemy.root.position); tempVectorA.y = 0;
    const dist = tempVectorA.length();
    if (dist <= enemyConfig.patrolReachDistance) {
        enemy.patrolIdleTime = Math.max(0, (enemy.patrolIdleTime || 0) - deltaSeconds);
        if (enemy.patrolIdleTime <= 0) { enemy.patrolIdleTime = 0.6 + Math.random() * 1.2; pickEnemyPatrolTarget(enemy); }
        return false;
    }
    tempVectorB.copy(tempVectorA).normalize();
    const step = Math.min(dist, enemyConfig.patrolSpeed * deltaSeconds);
    const start = enemy.root.position.clone();
    const candidate = start.clone().addScaledVector(tempVectorB, step);
    const resolved = resolveEnemyHorizontalCollisions(enemy, start, candidate);
    enemy.root.position.x = resolved.x; enemy.root.position.z = resolved.z;
    enemy.root.position.y = getGroundHeightAt(enemy.root.position);
    const movedDist = Math.sqrt((enemy.root.position.x - start.x) ** 2 + (enemy.root.position.z - start.z) ** 2);
    if (movedDist > 0.001) {
        enemy.facingAngle = Math.atan2(enemy.root.position.x - start.x, enemy.root.position.z - start.z);
        enemy.root.rotation.y = enemy.facingAngle; enemy.blockedRepathCooldown = 0; return true;
    }
    enemy.blockedRepathCooldown = Math.max(0, (enemy.blockedRepathCooldown || 0) - deltaSeconds);
    if (enemy.blockedRepathCooldown <= 0) { enemy.patrolTarget = null; enemy.blockedRepathCooldown = 0.14 + Math.random() * 0.12; }
    return false;
}

// ── Enemy shoot ───────────────────────────────────────────────
function enemyShootPlayer(enemy) {
    if (!enemy || enemy.isDead || enemy.isReloading || enemy.ammoInMag <= 0) return;
    const origin = new THREE.Vector3(), target = new THREE.Vector3().copy(playerRoot.position);
    target.y += 1.1; getEnemyMuzzleWorldPosition(enemy, origin);
    tempVectorA.subVectors(target, origin);
    const shotDist = Math.min(tempVectorA.length(), enemyConfig.shootRange);
    if (shotDist <= 0.0001) return;
    playRifleShotSoundForEnemy(enemy);
    tempVectorA.normalize();
    const willHit = Math.random() < enemyConfig.accuracyChance;
    if (!willHit) {
        const hPerp = new THREE.Vector3().crossVectors(tempVectorA, upAxis).normalize();
        const vPerp = new THREE.Vector3().crossVectors(hPerp, tempVectorA).normalize();
        tempVectorA.addScaledVector(hPerp, (Math.random() * 2 - 1) * enemyConfig.missSpreadStrength)
            .addScaledVector(vPerp, (Math.random() * 2 - 1) * enemyConfig.missSpreadStrength).normalize();
    }
    bulletBlockerRaycaster.set(origin, tempVectorA); bulletBlockerRaycaster.far = shotDist;
    const blockers = bulletBlockerRaycaster.intersectObjects(collisionState.colliderMeshes.concat(collisionState.groundMeshes), false);
    let effectiveRange = shotDist, blockingPoint = null;
    if (blockers.length > 0) { effectiveRange = Math.min(effectiveRange, blockers[0].distance); blockingPoint = blockers[0].point; }
    const tracerEnd = new THREE.Vector3().copy(origin).addScaledVector(tempVectorA, effectiveRange);
    if (willHit) {
        enemyShotRaycaster.set(origin, tempVectorA); enemyShotRaycaster.far = effectiveRange;
        const hits = enemyShotRaycaster.intersectObject(playerCollider, false);
        if (hits.length > 0) { tracerEnd.copy(hits[0].point); window._arenaApplyDamageToPlayer?.(enemyConfig.damagePerShot); }
    } else if (blockingPoint) tracerEnd.copy(blockingPoint);
    spawnMuzzleFlash(origin); spawnShotTracer(origin, tracerEnd, 0.06);
    enemy.ammoInMag = Math.max(0, enemy.ammoInMag - 1);
}

// ── Enemy update ──────────────────────────────────────────────
function updateEnemy(enemy, deltaSeconds) {
    if (!enemy) return;
    enemy.isMoving = false; updateEnemyWeaponSocketAttachment(enemy);
    if (enemy.isDead) return;
    const distToPlayer = enemy.root.position.distanceTo(playerRoot.position);
    enemy.state = enemyHasLineOfSight(enemy, distToPlayer) ? 'engage' : 'patrol';
    if (enemy.isReloading) {
        enemy.reloadTimeRemaining = Math.max(0, enemy.reloadTimeRemaining - deltaSeconds);
        if (enemy.reloadTimeRemaining <= 0) completeEnemyReload(enemy);
    }
    if (enemy.state === 'engage') {
        tempVectorA.subVectors(playerRoot.position, enemy.root.position); tempVectorA.y = 0;
        if (tempVectorA.lengthSq() > 0.0001) {
            tempVectorA.normalize();
            enemy.facingAngle = Math.atan2(tempVectorA.x, tempVectorA.z);
            enemy.root.rotation.y = enemy.facingAngle;
        }
        if (enemy.isReloading) { playEnemyAction(enemy, enemy.reloadActionName || enemy.animationBank.reloadStillGun); return; }
        if (enemy.ammoInMag <= 0) {
            if (startEnemyReload(enemy, false)) return;
            playEmptyMagIfReady('enemy', enemy.root);
        }
        if (enemy.animationBank.shootStillGun) playEnemyAction(enemy, enemy.animationBank.shootStillGun, { transitionSeconds: 0.08 });
        enemy.shotCooldown = Math.max(0, enemy.shotCooldown - deltaSeconds);
        if (enemy.shotCooldown <= 0 && enemy.ammoInMag > 0) { enemyShootPlayer(enemy); enemy.shotCooldown = enemyConfig.shootInterval; }
        return;
    }
    const moved = updateEnemyPatrolMovement(enemy, deltaSeconds);
    enemy.isMoving = moved;
    if (enemy.isReloading) { playEnemyAction(enemy, enemy.reloadActionName || (moved ? enemy.animationBank.reloadWalkGun : enemy.animationBank.reloadStillGun)); return; }
    if (enemy.ammoInMag <= 0) { startEnemyReload(enemy, moved); if (enemy.isReloading) return; }
    playEnemyAction(enemy, moved ? (enemy.animationBank.walkGun || enemy.animationBank.idleGun) : enemy.animationBank.idleGun);
}

export function updateEnemies(deltaSeconds, isMultiplayerArenaEnabled, multiplayerState) {
    if (isMultiplayerArenaEnabled() && multiplayerState.sharedArenaActive) {
        enemies.forEach((e) => updateEnemyWeaponSocketAttachment(e)); return;
    }
    enemies.forEach((e) => updateEnemy(e, deltaSeconds));
}

// ── Cleanup dead enemies ──────────────────────────────────────
export function cleanupDeadEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (!e.isDead) continue;
        e.hitMeshes?.forEach((m) => enemyHitMeshOwner.delete(m.uuid));
        e.weaponPivot?.parent?.remove(e.weaponPivot);
        e.root?.parent?.remove(e.root);
        const mi = mixers.indexOf(e.mixer); if (mi >= 0) mixers.splice(mi, 1);
        enemies.splice(i, 1);
    }
}

export function getAliveEnemiesCount() {
    return enemies.reduce((c, e) => c + (e.isDead ? 0 : 1), 0);
}

// ── Wave progress ─────────────────────────────────────────────
export function registerEnemyKillForWaveProgress() {
    if (gameState.currentWaveTargetKills <= 0) return;
    gameState.currentWaveKills = Math.min(gameState.currentWaveTargetKills, gameState.currentWaveKills + 1);
}

// ── Enemy spawn ───────────────────────────────────────────────
function getWaveSpawnPositions(count) {
    const base = waveConfig.spawnPoints, points = [];
    for (let i = 0; i < count; i++) {
        const idx = gameState.waveSpawnCursor + i;
        const tpl = base[idx % base.length];
        const cycle = Math.floor(idx / base.length);
        const jitter = cycle * 1.8, angle = Math.random() * Math.PI * 2;
        points.push(new THREE.Vector3(tpl.x + Math.cos(angle) * jitter, tpl.y, tpl.z + Math.sin(angle) * jitter));
    }
    return points;
}

export async function loadEnemyGuard(spawnPosition) {
    const [charGltf, wpnGltf] = await Promise.all([
        loader.loadAsync('../Characters/enemy_GUARD.glb'),
        loader.loadAsync('../Weapons/AK-47.glb'),
    ]);
    const root = charGltf.scene;
    root.position.copy(spawnPosition); root.position.y = getGroundHeightAt(root.position) + PLAYER_MODEL_Y_OFFSET;
    root.scale.setScalar(1); setShadowProperties(root); scene.add(root);
    const mixer = new THREE.AnimationMixer(root); mixers.push(mixer);
    const acts = new Map();
    charGltf.animations.forEach((c) => acts.set(c.name, mixer.clipAction(c)));
    const enemy = {
        root, mixer, animationActions: acts, animationBank: buildEnemyAnimationBank(charGltf.animations),
        activeAction: null, state: 'patrol', health: enemyConfig.maxHealth, isDead: false,
        isReloading: false, reloadActionName: null, reloadTimeRemaining: 0,
        ammoInMag: enemyConfig.magazineSize, ammoReserve: enemyConfig.reserveAmmo, shotCooldown: 0,
        spawnPosition: spawnPosition.clone(), patrolTarget: null, patrolIdleTime: 0,
        blockedRepathCooldown: 0, facingAngle: 0, weaponPivot: null, weaponBone: null,
        weaponModel: null, cachedMuzzleNode: null, weaponSockets: findEnemyRifleSockets(root), hitMeshes: [],
    };
    const wModel = wpnGltf.scene.clone(); setShadowProperties(wModel);
    tempBox.setFromObject(wModel); const sz = new THREE.Vector3(); tempBox.getSize(sz);
    const maxDim = Math.max(sz.x, sz.y, sz.z); if (maxDim > 0) wModel.scale.setScalar(0.85 / maxDim);
    tempBox.setFromObject(wModel); const ctr = new THREE.Vector3(); tempBox.getCenter(ctr);
    wModel.position.x -= ctr.x; wModel.position.z -= ctr.z; wModel.position.y -= tempBox.min.y;
    const wPivot = new THREE.Group(); wPivot.add(wModel);
    const defSock = enemy.weaponSockets.reload || enemy.weaponSockets.death;
    if (defSock) {
        const hs = new THREE.Vector3(); defSock.getWorldScale(hs);
        wPivot.scale.set(Math.abs(hs.x) > 0.0001 ? 1 / hs.x : 1, Math.abs(hs.y) > 0.0001 ? 1 / hs.y : 1, Math.abs(hs.z) > 0.0001 ? 1 / hs.z : 1);
        defSock.add(wPivot); enemy.weaponBone = defSock;
        applyWeaponHoldTransform(wPivot, 'rifle', true);
    }
    enemy.weaponPivot = wPivot; enemy.weaponModel = wModel; enemy.cachedMuzzleNode = findWeaponMuzzleNode(wModel);
    registerEnemyHitMeshes(enemy); enemies.push(enemy);
    mixer.addEventListener('finished', (ev) => handleEnemyMixerFinished(enemy, ev));
    playEnemyAction(enemy, enemy.animationBank.idleGun || enemy.animationBank.walkGun);
    updateEnemiesHud(); return enemy;
}

// ── Wave system ───────────────────────────────────────────────
async function spawnEnemiesForCurrentWave() {
    if (gameState.isPlayerDead || gameState.isWaveSpawning) return;
    const remaining = Math.max(0, gameState.currentWaveTargetKills - gameState.currentWaveSpawned);
    if (remaining <= 0) return;
    const alive = getAliveEnemiesCount();
    const slots = Math.max(0, waveConfig.maxConcurrentEnemies - alive);
    const count = Math.min(remaining, slots);
    if (count <= 0) return;
    gameState.isWaveSpawning = true;
    const positions = getWaveSpawnPositions(count);
    gameState.currentWaveSpawned += count; gameState.waveSpawnCursor += count;
    await Promise.all(positions.map((p, i) => loadEnemyGuard(p).catch((e) => console.warn(`Enemy spawn ${i} failed`, e))));
    gameState.isWaveSpawning = false; updateEnemiesHud();
}

export async function startNextWave() {
    if (gameState.isPlayerDead || gameState.isWaveSpawning) return;
    gameState.pendingWaveStart = false; gameState.waveDelayRemaining = 0;
    updateNextWaveCountdownHud(); cleanupDeadEnemies();
    gameState.currentWave += 1; updateWaveHud();
    const count = waveConfig.baseEnemies + (gameState.currentWave - 1) * waveConfig.enemiesIncrementPerWave;
    gameState.currentWaveTargetKills = Math.max(0, count);
    gameState.currentWaveKills = 0; gameState.currentWaveSpawned = 0; gameState.waveSpawnCursor = 0;
    updateEnemiesHud(); await spawnEnemiesForCurrentWave();
}

// ── Victory ───────────────────────────────────────────────────
export function triggerVictory(waveOverride = null) {
    if (gameState.isVictory) return;
    gameState.isVictory = true;
    gameState.isPaused = true;
    gameState.timerRunning = false;
    document.exitPointerLock?.();
    window._arenaStopPlayerLoops?.();
    window._arenaSubmitScore?.();

    const screen = document.getElementById('victory-overlay');
    if (screen) {
        const mm = Math.floor(gameState.elapsedSeconds / 60);
        const ss = Math.floor(gameState.elapsedSeconds % 60);
        const timeStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        const el = (id) => document.getElementById(id);
        if (el('victory-score')) el('victory-score').textContent = gameState.score;
        if (el('victory-wave'))  el('victory-wave').textContent  = `Wave ${waveOverride ?? gameState.currentWave}`;
        if (el('victory-time'))  el('victory-time').textContent  = timeStr;
        screen.classList.add('active');
    }
}

// Expose for multiplayer: called when the server broadcasts match_victory
window._arenaServerTriggerVictory = (serverWave) => triggerVictory(serverWave);

export function updateWaveSystem(deltaSeconds, isMultiplayerArenaEnabled, multiplayerState) {
    if (isMultiplayerArenaEnabled() && multiplayerState.sharedArenaActive) { updateNextWaveCountdownHud(); return; }
    if (gameState.isPlayerDead || gameState.isWaveSpawning) { updateNextWaveCountdownHud(); return; }
    if (gameState.pendingWaveStart) {
        gameState.waveDelayRemaining = Math.max(0, gameState.waveDelayRemaining - Math.max(0, deltaSeconds || 0));
        if (gameState.waveDelayRemaining <= 0) { gameState.pendingWaveStart = false; updateNextWaveCountdownHud(); startNextWave(); return; }
        updateNextWaveCountdownHud(); return;
    }
    if (gameState.currentWave <= 0 || gameState.currentWaveTargetKills <= 0) {
        gameState.pendingWaveStart = true; gameState.waveDelayRemaining = waveConfig.initialWaveDelaySeconds;
        updateNextWaveCountdownHud(); return;
    }
    const alive = getAliveEnemiesCount();
    const done = gameState.currentWaveKills >= gameState.currentWaveTargetKills && gameState.currentWaveSpawned >= gameState.currentWaveTargetKills;
    if (done) {
        if (alive > 0) return;
        cleanupDeadEnemies();

        // ━━ Victory check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (maxWaves > 0 && gameState.currentWave >= maxWaves) {
            triggerVictory();
            return;
        }

        gameState.pendingWaveStart = true;
        gameState.waveDelayRemaining = waveConfig.intermissionDelaySeconds;
        updateNextWaveCountdownHud();
        return;
    }
    updateNextWaveCountdownHud(); spawnEnemiesForCurrentWave();
}

export function findEnemyByServerId(serverEnemyId) {
    if (!serverEnemyId) return null;
    return enemies.find((e) => e.serverEnemyId === serverEnemyId) || null;
}
