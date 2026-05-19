import * as THREE from 'three';
import { scene } from './game-state.js';

// Active particles array
const activeParticles = [];

// Particle pool to avoid garbage collection overhead
const particlePool = [];

// Create a single shared geometry and material for individual spark meshes for compatibility and simplicity
const sparkGeometry = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const sparkMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
});

// Ambient dust particles system
let dustPoints = null;
const dustCount = 120;
const dustSpeedY = -0.15;
const dustBounds = {
    x: [-35, 35],
    y: [-0.1, 15],
    z: [-35, 35]
};

/**
 * Spawns a cluster of physical spark particles at a given position.
 * @param {THREE.Vector3} position - World position of the impact.
 * @param {THREE.Vector3} normal - Surface normal vector.
 */
export function spawnBulletImpactParticles(position, normal) {
    const particleCount = 12;
    const gravity = -9.8;
    
    for (let i = 0; i < particleCount; i++) {
        // Reuse mesh from pool or create new
        let mesh;
        if (particlePool.length > 0) {
            mesh = particlePool.pop();
            mesh.material.opacity = 0.95;
            mesh.scale.set(1, 1, 1);
        } else {
            mesh = new THREE.Mesh(sparkGeometry, sparkMaterial.clone());
        }
        
        mesh.position.copy(position);
        scene.add(mesh);
        
        // Compute outward velocity vector reflecting off normal with random spread
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 4 + (normal ? normal.x * 2.5 : 0),
            Math.random() * 4.5 + (normal ? normal.y * 3.5 : 2.5),
            (Math.random() - 0.5) * 4 + (normal ? normal.z * 2.5 : 0)
        );
        
        activeParticles.push({
            mesh: mesh,
            velocity: velocity,
            life: 0,
            maxLife: 0.4 + Math.random() * 0.35,
            gravity: gravity
        });
    }
}

/**
 * Initializes ambient dust particles floating in the air.
 */
export function initAmbientDustParticles() {
    if (dustPoints) {
        scene.remove(dustPoints);
        dustPoints.geometry.dispose();
    }
    
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(dustCount * 3);
    const velocities = [];
    
    for (let i = 0; i < dustCount; i++) {
        // Random initial coordinates within bounds
        positions[i * 3] = THREE.MathUtils.randFloat(dustBounds.x[0], dustBounds.x[1]);
        positions[i * 3 + 1] = THREE.MathUtils.randFloat(dustBounds.y[0], dustBounds.y[1]);
        positions[i * 3 + 2] = THREE.MathUtils.randFloat(dustBounds.z[0], dustBounds.z[1]);
        
        // Random drift speed
        velocities.push({
            x: (Math.random() - 0.5) * 0.1,
            y: (Math.random() * 0.5 + 0.2) * dustSpeedY,
            z: (Math.random() - 0.5) * 0.1
        });
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0xdaa520,
        size: 0.12,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        sizeAttenuation: true
    });
    
    dustPoints = new THREE.Points(geometry, material);
    scene.add(dustPoints);
    
    dustPoints.userData = { velocities };
}

/**
 * Updates both the impact sparks and the ambient dust particles.
 * @param {number} deltaSeconds - Time elapsed since last frame.
 */
export function updateParticles(deltaSeconds) {
    // 1. Update impact sparks
    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const p = activeParticles[i];
        p.life += deltaSeconds;
        
        // Apply gravity
        p.velocity.y += p.gravity * deltaSeconds;
        
        // Update position
        p.mesh.position.addScaledVector(p.velocity, deltaSeconds);
        
        // Shrink and fade
        const progress = p.life / p.maxLife;
        p.mesh.material.opacity = 0.95 * (1 - progress);
        const scale = 1 - progress * 0.85;
        p.mesh.scale.set(scale, scale, scale);
        
        if (p.life >= p.maxLife) {
            scene.remove(p.mesh);
            particlePool.push(p.mesh);
            activeParticles.splice(i, 1);
        }
    }
    
    // 2. Update ambient dust
    if (dustPoints && dustPoints.geometry) {
        const positionAttr = dustPoints.geometry.getAttribute('position');
        const velocities = dustPoints.userData.velocities;
        
        for (let i = 0; i < dustCount; i++) {
            let px = positionAttr.getX(i);
            let py = positionAttr.getY(i);
            let pz = positionAttr.getZ(i);
            
            const v = velocities[i];
            px += v.x * deltaSeconds;
            py += v.y * deltaSeconds;
            pz += v.z * deltaSeconds;
            
            // Wrap particles around bounds to keep them in scene
            if (px < dustBounds.x[0] || px > dustBounds.x[1]) v.x *= -1;
            if (pz < dustBounds.z[0] || pz > dustBounds.z[1]) v.z *= -1;
            if (py < dustBounds.y[0]) {
                py = dustBounds.y[1]; // Respawn at the top
            }
            
            positionAttr.setXYZ(i, px, py, pz);
        }
        
        positionAttr.needsUpdate = true;
    }
}
