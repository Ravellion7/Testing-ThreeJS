import {
    collisionState, movementConfig, enemyConfig,
    tempVectorA, tempVectorB, tempBox,
    downwardAxis, groundRaycaster,
    cameraCollisionConfig, cameraCollisionRaycaster,
    cameraCollisionTempA, cameraCollisionTempB,
} from './game-state.js';

// ── Ground mesh registration ──────────────────────────────────
export function registerGroundMesh(mesh) {
    if (!mesh || collisionState.groundMeshes.includes(mesh)) return mesh;
    collisionState.groundMeshes.push(mesh);
    return mesh;
}

export function registerGroundRoot(root, filter = (mesh) => mesh.isMesh) {
    root.traverse((child) => {
        if (child.isMesh && filter(child)) registerGroundMesh(child);
    });
    return root;
}

export function registerCollisionMesh(mesh) {
    if (!mesh || collisionState.colliderMeshes.includes(mesh)) return mesh;
    collisionState.colliderMeshes.push(mesh);
    return mesh;
}

export function unregisterCollisionMesh(mesh) {
    const idx = collisionState.colliderMeshes.indexOf(mesh);
    if (idx >= 0) collisionState.colliderMeshes.splice(idx, 1);
    return mesh;
}

export function registerCollisionRoot(root, options = {}) {
    const { filter = (mesh) => Boolean(mesh.userData.collider) || /collider|wall|block|obstacle/i.test(mesh.name) } = options;
    root.traverse((child) => {
        if (child.isMesh && filter(child)) registerCollisionMesh(child);
    });
    return root;
}

export function setGroundResolver(resolver) {
    collisionState.groundResolver = typeof resolver === 'function' ? resolver : () => 0;
}

export function setCollisionResolver(resolver) {
    collisionState.customResolver = typeof resolver === 'function' ? resolver : null;
}

// ── Ground height query ───────────────────────────────────────
export function getGroundHeightAt(position) {
    let bestGroundHeight = collisionState.groundResolver(position, null);
    if (collisionState.groundMeshes.length === 0) return bestGroundHeight;

    tempVectorB.copy(position);
    tempVectorB.y += movementConfig.capsuleHeight + movementConfig.stepHeight + 3;
    groundRaycaster.set(tempVectorB, downwardAxis);
    groundRaycaster.far = movementConfig.capsuleHeight + movementConfig.stepHeight + 6;

    const intersections = groundRaycaster.intersectObjects(collisionState.groundMeshes, false);
    const validHit = intersections.find((hit) => {
        if (!hit.face || hit.face.normal.y <= 0.2) return false;
        return hit.point.y <= position.y + movementConfig.stepHeight + movementConfig.groundSnapDistance;
    });

    if (!validHit) return bestGroundHeight;
    bestGroundHeight = Math.max(bestGroundHeight, validHit.point.y);
    return bestGroundHeight;
}

// ── Horizontal collision resolution (player) ─────────────────
export function resolveHorizontalCollisions(currentPosition, candidatePosition, playerState) {
    const resolved = candidatePosition.clone();
    for (let iteration = 0; iteration < 2; iteration++) {
        collisionState.colliderMeshes.forEach((mesh) => {
            if (!mesh.parent) return;
            tempBox.setFromObject(mesh);
            const playerMinY = currentPosition.y;
            const playerMaxY = currentPosition.y + movementConfig.capsuleHeight;
            const steppedOver = tempBox.max.y <= currentPosition.y + movementConfig.stepHeight;
            const verticalMiss = playerMaxY <= tempBox.min.y || playerMinY >= tempBox.max.y;
            if (steppedOver || verticalMiss) return;

            const closestX = Math.max(tempBox.min.x, Math.min(resolved.x, tempBox.max.x));
            const closestZ = Math.max(tempBox.min.z, Math.min(resolved.z, tempBox.max.z));
            const deltaX = resolved.x - closestX;
            const deltaZ = resolved.z - closestZ;
            const distSq = (deltaX * deltaX) + (deltaZ * deltaZ);
            const rSq = movementConfig.capsuleRadius * movementConfig.capsuleRadius;
            if (distSq >= rSq) return;

            if (distSq === 0) {
                // Player is inside the mesh — push toward nearest edge, but cap the distance
                // to prevent flying far out of the map (large environment boxes).
                tempBox.getCenter(tempVectorA);
                const px = resolved.x - tempVectorA.x;
                const pz = resolved.z - tempVectorA.z;
                const maxPush = movementConfig.capsuleRadius * 3;
                if (Math.abs(px) > Math.abs(pz)) {
                    const edge = px >= 0 ? tempBox.max.x : tempBox.min.x;
                    const target = edge + (px >= 0 ? movementConfig.capsuleRadius : -movementConfig.capsuleRadius);
                    const push = target - resolved.x;
                    resolved.x += Math.sign(push) * Math.min(Math.abs(push), maxPush);
                } else {
                    const edge = pz >= 0 ? tempBox.max.z : tempBox.min.z;
                    const target = edge + (pz >= 0 ? movementConfig.capsuleRadius : -movementConfig.capsuleRadius);
                    const push = target - resolved.z;
                    resolved.z += Math.sign(push) * Math.min(Math.abs(push), maxPush);
                }
                return;
            }
            const dist = Math.sqrt(distSq);
            const pen = movementConfig.capsuleRadius - dist;
            resolved.x += (deltaX / dist) * pen;
            resolved.z += (deltaZ / dist) * pen;
        });
    }

    if (collisionState.customResolver) {
        const customResolved = collisionState.customResolver({ currentPosition, candidatePosition: resolved.clone(), playerState, movementConfig });
        if (customResolved && typeof customResolved.isVector3 === 'boolean') resolved.copy(customResolved);
    }
    return resolved;
}

// ── Horizontal collision resolution (enemy) ──────────────────
export function resolveEnemyHorizontalCollisions(enemy, currentPosition, candidatePosition) {
    const resolved = candidatePosition.clone();
    for (let iteration = 0; iteration < 2; iteration++) {
        collisionState.colliderMeshes.forEach((mesh) => {
            if (!mesh.parent) return;
            tempBox.setFromObject(mesh);
            const minY = currentPosition.y;
            const maxY = currentPosition.y + enemyConfig.capsuleHeight;
            const steppedOver = tempBox.max.y <= currentPosition.y + enemyConfig.stepHeight;
            const verticalMiss = maxY <= tempBox.min.y || minY >= tempBox.max.y;
            if (steppedOver || verticalMiss) return;

            const closestX = Math.max(tempBox.min.x, Math.min(resolved.x, tempBox.max.x));
            const closestZ = Math.max(tempBox.min.z, Math.min(resolved.z, tempBox.max.z));
            const deltaX = resolved.x - closestX;
            const deltaZ = resolved.z - closestZ;
            const distSq = (deltaX * deltaX) + (deltaZ * deltaZ);
            const rSq = enemyConfig.capsuleRadius * enemyConfig.capsuleRadius;
            if (distSq >= rSq) return;

            if (distSq === 0) {
                tempBox.getCenter(tempVectorA);
                const px = resolved.x - tempVectorA.x;
                const pz = resolved.z - tempVectorA.z;
                if (Math.abs(px) > Math.abs(pz)) {
                    resolved.x = px >= 0 ? tempBox.max.x + enemyConfig.capsuleRadius : tempBox.min.x - enemyConfig.capsuleRadius;
                } else {
                    resolved.z = pz >= 0 ? tempBox.max.z + enemyConfig.capsuleRadius : tempBox.min.z - enemyConfig.capsuleRadius;
                }
                return;
            }
            const dist = Math.sqrt(distSq);
            resolved.x += (deltaX / dist) * (enemyConfig.capsuleRadius - dist);
            resolved.z += (deltaZ / dist) * (enemyConfig.capsuleRadius - dist);
        });
    }
    return resolved;
}

// ── Camera collision ──────────────────────────────────────────
export function resolveCameraCollisionPosition(targetPosition, desiredPosition) {
    if (collisionState.colliderMeshes.length === 0) return desiredPosition;
    cameraCollisionTempA.subVectors(desiredPosition, targetPosition);
    const desiredDist = cameraCollisionTempA.length();
    if (desiredDist <= 0.0001) return desiredPosition;
    cameraCollisionTempA.normalize();
    cameraCollisionRaycaster.set(targetPosition, cameraCollisionTempA);
    cameraCollisionRaycaster.far = desiredDist;
    const hits = cameraCollisionRaycaster.intersectObjects(collisionState.colliderMeshes, false);
    const hit = hits.find((e) => e.distance > 0.0001);
    if (!hit) return desiredPosition;
    const safeDist = Math.max(cameraCollisionConfig.minDistanceFromTarget, hit.distance - cameraCollisionConfig.wallPadding);
    return cameraCollisionTempB.copy(targetPosition).addScaledVector(cameraCollisionTempA, safeDist);
}
