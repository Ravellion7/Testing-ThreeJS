import * as THREE from 'three';
import { scene, loader, EXRLoader, renderer, FLOOR_Y_OFFSET, selectedMap } from './game-state.js';
import { registerGroundRoot, registerCollisionRoot, registerGroundMesh, registerCollisionMesh } from './collision.js';

export function setShadowProperties(object) {
    object.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (Array.isArray(child.material)) {
            child.material.forEach((m) => { m.needsUpdate = true; });
        } else if (child.material) {
            child.material.needsUpdate = true;
        }
    });
}

export function createEnvironment() {
    let hemiSky = 0xbfd8ff, hemiGround = 0x182030, dirColor = 0xffffff;
    let fillColor = 0x6ea8ff, groundColor = 0x243040, fogColor = 0x0b1020;
    let gridColor = 0xdaa520, gridLineColor = 0x37506c;
    let hdriPath = null;

    if (selectedMap === 'town') {
        hemiSky = 0x90a0ff; hemiGround = 0x0c1020; dirColor = 0xddddff;
        fillColor = 0x4e78cc; groundColor = 0x101a2e; fogColor = 0x070c18;
        gridColor = 0x00ffff; gridLineColor = 0x153550;
        scene.background = new THREE.Color(fogColor);
        scene.fog = new THREE.Fog(fogColor, 30, 120);
        hdriPath = '../HDRIS/farm_field_puresky_2k.exr';
    } else if (selectedMap === 'desert') {
        hemiSky = 0xffebc2; hemiGround = 0x3c2d1e; dirColor = 0xffe2a6;
        fillColor = 0xff9c37; groundColor = 0x8a6d45; fogColor = 0x4f361a;
        gridColor = 0xdaa520; gridLineColor = 0x7c542a;
        scene.background = new THREE.Color(fogColor);
        scene.fog = new THREE.Fog(fogColor, 15, 80);
    } else {
        scene.background = new THREE.Color(0x0b1020);
        scene.fog = new THREE.Fog(0x0b1020, 30, 120);
        hdriPath = '../HDRIS/aristea_wreck_puresky_2k.exr';
    }

    if (hdriPath) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        new EXRLoader().load(hdriPath, (tex) => {
            const envMap = pmrem.fromEquirectangular(tex).texture;
            scene.background = envMap;
            scene.environment = envMap;
            tex.dispose();
            pmrem.dispose();
        }, undefined, (e) => console.warn('HDRI load failed', e));
    }

    scene.add(new THREE.HemisphereLight(hemiSky, hemiGround, 1.6));

    const dir = new THREE.DirectionalLight(dirColor, 2.2);
    dir.position.set(12, 18, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 80;
    dir.shadow.camera.left = -30; dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30; dir.shadow.camera.bottom = -30;
    scene.add(dir);

    const fill = new THREE.PointLight(fillColor, 10, 30, 2);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    const ground = new THREE.Mesh(
        new THREE.CircleGeometry(70, 64),
        new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.95, metalness: 0.02 }),
    );
    ground.name = 'fallback_ground';
    ground.position.y = FLOOR_Y_OFFSET;
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    registerGroundMesh(ground);

    const grid = new THREE.GridHelper(140, 70, gridColor, gridLineColor);
    grid.position.y = FLOOR_Y_OFFSET + 0.02;
    grid.material.opacity = 0.45;
    grid.material.transparent = true;
    scene.add(grid);
}

// ── Boundary fence auto-detection ────────────────────────────
// Flat fence meshes (aspect ratio > 6:1) can't be used as direct colliders
// because the player spawns inside them. Instead we build 4 invisible
// vertical walls at the perimeter edges so the player is contained inside.
function createBoundaryWallsFromFence(mesh) {
    const worldBox = new THREE.Box3().setFromObject(mesh);
    const cx = (worldBox.min.x + worldBox.max.x) / 2;
    const cz = (worldBox.min.z + worldBox.max.z) / 2;
    const sizeX = worldBox.max.x - worldBox.min.x;
    const sizeZ = worldBox.max.z - worldBox.min.z;
    const wallThick = 0.6;
    const wallHeight = 4.0;
    const baseY = worldBox.min.y + wallHeight / 2;
    const wallMat = new THREE.MeshBasicMaterial({ visible: false });

    [
        // [posX, posY, posZ, scaleX, scaleZ]  — N / S / E / W walls
        [cx,               baseY, worldBox.max.z, sizeX + wallThick * 2, wallThick],
        [cx,               baseY, worldBox.min.z, sizeX + wallThick * 2, wallThick],
        [worldBox.max.x,   baseY, cz,             wallThick,             sizeZ],
        [worldBox.min.x,   baseY, cz,             wallThick,             sizeZ],
    ].forEach(([px, py, pz, sx, sz]) => {
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(sx, wallHeight, sz),
            wallMat.clone(),
        );
        wall.name = '_boundary_wall';
        wall.position.set(px, py, pz);
        scene.add(wall);
        registerCollisionMesh(wall);
    });

    console.log(`[BoundaryFence] Created 4 walls for "${mesh.name}" (${Math.round(sizeX)}×${Math.round(sizeZ)})`);
}

function registerBoundaryFencesInMap(root) {
    root.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        const name = String(child.name || '').toLowerCase();
        // Only process meshes with "fence" in the name
        if (!name.includes('fence')) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        const b = child.geometry.boundingBox;
        const ws = new THREE.Vector3();
        child.getWorldScale(ws);
        const ww = Math.abs(b.max.x - b.min.x) * Math.abs(ws.x);
        const wh = Math.abs(b.max.y - b.min.y) * Math.abs(ws.y);
        const wd = Math.abs(b.max.z - b.min.z) * Math.abs(ws.z);
        const maxH = Math.max(ww, wd);
        const floorAspect = maxH / Math.max(wh, 0.001);
        // Only flat perimeter fences (wide & thin)
        if (floorAspect > 6 && wh < 2.0) {
            createBoundaryWallsFromFence(child);
        }
    });
}

export async function loadArenaMap(modelPath = '../Maps/arena_city.glb', options = {}) {
    const {
        registerGround = true,
        registerColliders = false,
        colliderFilter = (m) => Boolean(m.userData.collider) || /collider|wall|block|obstacle/i.test(m.name),
        registerBoundaries = true,
    } = options;
    try {
        const gltf = await loader.loadAsync(modelPath);
        const map = gltf.scene;
        map.position.set(0, FLOOR_Y_OFFSET, 0);
        map.scale.setScalar(1);
        setShadowProperties(map);
        scene.add(map);
        if (registerGround) registerGroundRoot(map);
        if (registerColliders) registerCollisionRoot(map, { filter: colliderFilter });
        if (registerBoundaries) registerBoundaryFencesInMap(map);
        return gltf;
    } catch (e) {
        console.warn('Arena map could not be loaded, using fallback.', e);
        return null;
    }
}

export function shouldUseAsMapCollider(mesh) {
    if (!mesh || !mesh.isMesh || !mesh.geometry) return false;
    const name = String(mesh.name || '').toLowerCase();

    // Always exclude sky, sky-like, and ground/floor meshes by name
    const exclude = ['ground','floor','road','street','sidewalk','terrain','grass','decal','water','cloud','light','lamp','particle','fx','plane','helper','fountain','pool','basin','pond'];
    const hasSky = /(^|[^a-z0-9])sky([^a-z0-9]|$)/i.test(name) || name.includes('skybox') || name.includes('skydome');
    if (hasSky || exclude.some((h) => name.includes(h))) return false;

    // Compute world-space dimensions FIRST — this lets us veto flat meshes
    // even when their name matches the include list (e.g. a 57×0.7×57 "fence" perimeter).
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    if (!b) return false;
    const ws = new THREE.Vector3();
    mesh.getWorldScale(ws);
    const lw = Math.abs(b.max.x - b.min.x), lh = Math.abs(b.max.y - b.min.y), ld = Math.abs(b.max.z - b.min.z);
    const ww = lw * Math.abs(ws.x), wh = lh * Math.abs(ws.y), wd = ld * Math.abs(ws.z);
    const maxH = Math.max(ww, wd), minH = Math.min(ww, wd);

    // Reject very thin meshes (horizontal planes, decals, etc.)
    if (wh < 0.45) return false;
    // Reject wide flat planes (floor slabs, perimeter fences, terrain borders):
    // when horizontal span is 6× larger than vertical height AND height < 2 m, it's a ground-plane.
    const floorAspect = maxH / Math.max(wh, 0.001);
    if (floorAspect > 6 && wh < 2.0) return false;

    // Now safe to check by name — flat meshes already vetoed above
    const include = ['collider','wall','building','house','tower','block','obstacle','barrier','fence','gate','garage','hangar','container','pillar','stable','inn','market','storage'];
    if (include.some((h) => name.includes(h))) return true;

    // Generic size-based inclusion for meshes with non-descriptive names
    if (wh >= 1.2 && minH >= 0.2) return true;
    if (maxH >= 2.2 && wh >= 0.35) return true;
    return false;
}
