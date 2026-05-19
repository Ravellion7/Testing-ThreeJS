import * as THREE from 'three';
import {
    animationBank, animationActions, mixers, weaponState, weaponCombatDefaults,
} from './game-state.js';
import { updateWeaponHudValues } from './hud.js';

export function normalizeAnimationKey(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function findClipByNames(animations, names) {
    if (!animations || animations.length === 0) return null;
    const hints = names.map(normalizeAnimationKey).filter(Boolean);
    if (hints.length === 0) return null;
    return animations.find((clip) => {
        const clipName = String(clip.name || '').toLowerCase();
        const normClip = normalizeAnimationKey(clip.name);
        return hints.some((h) => clipName.includes(h) || normClip.includes(h) || h.includes(normClip));
    }) || null;
}

export function rebuildAnimationBank(animations) {
    const byExact = (name) => animations.find((c) => c.name === name)?.name || null;
    const nonWeaponIdle = animations.find((c) => c.name === 'player_idle')
        || animations.find((c) => /idle/i.test(c.name) && !/rifle|gun|shoot|aim|run|walk|jump|fall|death|out/i.test(c.name))
        || animations.find((c) => !/rifle|gun|shoot|aim|run|walk|jump|fall|death|out/i.test(c.name));

    animationBank.idle = nonWeaponIdle?.name || findClipByNames(animations, ['breath'])?.name || animations[0]?.name || null;
    animationBank.idleGun = byExact('player_rifle_idle') || findClipByNames(animations, ['rifle_idle', 'idle_gun', 'idlegun'])?.name || null;
    animationBank.aimGun = byExact('player_rifle_aim') || findClipByNames(animations, ['rifle_aim', 'aim'])?.name || animationBank.idleGun;
    animationBank.aimMoveGun = byExact('player_rifle_run') || findClipByNames(animations, ['rifle_run'])?.name || animationBank.walkGun;
    animationBank.shootStillGun = byExact('player_rifle_shoot_still') || findClipByNames(animations, ['rifle_shoot_still', 'shoot_still'])?.name || animationBank.idleGun;
    animationBank.shootWalkGun = byExact('player_rifle_shoot_walk') || findClipByNames(animations, ['rifle_shoot_walk', 'shoot_walk'])?.name || animationBank.walkGun || animationBank.shootStillGun;
    animationBank.reloadStillGun = byExact('rifle_reload_still') || byExact('player_rifle_reload_still') || findClipByNames(animations, ['rifle_reload_still', 'reload_still'])?.name || animationBank.idleGun;
    animationBank.reloadWalkGun = byExact('rifle_reload_walk') || byExact('player_rifle_reload_walk') || findClipByNames(animations, ['rifle_reload_walk', 'reload_walk'])?.name || animationBank.walkGun || animationBank.reloadStillGun;
    animationBank.walk = byExact('player_walk') || findClipByNames(animations, ['walk'])?.name || null;
    animationBank.run = byExact('player_run') || findClipByNames(animations, ['run', 'jog'])?.name || animationBank.walk;
    animationBank.walkGun = byExact('player_rifle_run') || findClipByNames(animations, ['rifle_run'])?.name || null;
    animationBank.runGun = byExact('player_rifle_walk') || byExact('player_rifle_run_noaim') || findClipByNames(animations, ['rifle_walk', 'run_noaim'])?.name || animationBank.walkGun;
    animationBank.jump = byExact('player_jump_up') || byExact('player_jump') || findClipByNames(animations, ['jump'])?.name || null;
    animationBank.fall = byExact('player_fall') || findClipByNames(animations, ['fall'])?.name || null;
    animationBank.equip = byExact('player_rifle_out') || findClipByNames(animations, ['rifle_out', 'equip', 'grab'])?.name || null;
}

export function playAction(name, transitionSeconds = 0.2) {
    const nextAction = animationActions.get(name);
    if (!nextAction || nextAction === weaponState.activeAction) return;
    if (weaponState.activeAction) weaponState.activeAction.fadeOut(transitionSeconds);
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;
    nextAction.reset().fadeIn(transitionSeconds).play();
    weaponState.activeAction = nextAction;
}

export function playEquipAction() {
    if (!animationBank.equip) return false;
    const equipAction = animationActions.get(animationBank.equip);
    if (!equipAction) return false;
    if (weaponState.activeAction && weaponState.activeAction !== equipAction) weaponState.activeAction.fadeOut(0.15);
    weaponState.isEquipAnimating = true;
    equipAction.reset();
    equipAction.setLoop(THREE.LoopOnce, 1);
    equipAction.clampWhenFinished = true;
    equipAction.fadeIn(0.15).play();
    weaponState.activeAction = equipAction;
    return true;
}

export function playReloadAction(name) {
    if (!name || !weaponState.currentMixer) return false;
    const reloadAction = animationActions.get(name);
    if (!reloadAction) return false;
    if (weaponState.activeAction && weaponState.activeAction !== reloadAction) weaponState.activeAction.fadeOut(0.12);
    weaponState.isReloadAnimating = true;
    weaponState.activeReloadActionName = name;
    reloadAction.reset();
    reloadAction.setLoop(THREE.LoopOnce, 1);
    reloadAction.clampWhenFinished = true;
    reloadAction.fadeIn(0.1).play();
    weaponState.activeAction = reloadAction;
    return true;
}

export function getPostReloadActionName(pressedKeys, settings) {
    const { hasWeaponEquipped, equippedWeaponType } = weaponState;
    const isAimPressed = window._arenaMouseState?.isAimPressed ?? false;
    const isRifle = hasWeaponEquipped && equippedWeaponType === 'rifle';
    const aiming = isAimPressed && isRifle;
    const moving = Boolean(
        pressedKeys.has(settings.controls.moveForward) || pressedKeys.has('ArrowUp') ||
        pressedKeys.has(settings.controls.moveBackward) || pressedKeys.has('ArrowDown') ||
        pressedKeys.has(settings.controls.moveLeft) || pressedKeys.has('ArrowLeft') ||
        pressedKeys.has(settings.controls.moveRight) || pressedKeys.has('ArrowRight'),
    );
    const sprinting = !aiming && (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight'));
    if (!isRifle) {
        if (moving) return sprinting ? (animationBank.run || animationBank.walk || animationBank.idle) : (animationBank.walk || animationBank.run || animationBank.idle);
        return animationBank.idle;
    }
    if (moving) {
        if (aiming) return animationBank.aimMoveGun || animationBank.walkGun || animationBank.runGun || animationBank.idleGun || animationBank.idle;
        return sprinting
            ? (animationBank.runGun || animationBank.run || animationBank.walkGun || animationBank.idleGun || animationBank.idle)
            : (animationBank.walkGun || animationBank.walk || animationBank.runGun || animationBank.run || animationBank.idleGun || animationBank.idle);
    }
    if (aiming) return animationBank.aimGun || animationBank.idleGun || animationBank.idle;
    return animationBank.idleGun || animationBank.idle;
}

export function handleMixerFinished(event, pressedKeys, settings) {
    if (!weaponState.isEquipAnimating) {
        const reloadAction = weaponState.activeReloadActionName ? animationActions.get(weaponState.activeReloadActionName) : null;
        if (weaponState.isReloadAnimating && reloadAction && event.action === reloadAction) {
            const { hasWeaponEquipped, equippedWeaponType, equippedWeaponCombatState } = weaponState;
            if (hasWeaponEquipped && equippedWeaponType === 'rifle' && equippedWeaponCombatState) {
                const magSize = Math.max(0, equippedWeaponCombatState.magazineSize || weaponCombatDefaults.rifle.magazineSize);
                const needed = Math.max(0, magSize - Math.max(0, equippedWeaponCombatState.currentAmmo || 0));
                const toLoad = Math.min(needed, Math.max(0, equippedWeaponCombatState.totalAmmo || 0));
                equippedWeaponCombatState.currentAmmo = Math.max(0, equippedWeaponCombatState.currentAmmo || 0) + toLoad;
                equippedWeaponCombatState.totalAmmo = Math.max(0, equippedWeaponCombatState.totalAmmo || 0) - toLoad;
                updateWeaponHudValues();
            }
            weaponState.isReloadAnimating = false;
            weaponState.activeReloadActionName = null;
            weaponState.lastGroundedActionName = getPostReloadActionName(pressedKeys, settings);
            if (weaponState.lastGroundedActionName) playAction(weaponState.lastGroundedActionName, 0.3);
        }
        return;
    }
    const equipAction = animationActions.get(animationBank.equip);
    if (!equipAction || event.action !== equipAction) return;
    weaponState.isEquipAnimating = false;
    weaponState.lastGroundedActionName = (weaponState.hasWeaponEquipped && weaponState.equippedWeaponType === 'rifle' && animationBank.idleGun) ? animationBank.idleGun : animationBank.idle;
    if (weaponState.lastGroundedActionName) playAction(weaponState.lastGroundedActionName);
}

export function updateAnimationState(hasMoveInput, isSprinting, mouseState) {
    if (weaponState.isEquipAnimating || weaponState.isReloadAnimating) return;
    const { hasWeaponEquipped, equippedWeaponType, equippedWeaponCombatState } = weaponState;
    const isRifle = hasWeaponEquipped && equippedWeaponType === 'rifle';
    const aiming = mouseState.isAimPressed && isRifle;
    const baseIdle = (isRifle && aiming && animationBank.aimGun) ? animationBank.aimGun : (isRifle && animationBank.idleGun ? animationBank.idleGun : animationBank.idle);
    const canShoot = isRifle && equippedWeaponCombatState && (equippedWeaponCombatState.currentAmmo > 0);
    let actionName = baseIdle;

    const playerVelY = window._arenaPlayerState?.velocity?.y ?? 0;
    const isGrounded = window._arenaPlayerState?.isGrounded ?? true;

    if (!isGrounded) {
        if (playerVelY > 1 && animationBank.jump) actionName = animationBank.jump;
        else if (playerVelY <= 1 && animationBank.fall) actionName = animationBank.fall;
        else actionName = weaponState.lastGroundedActionName || animationBank.idle;
    } else if (hasMoveInput) {
        if (isRifle) {
            if (mouseState.isFirePressed && canShoot && animationBank.shootWalkGun) actionName = animationBank.shootWalkGun;
            else if (aiming) actionName = animationBank.aimMoveGun || animationBank.walkGun || animationBank.runGun || animationBank.run;
            else actionName = isSprinting ? (animationBank.runGun || animationBank.run) : (animationBank.walkGun || animationBank.walk || animationBank.runGun || animationBank.run);
        } else {
            actionName = isSprinting ? animationBank.run : (animationBank.walk || animationBank.run);
        }
        weaponState.lastGroundedActionName = actionName || weaponState.lastGroundedActionName;
    } else {
        if (isRifle && mouseState.isFirePressed && canShoot && animationBank.shootStillGun) actionName = animationBank.shootStillGun;
        weaponState.lastGroundedActionName = baseIdle || weaponState.lastGroundedActionName;
    }

    if (actionName) playAction(actionName);
    if (weaponState.activeAction) weaponState.activeAction.setEffectiveTimeScale(isSprinting ? 1.15 : 1);
}

export function buildEnemyAnimationBank(animations) {
    const byExact = (name) => animations.find((c) => c.name === name)?.name || null;
    return {
        idleGun: byExact('enemy_rifle_idle') || findClipByNames(animations, ['enemy_rifle_idle', 'rifle_idle'])?.name || animations[0]?.name || null,
        walkGun: byExact('enemy_rifle_walk') || findClipByNames(animations, ['enemy_rifle_walk', 'rifle_walk'])?.name || null,
        shootStillGun: byExact('enemy_rifle_shoot_still') || findClipByNames(animations, ['enemy_rifle_shoot_still', 'shoot_still'])?.name || null,
        reloadStillGun: byExact('enemy_rifle_reload_stand') || findClipByNames(animations, ['enemy_rifle_reload_stand', 'reload_stand'])?.name || null,
        reloadWalkGun: byExact('enemy_rifle_reload_walk') || findClipByNames(animations, ['enemy_rifle_reload_walk', 'reload_walk'])?.name || null,
        deathGun: byExact('enemy_rifle_death') || findClipByNames(animations, ['enemy_rifle_death', 'death'])?.name || null,
    };
}
