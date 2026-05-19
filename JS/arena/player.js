import * as THREE from 'three';
import {
    playerRoot, playerState, movementConfig, baseMovementSpeeds, cameraRig, mouseState,
    animationBank, weaponState, pressedKeys, camera,
    tempVectorA, tempVectorB, tempVectorC, upAxis,
} from './game-state.js';
import { getSavedSettings } from './settings-utils.js';
import { getGroundHeightAt, resolveHorizontalCollisions, resolveCameraCollisionPosition } from './collision.js';
import { updateAnimationState } from './animations.js';

// ── Camera helpers ────────────────────────────────────────────
export function isAimActive() {
    const { hasWeaponEquipped, equippedWeaponType } = weaponState;
    return mouseState.isAimPressed && hasWeaponEquipped && equippedWeaponType === 'rifle';
}

export function getAimFacingAngle() {
    camera.getWorldDirection(tempVectorA);
    tempVectorA.y = 0;
    if (tempVectorA.lengthSq() < 0.000001) return playerState.facingAngle;
    tempVectorA.normalize();
    return Math.atan2(tempVectorA.x, tempVectorA.z);
}

function setCharacterFacingAngle(angle, deltaSeconds) {
    const rotFactor = 1 - Math.exp(-movementConfig.rotationSharpness * deltaSeconds);
    const shortestDelta = Math.atan2(Math.sin(angle - playerState.facingAngle), Math.cos(angle - playerState.facingAngle));
    playerState.facingAngle += shortestDelta * rotFactor;
    playerState.facingAngle = Math.atan2(Math.sin(playerState.facingAngle), Math.cos(playerState.facingAngle));
    playerRoot.rotation.y = playerState.facingAngle;
}

export function hasMovementInputPressed() {
    const settings = getSavedSettings();
    return Boolean(
        pressedKeys.has(settings.controls.moveForward) || pressedKeys.has('ArrowUp') ||
        pressedKeys.has(settings.controls.moveBackward) || pressedKeys.has('ArrowDown') ||
        pressedKeys.has(settings.controls.moveLeft) || pressedKeys.has('ArrowLeft') ||
        pressedKeys.has(settings.controls.moveRight) || pressedKeys.has('ArrowRight'),
    );
}

function getMovementInputDirection() {
    let inputForward = 0;
    let inputRight = 0;
    const settings = getSavedSettings();
    if (pressedKeys.has(settings.controls.moveForward) || pressedKeys.has('ArrowUp')) inputForward += 1;
    if (pressedKeys.has(settings.controls.moveBackward) || pressedKeys.has('ArrowDown')) inputForward -= 1;
    if (pressedKeys.has(settings.controls.moveLeft) || pressedKeys.has('ArrowLeft')) inputRight -= 1;
    if (pressedKeys.has(settings.controls.moveRight) || pressedKeys.has('ArrowRight')) inputRight += 1;
    tempVectorA.set(inputRight, 0, inputForward);
    if (tempVectorA.lengthSq() === 0) return tempVectorA;
    camera.getWorldDirection(tempVectorB);
    tempVectorB.y = 0;
    if (tempVectorB.lengthSq() < 0.000001) tempVectorB.set(Math.sin(cameraRig.yaw), 0, Math.cos(cameraRig.yaw));
    tempVectorB.normalize();
    tempVectorC.crossVectors(tempVectorB, upAxis).normalize();
    return tempVectorA.set(0, 0, 0).addScaledVector(tempVectorB, inputForward).addScaledVector(tempVectorC, inputRight).normalize();
}

// ── Player movement update ────────────────────────────────────
export function updatePlayer(deltaSeconds) {
    const moveDirection = getMovementInputDirection().clone();
    const hasMoveInput = moveDirection.lengthSq() > 0;
    const aiming = isAimActive();
    const isSprinting = !aiming && (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight'));
    const targetSpeed = aiming ? movementConfig.aimSpeed : (isSprinting ? movementConfig.sprintSpeed : movementConfig.walkSpeed);
    const acceleration = playerState.isGrounded ? movementConfig.accelerationGround : movementConfig.accelerationAir;

    tempVectorA.set(playerState.velocity.x, 0, playerState.velocity.z);
    tempVectorB.copy(moveDirection).multiplyScalar(targetSpeed);
    tempVectorA.lerp(tempVectorB, 1 - Math.exp(-acceleration * deltaSeconds));
    playerState.velocity.x = tempVectorA.x;
    playerState.velocity.z = tempVectorA.z;

    if (aiming) setCharacterFacingAngle(getAimFacingAngle(), deltaSeconds);
    else if (hasMoveInput) setCharacterFacingAngle(Math.atan2(moveDirection.x, moveDirection.z), deltaSeconds);

    if (playerState.hasJumpQueued && playerState.isGrounded) {
        playerState.velocity.y = movementConfig.jumpStrength;
        playerState.isGrounded = false;
    }
    playerState.hasJumpQueued = false;
    playerState.velocity.y = Math.max(playerState.velocity.y - (movementConfig.gravity * deltaSeconds), -movementConfig.terminalVelocity);

    const startPosition = playerRoot.position.clone();
    tempVectorC.set(playerState.velocity.x, 0, playerState.velocity.z);
    const hCandidate = startPosition.clone().addScaledVector(tempVectorC, deltaSeconds);
    const resolvedH = resolveHorizontalCollisions(startPosition, hCandidate, playerState);
    playerRoot.position.x = resolvedH.x;
    playerRoot.position.z = resolvedH.z;
    playerState.velocity.x = (resolvedH.x - startPosition.x) / Math.max(deltaSeconds, 0.0001);
    playerState.velocity.z = (resolvedH.z - startPosition.z) / Math.max(deltaSeconds, 0.0001);

    const vertCandY = playerRoot.position.y + (playerState.velocity.y * deltaSeconds);
    tempVectorC.copy(playerRoot.position);
    tempVectorC.y = vertCandY;
    const groundHeight = getGroundHeightAt(tempVectorC);
    const canSnap = playerState.velocity.y <= 0 && vertCandY <= groundHeight + movementConfig.groundSnapDistance;

    if (canSnap) {
        playerRoot.position.y = groundHeight;
        playerState.velocity.y = 0;
        playerState.isGrounded = true;
        playerState.currentGroundHeight = groundHeight;
    } else {
        playerRoot.position.y = vertCandY;
        playerState.isGrounded = false;
    }

    // Expose to animation system via global (avoids circular dep)
    window._arenaPlayerState = playerState;
    updateAnimationState(hasMoveInput, isSprinting, mouseState);
}

// ── Third-person camera update ────────────────────────────────
export function updateThirdPersonCamera(deltaSeconds) {
    const aiming = isAimActive();
    const lookOffset = aiming ? cameraRig.aimLookOffset : cameraRig.lookOffset;
    const shoulderOffset = aiming ? cameraRig.aimShoulderOffset : cameraRig.shoulderOffset;
    const cameraDist = THREE.MathUtils.clamp(
        cameraRig.distance + (aiming ? cameraRig.aimDistanceOffset : 0),
        cameraRig.minDistance, cameraRig.maxDistance,
    );

    tempVectorA.copy(playerRoot.position).add(lookOffset);
    cameraRig.target.lerp(tempVectorA, 1 - Math.exp(-cameraRig.targetSharpness * deltaSeconds));

    tempVectorB.set(shoulderOffset.x, shoulderOffset.y, cameraDist)
        .applyEuler(new THREE.Euler(cameraRig.pitch, cameraRig.yaw, 0, 'YXZ'));
    tempVectorC.copy(cameraRig.target).add(tempVectorB);
    const collisionPos = resolveCameraCollisionPosition(cameraRig.target, tempVectorC);
    camera.position.lerp(collisionPos, 1 - Math.exp(-cameraRig.positionSharpness * deltaSeconds));
    camera.lookAt(cameraRig.target);
}

export function applyMovementSpeedMultiplier(multiplier = 1) {
    movementConfig.walkSpeed = baseMovementSpeeds.walk * multiplier;
    movementConfig.sprintSpeed = baseMovementSpeeds.sprint * multiplier;
    movementConfig.aimSpeed = baseMovementSpeeds.aim * multiplier;
}
