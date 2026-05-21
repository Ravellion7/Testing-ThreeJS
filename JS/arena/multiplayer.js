import * as THREE from 'three';
import {
    scene, loader, mixers, enemies, enemyHitMeshOwner,
    multiplayerState, multiplayerAssetCache, gameState, playerVitals,
    playerRoot, playerState, mouseState, weaponState, firingState,
    animationBank, animationActions, waveConfig, FLOOR_Y_OFFSET, PLAYER_MODEL_Y_OFFSET,
    applyWeaponHoldTransform, tempBox, tempVectorA, maxWaves,
} from './game-state.js';
import { getSavedSettings } from './settings-utils.js';
import { updateVitalsHud, updateWaveHud, updateEnemiesHud, updateNextWaveCountdownHud, showMultiplayerAnnouncement } from './hud.js';
import { setShadowProperties } from './map-loader.js';
import { loadEnemyGuard, applyDamageToEnemy, updateEnemyWeaponSocketAttachment, findEnemyByServerId, playEnemyAction } from './enemies.js';
import { applyPickupActiveState } from './pickups.js';
import { findWeaponMuzzleNode, getCurrentActionName } from './weapons.js';
import { applyServerSpeedBoostSnapshot } from './pickups.js';

export function isMultiplayerArenaEnabled() { return multiplayerState.enabled; }

export function setMultiplayerStatus(text) {
    multiplayerState.statusText = text;
    if (!isMultiplayerArenaEnabled()) return;
    const el = ensureMultiplayerStatusElement();
    el.textContent = `Multiplayer: ${text}`;
}

function ensureMultiplayerStatusElement() {
    if (multiplayerState.statusElement) return multiplayerState.statusElement;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:16px;bottom:16px;padding:8px 12px;background:rgba(0,0,0,.65);border:1px solid rgba(218,165,32,.45);border-radius:8px;color:#f3e6c8;font:600 12px/1.2 Arial,sans-serif;letter-spacing:.04em;z-index:9999;pointer-events:none';
    el.textContent = 'Multiplayer: Connecting...';
    document.body.appendChild(el);
    multiplayerState.statusElement = el;
    return el;
}

// ── Remote avatar ─────────────────────────────────────────────
function findRightHandBoneInRoot(root) {
    if (!root) return null;
    let found = null;
    root.traverse((n) => {
        if (found) return;
        if (n.name === 'mixamorig:RightHand') { found = n; return; }
        const name = String(n.name || '').toLowerCase();
        if (name.includes('righthand') || name === 'hand.r' || name === 'hand_r' || name === 'rhand' || name === 'r_hand') found = n;
    });
    return found;
}

function findRifleSocketsInRoot(root) {
    if (!root) return null;
    const by = { aim: null, idle: null, walk: null, run: null, default: null };
    root.traverse((n) => {
        const raw = String(n.name || ''), name = raw.toLowerCase();
        if (!name.includes('riflesocket') && !name.includes('rifle_socket')) return;
        if (!by.default || raw === 'RifleSocket') by.default = n;
        if (!by.idle && name.includes('idle')) by.idle = n;
        if (!by.aim && name.includes('aim')) by.aim = n;
        if (!by.walk && name.includes('walk')) by.walk = n;
        if (!by.run && name.includes('run')) by.run = n;
    });
    return (!by.default && !by.aim && !by.idle && !by.walk && !by.run) ? null : by;
}

function playRemoteAvatarAction(avatar, name, t = 0.12) {
    if (!avatar || !name) return;
    const next = avatar.animationActions.get(name);
    if (!next || next === avatar.activeAction) return;
    if (avatar.activeAction) avatar.activeAction.fadeOut(t);
    next.reset(); next.setLoop(THREE.LoopRepeat, Infinity); next.clampWhenFinished = false; next.fadeIn(t).play();
    avatar.activeAction = next;
}

function removeRemoteAvatarWeapon(avatar) {
    if (!avatar?.weaponPivot || !avatar?.weaponBone) return;
    avatar.weaponBone.remove(avatar.weaponPivot);
    avatar.weaponPivot = null; avatar.weaponBone = null; avatar.weaponKind = 'none';
}

async function getCachedWeaponModel(path) {
    if (!path) return null;
    const cached = multiplayerAssetCache.weaponModels.get(path);
    if (cached) return cached;
    const gltf = await loader.loadAsync(path);
    multiplayerAssetCache.weaponModels.set(path, gltf.scene);
    return gltf.scene;
}

async function syncRemoteAvatarWeapon(avatar, kind) {
    if (!avatar) return;
    const nk = (kind === 'm4' || kind === 'ak') ? kind : 'none';
    if (avatar.weaponKind === nk) return;
    removeRemoteAvatarWeapon(avatar);
    if (nk === 'none') return;
    const path = nk === 'm4' ? '../Weapons/M4A1.glb' : '../Weapons/AK-47.glb';
    let base = null;
    try { base = await getCachedWeaponModel(path); } catch { return; }
    if (!base || !avatar.root?.parent) return;
    const wModel = base.clone(true); setShadowProperties(wModel);
    tempBox.setFromObject(wModel); const sz = new THREE.Vector3(); tempBox.getSize(sz);
    const maxDim = Math.max(sz.x, sz.y, sz.z); if (maxDim > 0) wModel.scale.setScalar(0.85 / maxDim);
    tempBox.setFromObject(wModel); const ctr = new THREE.Vector3(); tempBox.getCenter(ctr);
    wModel.position.x -= ctr.x; wModel.position.z -= ctr.z; wModel.position.y -= tempBox.min.y;
    const pivot = new THREE.Group(); pivot.add(wModel);
    const sock = avatar.rifleSockets?.default || avatar.rifleSockets?.idle || avatar.rightHandBone;
    const useSocket = Boolean(avatar.rifleSockets?.default || avatar.rifleSockets?.idle);
    if (!sock) return;
    const hs = new THREE.Vector3(); sock.getWorldScale(hs);
    pivot.scale.set(Math.abs(hs.x) > 0.0001 ? 1 / hs.x : 1, Math.abs(hs.y) > 0.0001 ? 1 / hs.y : 1, Math.abs(hs.z) > 0.0001 ? 1 / hs.z : 1);
    applyWeaponHoldTransform(pivot, 'rifle', useSocket);
    sock.add(pivot); avatar.weaponPivot = pivot; avatar.weaponBone = sock; avatar.weaponKind = nk;
}

async function ensureRemotePlayerAvatar() {
    if (multiplayerState.remoteAvatar) return multiplayerState.remoteAvatar;
    if (multiplayerState.remoteAvatarLoading) return multiplayerState.remoteAvatarLoading;
    multiplayerState.remoteAvatarLoading = loader.loadAsync('../Characters/player_SWAG.glb').then((gltf) => {
        const root = gltf.scene;
        root.position.set(2, FLOOR_Y_OFFSET, 0); root.scale.setScalar(1); root.visible = false;
        setShadowProperties(root); scene.add(root);
        const acts = new Map(); let mixer = null, active = null;
        if (gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(root); mixers.push(mixer);
            gltf.animations.forEach((c) => acts.set(c.name, mixer.clipAction(c)));
            const idleName = animationBank.idleGun || animationBank.idle || gltf.animations[0]?.name;
            if (idleName && acts.has(idleName)) {
                active = acts.get(idleName);
                active.setLoop(THREE.LoopRepeat, Infinity); active.clampWhenFinished = false; active.reset().play();
            }
        }
        const avatar = { root, mixer, animationActions: acts, activeAction: active, rightHandBone: findRightHandBoneInRoot(root), rifleSockets: findRifleSocketsInRoot(root), weaponPivot: null, weaponBone: null, weaponKind: 'none' };
        multiplayerState.remoteAvatar = avatar; multiplayerState.remotePlayerRoot = root;
        return avatar;
    }).catch(() => null).finally(() => { multiplayerState.remoteAvatarLoading = null; });
    return multiplayerState.remoteAvatarLoading;
}

function updateRemoteAvatarFromSnapshot(snapshot) {
    if (!snapshot?.id || snapshot.id === multiplayerState.playerId) return;
    multiplayerState.lastRemoteSnapshot = snapshot;
    ensureRemotePlayerAvatar().then((avatar) => {
        if (!avatar || !multiplayerState.lastRemoteSnapshot) return;
        const r = multiplayerState.lastRemoteSnapshot;
        avatar.root.visible = true; multiplayerState.remotePlayerId = r.id;
        if (typeof r.x === 'number') avatar.root.position.x = r.x;
        if (typeof r.y === 'number') avatar.root.position.y = r.y + PLAYER_MODEL_Y_OFFSET;
        if (typeof r.z === 'number') avatar.root.position.z = r.z;
        if (typeof r.rotY === 'number') avatar.root.rotation.y = r.rotY;
        syncRemoteAvatarWeapon(avatar, r.weaponKind || 'none').catch(() => {});
        const moveSpeed = Math.max(0, Number(r.moveSpeed) || 0);
        const moving = moveSpeed > 0.75, aiming = Boolean(r.aiming), firing = Boolean(r.firing), reloading = Boolean(r.reloading);
        let actionName = String(r.actionName || '');
        if (!actionName || !avatar.animationActions.has(actionName)) {
            actionName = animationBank.idleGun || animationBank.idle;
            if (reloading) actionName = moving ? (animationBank.reloadWalkGun || animationBank.reloadStillGun || actionName) : (animationBank.reloadStillGun || animationBank.reloadWalkGun || actionName);
            else if (firing) actionName = moving ? (animationBank.shootWalkGun || animationBank.shootStillGun || actionName) : (animationBank.shootStillGun || animationBank.shootWalkGun || actionName);
            else if (aiming) actionName = moving ? (animationBank.aimMoveGun || animationBank.walkGun || actionName) : (animationBank.aimGun || animationBank.idleGun || actionName);
            else if (moving) actionName = moveSpeed > 5 ? (animationBank.runGun || animationBank.walkGun || actionName) : (animationBank.walkGun || animationBank.runGun || actionName);
        }
        playRemoteAvatarAction(avatar, actionName);
    });
}

// ── Arena state snapshot ──────────────────────────────────────
function applyWaveSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    if (typeof snap.current === 'number') gameState.currentWave = Math.max(0, snap.current);
    if (typeof snap.targetKills === 'number') gameState.currentWaveTargetKills = Math.max(0, snap.targetKills);
    if (typeof snap.kills === 'number') gameState.currentWaveKills = Math.max(0, snap.kills);
    if (typeof snap.spawned === 'number') gameState.currentWaveSpawned = Math.max(0, snap.spawned);
    if (typeof snap.pendingStart === 'boolean') gameState.pendingWaveStart = snap.pendingStart;
    if (typeof snap.delayRemaining === 'number') gameState.waveDelayRemaining = Math.max(0, snap.delayRemaining);
    updateWaveHud(); updateEnemiesHud(); updateNextWaveCountdownHud();
}

function applyEnemySnapshot(snap) {
    if (!snap?.id) return;
    const existing = findEnemyByServerId(snap.id);
    if (!existing) {
        if (multiplayerState.pendingEnemyVisualIds.has(snap.id)) return;
        multiplayerState.pendingEnemyVisualIds.add(snap.id);
        loadEnemyGuard(new THREE.Vector3(Number(snap.x) || 0, Number(snap.y) || FLOOR_Y_OFFSET, Number(snap.z) || 0)).then((e) => {
            if (e) { e.serverEnemyId = snap.id; e.isServerDriven = true; e.state = 'server'; e._wasDeadOnLastSnapshot = false; }
        }).catch(() => {}).finally(() => { multiplayerState.pendingEnemyVisualIds.delete(snap.id); });
        return;
    }
    existing.isServerDriven = true;
    if (typeof snap.x === 'number') existing.root.position.x = snap.x;
    if (typeof snap.y === 'number') existing.root.position.y = snap.y + PLAYER_MODEL_Y_OFFSET;
    if (typeof snap.z === 'number') existing.root.position.z = snap.z;
    if (typeof snap.rotY === 'number') existing.root.rotation.y = snap.rotY;
    if (typeof snap.health === 'number') existing.health = Math.max(0, snap.health);

    const nowDead = Boolean(snap.isDead);
    // Reward ammo and score the first time this enemy transitions to dead
    if (nowDead && !existing._wasDeadOnLastSnapshot) {
        existing._wasDeadOnLastSnapshot = true;
        window._arenaRewardAmmoOnKill?.();
        window._arenaAddScore?.(100);
    }
    existing.isDead = nowDead;

    const state = String(snap.state || '').toLowerCase();
    if (existing.isDead) {
        if (existing.animationBank.deathGun) { playEnemyAction(existing, existing.animationBank.deathGun, { transitionSeconds: 0.1, loopOnce: true }); }
        return;
    }
    if (state === 'shoot') { playEnemyAction(existing, existing.animationBank.shootStillGun || existing.animationBank.idleGun, { transitionSeconds: 0.08 }); return; }
    if (state === 'walk') { playEnemyAction(existing, existing.animationBank.walkGun || existing.animationBank.idleGun); return; }
    playEnemyAction(existing, existing.animationBank.idleGun || existing.animationBank.walkGun);
}
let kothZoneMesh = null;

function applyArenaStateSnapshot(snapshot, weaponPickups, utilityPickups) {
    if (!snapshot || typeof snapshot !== 'object') return;
    multiplayerState.sharedArenaActive = true; multiplayerState.lastArenaSnapshot = snapshot;
    
    if (gameState.gameMode === 'koth' && snapshot.koth) {
        const koth = snapshot.koth;
        // Update HUD
        const p1ScoreEl = document.getElementById('koth-p1-score');
        const p2ScoreEl = document.getElementById('koth-p2-score');
        const statusEl = document.getElementById('koth-status');
        if (p1ScoreEl) p1ScoreEl.textContent = Math.floor(koth.scores.p1 || 0);
        if (p2ScoreEl) p2ScoreEl.textContent = Math.floor(koth.scores.p2 || 0);
        if (statusEl) {
            if (koth.hill.ownerId) {
                statusEl.textContent = `Owned by ${koth.hill.ownerId}`;
                statusEl.style.color = koth.hill.ownerId === multiplayerState.playerId ? '#4CAF50' : '#d9534f';
            } else if (koth.hill.capturingId) {
                statusEl.textContent = `Capturing... ${Math.floor(koth.hill.progress)}%`;
                statusEl.style.color = '#daa520';
            } else {
                statusEl.textContent = 'Neutral';
                statusEl.style.color = '#6ea8ff';
            }
        }
        
        // Draw capture zone
        if (!kothZoneMesh) {
            const geo = new THREE.CylinderGeometry(koth.hill.radius, koth.hill.radius, 0.2, 32);
            const mat = new THREE.MeshBasicMaterial({ color: 0x6ea8ff, transparent: true, opacity: 0.3, wireframe: true });
            kothZoneMesh = new THREE.Mesh(geo, mat);
            scene.add(kothZoneMesh);
        }
        kothZoneMesh.position.set(koth.hill.x, FLOOR_Y_OFFSET + 0.1, koth.hill.z);
        if (koth.hill.ownerId) {
            kothZoneMesh.material.color.setHex(koth.hill.ownerId === multiplayerState.playerId ? 0x4CAF50 : 0xd9534f);
        } else if (koth.hill.capturingId) {
            kothZoneMesh.material.color.setHex(0xdaa520);
        } else {
            kothZoneMesh.material.color.setHex(0x6ea8ff);
        }
    }

    if (Array.isArray(snapshot.players) && multiplayerState.playerId) {
        const me = snapshot.players.find((p) => p.id === multiplayerState.playerId);
        if (me) {
            if (typeof me.health === 'number') playerVitals.health = Math.max(0, me.health);
            if (typeof me.shield === 'number') playerVitals.shield = Math.max(0, me.shield);
            if (typeof me.speedBoostRemaining === 'number') applyServerSpeedBoostSnapshot(me.speedBoostRemaining);
            updateVitalsHud();
            if (playerVitals.health <= 0 && !gameState.isPlayerDead && !gameState.isVictory) window._arenaHandlePlayerDeath?.();
        }
    }
    applyWaveSnapshot(snapshot.wave);
    if (Array.isArray(snapshot.weaponPickups)) snapshot.weaponPickups.forEach((ps) => { const e = weaponPickups.find((x) => x.id === ps.id); if (e) applyPickupActiveState(e, ps.active); });
    if (Array.isArray(snapshot.utilityPickups)) snapshot.utilityPickups.forEach((ps) => { const e = utilityPickups.find((x) => x.id === ps.id); if (e) applyPickupActiveState(e, ps.active); });
    if (!Array.isArray(snapshot.enemies)) { updateEnemiesHud(); return; }
    const ids = new Set(snapshot.enemies.map((s) => s.id));
    snapshot.enemies.forEach(applyEnemySnapshot);
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i]; if (!e?.isServerDriven) continue;
        if (!ids.has(e.serverEnemyId)) {
            e.hitMeshes?.forEach((m) => enemyHitMeshOwner.delete(m.uuid));
            e.weaponPivot?.parent?.remove(e.weaponPivot); e.root?.parent?.remove(e.root);
            const mi = mixers.indexOf(e.mixer); if (mi >= 0) mixers.splice(mi, 1); enemies.splice(i, 1);
        }
    }
    updateEnemiesHud();
}

// ── Message handler ───────────────────────────────────────────
export function handleMultiplayerMessage(raw, weaponPickups, utilityPickups, selectedMap, selectedDifficulty) {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    // Once victory is shown, only allow the user's own button clicks to navigate.
    // Ignore all incoming server messages so no snapshot/event can dismiss the screen.
    if (gameState.isVictory && msg.type !== 'match_victory') return;

    if (msg.type === 'player_joined_announcement') { showMultiplayerAnnouncement(`<span style="color:#daa520;font-weight:bold">${msg.nickname || 'Player'}</span> has entered the arena`); return; }
    if (msg.type === 'assigned_player') {
        multiplayerState.playerId = msg.playerId || null;
        const sm = msg.map || 'city', sd = msg.difficulty || 'medium';
        if (sm !== selectedMap || sd !== selectedDifficulty) {
            // Preserve maxWaves in the redirect so the win condition survives
            const mw = new URLSearchParams(window.location.search).get('maxWaves') || '0';
            window.location.href = `arena.html?multiplayer=1&map=${sm}&difficulty=${sd}&maxWaves=${mw}`;
            return;
        }
        if (typeof msg.health === 'number') playerVitals.health = Math.max(0, msg.health);
        if (typeof msg.shield === 'number') playerVitals.shield = Math.max(0, msg.shield);
        updateVitalsHud();
        const settings = getSavedSettings();
        const nick = settings.nickname?.trim() || ('Player ' + (msg.playerId || '1').replace(/\D/g, ''));
        setMultiplayerStatus(`Connected as ${nick}`);
        showMultiplayerAnnouncement(`Joined as <span style="color:#daa520;font-weight:bold">${nick}</span>`);
        return;
    }
    if (msg.type === 'waiting_for_players') { setMultiplayerStatus('Waiting for player 2...'); return; }
    if (msg.type === 'match_started') { multiplayerState.matchStarted = true; gameState.pendingWaveStart = true; gameState.waveDelayRemaining = waveConfig.initialWaveDelaySeconds; updateNextWaveCountdownHud(); setMultiplayerStatus('Match started (2 players connected)'); return; }
    if (msg.type === 'player_disconnected') {
        const rr = multiplayerState.remoteAvatar?.root || multiplayerState.remotePlayerRoot;
        if (rr) rr.visible = false;
        multiplayerState.remotePlayerId = null; multiplayerState.matchStarted = false; multiplayerState.sharedArenaActive = false;
        multiplayerState.lastArenaSnapshot = null; multiplayerState.lastRemoteSnapshot = null;
        setMultiplayerStatus('Player disconnected');
        showMultiplayerAnnouncement(`<span style="color:#d9534f;font-weight:bold">${msg.nickname || 'Player 2'}</span> has left the arena`);
        return;
    }
    if (msg.type === 'room_full') { setMultiplayerStatus('Room full (2/2 players)'); return; }
    if (msg.type === 'match_victory' || msg.type === 'koth_victory') {
        // Trigger the victory screen on both clients when the server signals the win
        window._arenaStopPlayerLoops?.();
        window._arenaSubmitScore?.();
        if (typeof window._arenaServerTriggerVictory === 'function') {
            window._arenaServerTriggerVictory(msg.wave || 0);
        }
        return;
    }
    if (msg.type === 'arena_state_snapshot') { applyArenaStateSnapshot(msg, weaponPickups, utilityPickups); return; }
    if (msg.type === 'rifle_shot_result') {
        if (msg.targetId === multiplayerState.playerId) {
            if (typeof msg.targetHealth === 'number') playerVitals.health = Math.max(0, msg.targetHealth);
            if (typeof msg.targetShield === 'number') playerVitals.shield = Math.max(0, msg.targetShield);
            updateVitalsHud();
            if (playerVitals.health <= 0 && !gameState.isPlayerDead) window._arenaHandlePlayerDeath?.();
        }
        return;
    }
    if (msg.type === 'player_eliminated') { 
        setMultiplayerStatus(msg.playerId === multiplayerState.playerId ? 'You were eliminated' : 'Player eliminated'); 
        return; 
    }
    if (msg.type === 'player_respawned') {
        if (msg.playerId === multiplayerState.playerId) {
            playerVitals.health = msg.health;
            playerVitals.shield = msg.shield;
            playerRoot.position.set(msg.x, FLOOR_Y_OFFSET, msg.z);
            updateVitalsHud();
            
            const respawnOverlay = document.getElementById('respawn-overlay');
            if (respawnOverlay) respawnOverlay.style.display = 'none';
            
            gameState.isPlayerDead = false;
            gameState.timerRunning = true;
            window._arenaMouseState.isAimPressed = false;
            window._arenaMouseState.isFirePressed = false;
            
            // Re-request pointer lock to resume gameplay smoothly
            if (!gameState.isPaused && document.pointerLockElement !== renderer.domElement) {
                renderer.domElement.requestPointerLock?.();
            }
        }
        return;
    }
    if (msg.type !== 'state_update' || !Array.isArray(msg.players)) return;
    const remote = msg.players.find((p) => p.id && p.id !== multiplayerState.playerId);
    if (remote) updateRemoteAvatarFromSnapshot(remote);
}

// ── Connection ────────────────────────────────────────────────
export function connectMultiplayerArena(weaponPickups, utilityPickups, selectedMap, selectedDifficulty) {
    if (!isMultiplayerArenaEnabled()) return;
    if (!('WebSocket' in window)) { setMultiplayerStatus('WebSocket not supported'); return; }
    setMultiplayerStatus('Connecting...');
    let socket; try { socket = new WebSocket(multiplayerState.serverUrl); } catch { setMultiplayerStatus('Connection failed'); return; }
    multiplayerState.socket = socket;
    socket.addEventListener('open', () => {
        setMultiplayerStatus('Connected. Joining Arena...');
        const settings = getSavedSettings();
        socket.send(JSON.stringify({ type: 'join_arena', mode: gameState.gameMode, nickname: settings.nickname?.trim() || '', map: selectedMap, difficulty: selectedDifficulty, maxWaves: maxWaves || 0 }));
    });
    socket.addEventListener('message', (ev) => handleMultiplayerMessage(ev.data, weaponPickups, utilityPickups, selectedMap, selectedDifficulty));
    socket.addEventListener('close', () => setMultiplayerStatus('Disconnected from server'));
    socket.addEventListener('error', () => setMultiplayerStatus('Socket error'));
    window.addEventListener('beforeunload', () => leaveMultiplayerArenaSession('Client closing page'), { once: true });
}

export function leaveMultiplayerArenaSession(reason = 'Leaving arena') {
    if (!isMultiplayerArenaEnabled()) return;
    const s = multiplayerState.socket;
    if (s && s.readyState === WebSocket.OPEN) { s.send(JSON.stringify({ type: 'leave_arena' })); s.close(1000, reason); }
    multiplayerState.matchStarted = false; multiplayerState.sharedArenaActive = false;
    multiplayerState.lastArenaSnapshot = null; multiplayerState.lastRemoteSnapshot = null;
}

export function sendLocalPlayerPoseToServer() {
    if (!isMultiplayerArenaEnabled()) return;
    const s = multiplayerState.socket;
    if (!s || s.readyState !== WebSocket.OPEN || !multiplayerState.playerId) return;
    const now = performance.now();
    if ((now - multiplayerState.lastPoseSentAt) < multiplayerState.poseSendIntervalMs) return;
    multiplayerState.lastPoseSentAt = now;
    const { hasWeaponEquipped, equippedWeaponType, equippedWeapon } = weaponState;
    const wKind = !hasWeaponEquipped || equippedWeaponType !== 'rifle' ? 'none' : (String(equippedWeapon?.modelPath || '').toLowerCase().includes('m4') ? 'm4' : 'ak');
    s.send(JSON.stringify({
        type: 'update_pose',
        x: playerRoot.position.x, y: playerRoot.position.y, z: playerRoot.position.z,
        rotY: playerRoot.rotation.y,
        moveSpeed: Math.hypot(playerState.velocity.x, playerState.velocity.z),
        aiming: mouseState.isAimPressed && hasWeaponEquipped && equippedWeaponType === 'rifle',
        firing: Boolean(mouseState.isFirePressed && hasWeaponEquipped && equippedWeaponType === 'rifle' && weaponState.equippedWeaponCombatState?.currentAmmo > 0),
        reloading: Boolean(weaponState.isReloadAnimating),
        weaponKind: wKind, actionName: getCurrentActionName(),
    }));
}

export function notifyServerRifleShot(direction) {
    if (!isMultiplayerArenaEnabled()) return;
    const s = multiplayerState.socket;
    if (!s || s.readyState !== WebSocket.OPEN || !multiplayerState.playerId) return;
    s.send(JSON.stringify({ type: 'rifle_shot', playerId: multiplayerState.playerId, dirX: direction?.x, dirZ: direction?.z }));
}

export function notifyServerPickupCollect(entry, category) {
    if (!entry?.id || !category) return;
    if (!(isMultiplayerArenaEnabled() && multiplayerState.sharedArenaActive)) return;
    const s = multiplayerState.socket;
    if (!s || s.readyState !== WebSocket.OPEN || !multiplayerState.playerId) return;
    s.send(JSON.stringify({ type: 'pickup_collect', playerId: multiplayerState.playerId, category, id: entry.id }));
}

export function submitLeaderboardScore(score, mode = 'Arena') {
    const settings = getSavedSettings();
    const nick = settings.nickname?.trim() || 'Player';
    
    // Save to localStorage (Local database fallback)
    try {
        const today = new Date();
        const dateStr = String(today.getMonth() + 1).padStart(2, '0') + '/' + String(today.getDate()).padStart(2, '0');
        const localDataRaw = localStorage.getItem('crownfall_leaderboard');
        let localData = [];
        if (localDataRaw) {
            try { localData = JSON.parse(localDataRaw); } catch { localData = []; }
        }
        if (!Array.isArray(localData)) localData = [];
        localData.push({ name: nick, mode: mode, score: Number(score) || 0, date: dateStr });
        localData.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        const topLocal = localData.slice(0, 50);
        localStorage.setItem('crownfall_leaderboard', JSON.stringify(topLocal));
    } catch (e) {
        console.error('Failed to save local score to localStorage:', e);
    }

    const payload = { type: 'submit_score', name: nick, mode: mode, score };
    if (multiplayerState.socket?.readyState === WebSocket.OPEN) {
        multiplayerState.socket.send(JSON.stringify(payload));
        return;
    }
    try {
        const ws = new WebSocket(multiplayerState.serverUrl);
        ws.addEventListener('open', () => {
            ws.send(JSON.stringify(payload));
            setTimeout(() => ws.close(), 1000);
        });
    } catch (e) {
        console.error('Failed to submit score to websocket server', e);
    }
}
