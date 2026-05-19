/**
 * kingofthehill.js — Orchestrator for King of the Hill (Free-for-All Multiplayer, up to 4 players)
 * Based on arena.js but with no AI/wave system.
 * Players earn points by holding the central capture zone.
 */
import * as THREE from 'three';
import {
    scene, camera, renderer, clock, mixers, enemies, enemyHitMeshOwner,
    weaponPickups, utilityPickups, gameState, multiplayerState,
    selectedMap, selectedDifficulty,
    playerRoot, playerState, mouseState, pressedKeys, weaponState, timeState,
    FLOOR_Y_OFFSET, animationBank, animationActions,
} from './arena/game-state.js';
import { getSavedSettings } from './arena/settings-utils.js';
import { setupAudioUnlockHandlers, ensureCityMusic, updateFootstepAudio } from './arena/audio.js';
import {
    updateVitalsHud, updatePowerupsHud,
    updateScoreHud, updateTimeHud,
    updateWeaponHudValues, updateWeaponHudVisibility, updateCrosshairVisibility,
    updateHudHints,
} from './arena/hud.js';
import { createEnvironment, loadArenaMap, shouldUseAsMapCollider } from './arena/map-loader.js';
import { playAction, handleMixerFinished } from './arena/animations.js';
import { updatePlayer, updateThirdPersonCamera } from './arena/player.js';
import {
    updateRifleSocketAttachment, updateHeldWeaponAlignment, updateShotTracers,
    updateMuzzleFlashes, updateWeaponFiring, loadCharacterModel,
} from './arena/weapons.js';
import {
    loadWeaponPickup, loadUtilityPickup, updateWeaponPickups, updateUtilityPickups,
    updateSpeedPowerup, getClosestWeaponPickup,
} from './arena/pickups.js';
import {
    connectKothArena, sendKothPoseToServer, notifyKothRifleShot,
    notifyKothPickupCollect, kothMultiplayerState, submitLeaderboardScore,
} from './arena/multiplayer.js';
import {
    attachInputHandlers, setupPauseMenuListeners, setupDeathScreenListeners,
    setupIngameSettingsModal, handleResize, updateGameTimer,
    handlePlayerDeath, applyDamageToPlayer,
} from './arena/input.js';
import { initAmbientDustParticles, updateParticles } from './arena/particles.js';

// ── Global hooks (consumed by sub-modules via window) ─────────
window._arenaMouseState = mouseState;
window._arenaPlayerState = playerState;
window._arenaHandlePlayerDeath = handlePlayerDeath;
window._arenaApplyDamageToPlayer = applyDamageToPlayer;
window._arenaHandleMixerFinished = (ev) => handleMixerFinished(ev, pressedKeys, getSavedSettings());

// Social sharing hooks (Requirement 8)
window._arenaShareTwitter = () => {
    const score = gameState.score;
    const text = encodeURIComponent(`I scored ${score} points holding the hill in Crownfall: King of the Hill! Can you beat me? 🏆`);
    const url = encodeURIComponent('https://github.com/Ravellion7/Testing-ThreeJS');
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=550,height=420');
};
window._arenaShareFacebook = () => {
    const url = encodeURIComponent('https://github.com/Ravellion7/Testing-ThreeJS');
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'width=580,height=400');
};

// ── Hill zone constants ───────────────────────────────────────
const HILL_RADIUS = 3.0; // visual starting size (server is authoritative at runtime)
let HILL_CENTER_X = 0;   // synced from server each frame
let HILL_CENTER_Z = -5;
let hillDiskMesh = null;
let hillRingMesh = null;
let hillPointLight = null;

// ── Init ──────────────────────────────────────────────────────
createEnvironment();
setupAudioUnlockHandlers();
ensureCityMusic();
updateHudHints();
updateWeaponHudValues();
setupPauseMenuListeners();
setupIngameSettingsModal();
setupDeathScreenListeners();
initAmbientDustParticles();
// isMultiplayerArenaEnabled always returns true for KOTH
attachInputHandlers(utilityPickups, weaponPickups, multiplayerState, () => true);

// ── Map & character ───────────────────────────────────────────
const mapPaths = { town: '../Maps/Town.glb', desert: '../Maps/arena_city.glb', city: '../Maps/arena_city.glb' };
loadArenaMap(mapPaths[selectedMap] || '../Maps/arena_city.glb', {
    registerGround: true, registerColliders: true, colliderFilter: shouldUseAsMapCollider,
}).then(() => {
    // Add hill zone visuals (size matches KOTH_HILL_RADIUS on the server = 3.0)
    const diskGeo = new THREE.CylinderGeometry(HILL_RADIUS, HILL_RADIUS, 0.08, 48);
    const diskMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    hillDiskMesh = new THREE.Mesh(diskGeo, diskMat);
    hillDiskMesh.position.set(HILL_CENTER_X, FLOOR_Y_OFFSET + 0.04, HILL_CENTER_Z);
    scene.add(hillDiskMesh);

    const ringGeo = new THREE.RingGeometry(HILL_RADIUS - 0.12, HILL_RADIUS + 0.12, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    hillRingMesh = new THREE.Mesh(ringGeo, ringMat);
    hillRingMesh.position.set(HILL_CENTER_X, FLOOR_Y_OFFSET + 0.05, HILL_CENTER_Z);
    scene.add(hillRingMesh);

    hillPointLight = new THREE.PointLight(0xffaa00, 5, 10, 1.5);
    hillPointLight.position.set(HILL_CENTER_X, FLOOR_Y_OFFSET + 1.0, HILL_CENTER_Z);
    scene.add(hillPointLight);
});

loadCharacterModel('../Characters/player_SWAG.glb').catch((e) => console.error('Character load failed', e));

// ── Pickups ───────────────────────────────────────────────────
const WY = FLOOR_Y_OFFSET + 1.0;
loadWeaponPickup('../Weapons/AK-47.glb', new THREE.Vector3(-6, WY, -8), 0.85, 'w_ak');
loadWeaponPickup('../Weapons/Glock.glb',  new THREE.Vector3(8,  WY,  2), 0.30, 'w_glock');
loadWeaponPickup('../Weapons/M4A1.glb',  new THREE.Vector3(0,  WY, -12), 0.85, 'w_m4');
loadUtilityPickup('../PickUps/First Aid Kit.glb', new THREE.Vector3(-10, WY, 10),  { id: 'u_medkit',  type: 'medkit',  targetSize: 0.58, respawnSeconds: 30, pickupRadius: 1.35 });
loadUtilityPickup('../PickUps/shield.glb',         new THREE.Vector3(11,  WY, -6),  { id: 'u_shield',  type: 'shield',  targetSize: 0.66, respawnSeconds: 30, pickupRadius: 1.35 });
loadUtilityPickup('../PickUps/Pickup Thunder.glb', new THREE.Vector3(3,   WY,  15), { id: 'u_thunder', type: 'thunder', targetSize: 0.72, respawnSeconds: 30, pickupRadius: 1.35 });

// ── HUD initial state ─────────────────────────────────────────
updateVitalsHud(); updatePowerupsHud();
updateScoreHud(); updateTimeHud();

// ── Connect to KOTH multiplayer (Requirement 6 & 11) ─────────
connectKothArena(weaponPickups, utilityPickups, selectedMap);

// ── Game loop ─────────────────────────────────────────────────
handleResize();
updateThirdPersonCamera(0.016);

function animate() {
    const delta = Math.min(clock.getDelta(), 0.05);

    if (!gameState.isPaused && !gameState.isPlayerDead) {
        timeState.weapon += delta;

        updateGameTimer(delta);

        // Sweeping focal searchlight (Requirement 3)
        const searchlightTarget = scene.getObjectByName('_arena_searchlight_target');
        if (searchlightTarget) {
            const time = clock.getElapsedTime() * 0.45;
            searchlightTarget.position.x = Math.sin(time) * 14;
            searchlightTarget.position.z = Math.cos(time * 0.7) * 14 - 4;
        }

        updateSpeedPowerup(delta);
        updatePlayer(delta);
        updateThirdPersonCamera(delta);
        mixers.forEach((m) => m.update(delta));
        updateRifleSocketAttachment();
        updateHeldWeaponAlignment();

        // Weapon firing — uses notifyKothRifleShot for PvP damage resolution on server
        updateWeaponFiring(
            delta, enemies, enemyHitMeshOwner,
            () => {}, // no enemy damage callback (no AI)
            notifyKothRifleShot,
            () => true, // always multiplayer
            multiplayerState,
        );
        updateShotTracers(delta);
        updateMuzzleFlashes(delta);

        // No enemy/wave update — KOTH is PvP only
        updateFootstepAudio(pressedKeys);
        updateCrosshairVisibility();
        updateWeaponHudVisibility();
        updateWeaponHudValues();

        // Weapon pickup prompt
        const promptEl = document.getElementById('pickup-prompt');
        if (promptEl) {
            const nearby = getClosestWeaponPickup();
            if (nearby && nearby.isActive !== false) {
                const useKey = getSavedSettings().controls.use;
                const keyChar = useKey.startsWith('Key') ? useKey.slice(3) : useKey;
                promptEl.innerHTML = `Press <span style="color:#daa520;font-weight:bold">${keyChar}</span> to grab weapon`;
                promptEl.style.display = 'block';
            } else {
                promptEl.style.display = 'none';
            }
        }

        updateWeaponPickups(delta, timeState.weapon);
        updateUtilityPickups(delta, timeState.weapon, notifyKothPickupCollect);
        updateParticles(delta);

        // ── Send local pose to server ─────────────────────────────
        sendKothPoseToServer();

        // ── Hill zone visuals & HUD (Requirement 6 – King of the Hill) ──
        // Sync hill position from server state every frame
        const srvHillX  = kothMultiplayerState.hillX  ?? HILL_CENTER_X;
        const srvHillZ  = kothMultiplayerState.hillZ  ?? HILL_CENTER_Z;
        const srvRadius = kothMultiplayerState.hillRadius ?? HILL_RADIUS;
        HILL_CENTER_X = srvHillX;
        HILL_CENTER_Z = srvHillZ;

        // Move visual meshes to the server-authoritative position
        if (hillDiskMesh) {
            hillDiskMesh.position.x = srvHillX;
            hillDiskMesh.position.z = srvHillZ;
        }
        if (hillRingMesh) {
            hillRingMesh.position.x = srvHillX;
            hillRingMesh.position.z = srvHillZ;
        }
        if (hillPointLight) {
            hillPointLight.position.x = srvHillX;
            hillPointLight.position.z = srvHillZ;
        }

        const progress = kothMultiplayerState.captureProgress;    // 0-100 from server
        const holderId = kothMultiplayerState.capturingPlayerId;
        const localInHill = Math.hypot(playerRoot.position.x - srvHillX, playerRoot.position.z - srvHillZ) < srvRadius;

        // Determine zone colour: green = local player holds, red = contested / opponent holds, gold = empty
        let zoneColor = 0xffaa00;
        if (holderId === kothMultiplayerState.playerId && localInHill) {
            zoneColor = 0x5cb85c; // green — you own it
        } else if (holderId && holderId !== kothMultiplayerState.playerId) {
            zoneColor = 0xd9534f; // red — opponent owns it
        }

        if (hillDiskMesh) {
            hillDiskMesh.material.color.setHex(zoneColor);
            hillDiskMesh.material.opacity = 0.12 + Math.sin(clock.getElapsedTime() * 3) * 0.05;
        }
        if (hillRingMesh) {
            hillRingMesh.material.color.setHex(zoneColor);
            hillRingMesh.rotation.z += delta * 0.3;
        }
        if (hillPointLight) hillPointLight.color.setHex(zoneColor);

        // Capture progress bar displayed via notification panel
        const notifEl = document.getElementById('notification-panel');
        if (notifEl) {
            if (progress >= 99.5 && holderId === kothMultiplayerState.playerId) {
                notifEl.innerHTML = `<span style="color:#ffd700;font-weight:bold;letter-spacing:2px;font-size:1.15em;text-shadow:0 0 12px #ffd700;">⚑ ZONE CAPTURED! ⚑</span>`;
            } else if (localInHill && holderId === kothMultiplayerState.playerId) {
                notifEl.innerHTML = `<span style="color:#5cb85c;font-weight:bold;letter-spacing:1px;">HOLDING HILL — ${Math.floor(progress)}%</span>`;
            } else if (holderId && holderId !== kothMultiplayerState.playerId) {
                notifEl.innerHTML = `<span style="color:#e67e22;font-weight:bold;animation:blink 1.2s infinite;">OPPONENT CAPTURING HILL! — ${Math.floor(progress)}%</span>`;
            } else if (localInHill) {
                notifEl.innerHTML = `<span style="color:#f39c12;font-weight:bold;letter-spacing:1px;">HILL CONTESTED</span>`;
            } else {
                notifEl.innerHTML = `<span style="color:#daa520;font-weight:bold;">GET TO THE HILL ZONE!</span>`;
            }
        }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
animate();

// ── Death & Victory screen button wiring ─────────────────────
document.getElementById('retry-btn')?.addEventListener('click', () => { window.location.reload(); });
document.getElementById('death-menu-btn')?.addEventListener('click', () => { window.location.href = '../HTML/mainmenu.html'; });
document.getElementById('victory-retry-btn')?.addEventListener('click', () => { window.location.reload(); });
document.getElementById('victory-menu-btn')?.addEventListener('click', () => { window.location.href = '../HTML/mainmenu.html'; });

