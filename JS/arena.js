/**
 * arena.js — Orchestrator
 * Imports all feature modules and runs the game loop.
 * Original 5410-line monolithic file split into: JS/arena/*.js
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
    updateVitalsHud, updatePowerupsHud, updateEnemiesHud, updateWaveHud,
    updateScoreHud, updateTimeHud, updateNextWaveCountdownHud,
    updateWeaponHudValues, updateWeaponHudVisibility, updateCrosshairVisibility,
    updateHudHints,
} from './arena/hud.js';
import { createEnvironment, loadArenaMap, shouldUseAsMapCollider } from './arena/map-loader.js';
import {
    registerGroundMesh, registerGroundRoot, registerCollisionMesh,
    registerCollisionRoot, unregisterCollisionMesh, setGroundResolver, setCollisionResolver,
} from './arena/collision.js';
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
import { updateEnemies, updateWaveSystem, loadEnemyGuard, applyDamageToEnemy } from './arena/enemies.js';
import {
    connectMultiplayerArena, sendLocalPlayerPoseToServer,
    notifyServerRifleShot, notifyServerPickupCollect, isMultiplayerArenaEnabled,
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
attachInputHandlers(utilityPickups, weaponPickups, multiplayerState, isMultiplayerArenaEnabled);
connectMultiplayerArena(weaponPickups, utilityPickups, selectedMap, selectedDifficulty);

// ── Map & character ───────────────────────────────────────────
const mapPaths = { town: '../Maps/Town.glb', desert: '../Maps/arena_city.glb', city: '../Maps/arena_city.glb' };
loadArenaMap(mapPaths[selectedMap] || '../Maps/arena_city.glb', {
    registerGround: true, registerColliders: true, colliderFilter: shouldUseAsMapCollider,
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
updateVitalsHud(); updatePowerupsHud(); updateEnemiesHud();
updateWaveHud(); updateScoreHud(); updateTimeHud();
gameState.pendingWaveStart = true;
gameState.waveDelayRemaining = 15;
updateNextWaveCountdownHud();

// ── Game loop ─────────────────────────────────────────────────
handleResize();
updateThirdPersonCamera(0.016);

function animate() {
    const delta = Math.min(clock.getDelta(), 0.05);

    if (!gameState.isPaused && !gameState.isPlayerDead) {
        timeState.weapon += delta;

        updateGameTimer(delta);
        
        // Sweeping searchlight target (Requirement 3: Focal Light animation)
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
        updateWeaponFiring(
            delta, enemies, enemyHitMeshOwner, applyDamageToEnemy,
            notifyServerRifleShot, isMultiplayerArenaEnabled, multiplayerState,
        );
        updateShotTracers(delta);
        updateMuzzleFlashes(delta);
        updateEnemies(delta, isMultiplayerArenaEnabled, multiplayerState);
        updateFootstepAudio(pressedKeys);
        updateWaveSystem(delta, isMultiplayerArenaEnabled, multiplayerState);
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
        updateUtilityPickups(delta, timeState.weapon, notifyServerPickupCollect);
        updateParticles(delta);
        sendLocalPlayerPoseToServer();
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
animate();

// ── Public API ────────────────────────────────────────────────
window.arenaScene = {
    scene, camera, renderer, playerRoot, playerState,
    loadArenaMap, loadCharacterModel, playAction,
    registerGroundMesh, registerGroundRoot, registerCollisionMesh,
    registerCollisionRoot, unregisterCollisionMesh, setGroundResolver, setCollisionResolver,
    loadEnemyGuard,
    setPlayerDebugVisible(v) {
        import('./arena/game-state.js').then(({ playerCollider }) => { playerCollider.visible = Boolean(v); });
    },
    get animationBank() { return { ...animationBank }; },
    get animationNames() { return [...animationActions.keys()]; },
};