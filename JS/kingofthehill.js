import * as THREE from 'three';
import {
    scene, camera, renderer, clock, mixers, playerRoot, playerState, mouseState,
    pressedKeys, selectedMap, selectedDifficulty, utilityPickups, weaponPickups,
    multiplayerState, shouldPlayCityMusic, getSavedSettings, animationBank,
    handleMixerFinished, updateCrosshairVisibility, timeState,
    shouldUseAsMapCollider, FLOOR_Y_OFFSET, gameState, playerVitals, enemyHitMeshOwner,
    enemies,
} from './arena/game-state.js';
import {
    loadArenaMap, createEnvironment, ensureCityMusic, setupAudioUnlockHandlers,
    updateFootstepAudio,
} from './arena/map-loader.js';
import { updateHudHints, updateVitalsHud, updateWeaponHudValues } from './arena/hud.js';
import { updatePlayer, updateThirdPersonCamera } from './arena/player.js';
import {
    updateRifleSocketAttachment, updateHeldWeaponAlignment, updateShotTracers,
    updateMuzzleFlashes, updateWeaponFiring, loadCharacterModel,
} from './arena/weapons.js';
import {
    loadWeaponPickup, loadUtilityPickup, updateWeaponPickups, updateUtilityPickups,
    updateSpeedPowerup, getClosestWeaponPickup,
} from './arena/pickups.js';
import { updateEnemies, loadEnemyGuard, applyDamageToEnemy } from './arena/enemies.js';
import {
    attachInputHandlers, setupPauseMenuListeners, setupDeathScreenListeners,
    setupIngameSettingsModal, handleResize, updateGameTimer,
    handlePlayerDeath, applyDamageToPlayer,
} from './arena/input.js';
import { initAmbientDustParticles, updateParticles } from './arena/particles.js';

// Global hooks
window._arenaMouseState = mouseState;
window._arenaPlayerState = playerState;
window._arenaHandlePlayerDeath = handlePlayerDeath;
window._arenaApplyDamageToPlayer = applyDamageToPlayer;
window._arenaHandleMixerFinished = (ev) => handleMixerFinished(ev, pressedKeys, getSavedSettings());

// King of the Hill state variables
const hillCenter = new THREE.Vector3(0, FLOOR_Y_OFFSET, -5);
const hillRadius = 4.5;
let hillMesh = null;
let hillRing = null;
let hillLight = null;
let captureProgress = 0; // 0 to 100%
const captureTarget = 100;
let pointsAccumulated = 0;

// Override init functions
createEnvironment();
setupAudioUnlockHandlers();
ensureCityMusic();
updateHudHints();
updateWeaponHudValues();
setupPauseMenuListeners();
setupIngameSettingsModal();
setupDeathScreenListeners();
initAmbientDustParticles();
attachInputHandlers(utilityPickups, weaponPickups, multiplayerState, () => false);

// ── Map & character loader ──────────────────────────────────
const mapPaths = { town: '../Maps/Town.glb', desert: '../Maps/arena_city.glb', city: '../Maps/arena_city.glb' };
loadArenaMap(mapPaths[selectedMap] || '../Maps/arena_city.glb', {
    registerGround: true,
    registerColliders: true,
    colliderFilter: shouldUseAsMapCollider,
}).then(() => {
    // Add Hill Zone Visual Representation (Requirement 6: King of the Hill visual element)
    const hillGeo = new THREE.CylinderGeometry(hillRadius, hillRadius, 0.1, 32);
    const hillMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide
    });
    hillMesh = new THREE.Mesh(hillGeo, hillMat);
    hillMesh.position.copy(hillCenter).y += 0.05;
    scene.add(hillMesh);

    // Glowing border ring
    const ringGeo = new THREE.RingGeometry(hillRadius - 0.12, hillRadius + 0.12, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide
    });
    hillRing = new THREE.Mesh(ringGeo, ringMat);
    hillRing.position.copy(hillCenter).y += 0.06;
    scene.add(hillRing);

    // Subtle point light at the center
    hillLight = new THREE.PointLight(0xffaa00, 4, 10, 1.5);
    hillLight.position.copy(hillCenter).y += 0.75;
    scene.add(hillLight);

    // Load pickups
    loadWeaponPickup('../Weapons/AK-47.glb', -6, FLOOR_Y_OFFSET + 0.95, -8, 25);
    loadWeaponPickup('../Weapons/M4A1.glb', 0, FLOOR_Y_OFFSET + 0.95, -12, 25);
    loadWeaponPickup('../Weapons/AK-47.glb', 8, FLOOR_Y_OFFSET + 0.95, 2, 25);

    loadUtilityPickup('../PickUps/First Aid Kit.glb', -10, FLOOR_Y_OFFSET + 0.95, 10, 'medkit', 30);
    loadUtilityPickup('../PickUps/shield.glb', 11, FLOOR_Y_OFFSET + 0.95, -6, 'shield', 30);
    loadUtilityPickup('../PickUps/Pickup Thunder.glb', 3, FLOOR_Y_OFFSET + 0.95, 15, 'thunder', 30);

    // Load character model
    loadCharacterModel('../Characters/player_SWAG.glb').then(() => {
        // Spawn initial guards
        spawnHillGuard(new THREE.Vector3(-14, FLOOR_Y_OFFSET, -14));
        spawnHillGuard(new THREE.Vector3(14, FLOOR_Y_OFFSET, -14));
        spawnHillGuard(new THREE.Vector3(0, FLOOR_Y_OFFSET, 12));
        
        requestAnimationFrame(animate);
    });
});

function spawnHillGuard(pos) {
    loadEnemyGuard(pos).then(guard => {
        if (guard) {
            guard.patrolPath = [
                pos.clone(),
                hillCenter.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6))
            ];
            guard.patrolIndex = 0;
            guard.state = 'patrol';
        }
    });
}

// Custom enemy spawning loop for King of the Hill
let enemySpawnTimer = 0;
function updateKOTHSpawning(delta) {
    enemySpawnTimer += delta;
    if (enemySpawnTimer >= 14 && enemies.filter(e => !e.isDead).length < 5) {
        enemySpawnTimer = 0;
        const angle = Math.random() * Math.PI * 2;
        const spawnPos = new THREE.Vector3(
            Math.cos(angle) * 22,
            FLOOR_Y_OFFSET,
            Math.sin(angle) * 22 - 5
        );
        spawnHillGuard(spawnPos);
    }
}

// ── Game loop ─────────────────────────────────────────────────
handleResize();
updateThirdPersonCamera(0.016);

function animate() {
    const delta = Math.min(clock.getDelta(), 0.05);

    if (!gameState.isPaused && !gameState.isPlayerDead) {
        timeState.weapon += delta;

        updateGameTimer(delta);
        updateSpeedPowerup(delta);
        updatePlayer(delta);
        updateThirdPersonCamera(delta);
        mixers.forEach((m) => m.update(delta));
        updateRifleSocketAttachment();
        updateHeldWeaponAlignment();
        updateWeaponFiring(
            delta, enemies, enemyHitMeshOwner, applyDamageToEnemy,
            () => {}, false, multiplayerState
        );
        updateShotTracers(delta);
        updateMuzzleFlashes(delta);
        
        // Update enemies (passing false for multiplayer to run client-side AI)
        updateEnemies(delta, false, multiplayerState);
        updateFootstepAudio(pressedKeys);
        updateCrosshairVisibility();
        updateWeaponHudValues();
        updateParticles(delta);
        
        updateKOTHSpawning(delta);

        // Sweeping searchlight target animation (Requirement 3)
        const searchlightTarget = scene.getObjectByName('_arena_searchlight_target');
        if (searchlightTarget) {
            const time = clock.getElapsedTime() * 0.45;
            searchlightTarget.position.x = Math.sin(time) * 14;
            searchlightTarget.position.z = Math.cos(time * 0.7) * 14 - 4;
        }

        // Hill capture logic (Requirement 6)
        const playerDist = Math.hypot(playerRoot.position.x - hillCenter.x, playerRoot.position.z - hillCenter.z);
        const playerInHill = playerDist < hillRadius;
        
        // Check if any alive guard is also in the hill (contesting)
        const activeEnemies = enemies.filter(e => !e.isDead);
        const contested = activeEnemies.some(e => Math.hypot(e.root.position.x - hillCenter.x, e.root.position.z - hillCenter.z) < hillRadius);

        const promptPanel = document.getElementById('notification-panel');
        
        if (playerInHill) {
            if (contested) {
                // Contested status
                if (hillMesh) hillMesh.material.color.setHex(0xd9534f); // Red
                if (hillRing) hillRing.material.color.setHex(0xd9534f);
                if (hillLight) hillLight.color.setHex(0xd9534f);
                if (promptPanel) {
                    promptPanel.innerHTML = '<span style="color:#d9534f; font-weight:bold; letter-spacing:1px; animation: blink 1s infinite;">HILL CONTESTED</span>';
                }
            } else {
                // Capturing / Holding
                captureProgress = Math.min(captureTarget, captureProgress + delta * 5); // 20s to capture fully
                pointsAccumulated += delta * 15; // 15 points per sec
                
                gameState.score = Math.floor(pointsAccumulated);
                const scoreEl = document.getElementById('score');
                if (scoreEl) scoreEl.textContent = String(gameState.score);

                if (hillMesh) hillMesh.material.color.setHex(0x5cb85c); // Green
                if (hillRing) hillRing.material.color.setHex(0x5cb85c);
                if (hillLight) hillLight.color.setHex(0x5cb85c);
                
                if (promptPanel) {
                    promptPanel.innerHTML = `<span style="color:#5cb85c; font-weight:bold; letter-spacing:1px;">HOLDING HILL (${Math.floor(captureProgress)}%)</span>`;
                }

                // Check victory condition
                if (captureProgress >= captureTarget) {
                    // Stop game, show victory overlay
                    gameState.timerRunning = false;
                    document.getElementById('victory-score').textContent = String(gameState.score);
                    document.getElementById('victory-time').textContent = document.getElementById('time').textContent;
                    document.getElementById('victory-overlay').classList.add('active');
                    window._arenaStopPlayerLoops?.();
                }
            }
        } else {
            // Player not in hill
            if (hillMesh) hillMesh.material.color.setHex(0xffaa00); // Gold / yellow
            if (hillRing) hillRing.material.color.setHex(0xffaa00);
            if (hillLight) hillLight.color.setHex(0xffaa00);
            
            if (promptPanel) {
                if (contested) {
                    promptPanel.innerHTML = '<span style="color:#f39c12; font-style:italic;">Enemies contesting the hill...</span>';
                } else {
                    promptPanel.innerHTML = '<span style="color:#daa520; font-weight:bold; animation: pulse 2s infinite;">GET TO THE HILL ZONE!</span>';
                }
            }
        }

        // Animate visual hill elements
        if (hillRing) {
            hillRing.rotation.z += delta * 0.25;
        }
        if (hillMesh) {
            hillMesh.material.opacity = 0.12 + Math.sin(clock.getElapsedTime() * 3) * 0.05;
        }

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
        updateUtilityPickups(delta, timeState.weapon, () => {});
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
