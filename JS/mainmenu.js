// Main Menu JavaScript - Crownfall
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function getSavedSettings() {
    const defaults = {
        musicVolume: 100,
        effectsVolume: 100,
        muteAll: false,
        controls: {
            moveForward: 'KeyW',
            moveLeft: 'KeyA',
            moveBackward: 'KeyS',
            moveRight: 'KeyD',
            use: 'KeyE',
            shoot: 'Mouse0',
            reload: 'KeyR'
        }
    };
    try {
        const saved = localStorage.getItem('crownfall_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                ...defaults,
                ...parsed,
                controls: { ...defaults.controls, ...(parsed.controls || {}) }
            };
        }
    } catch (e) {}
    return defaults;
}

const settings = getSavedSettings();
const mainMenuMusic = new Audio('../Sounds/main_menu.mp3');
mainMenuMusic.loop = true;
mainMenuMusic.volume = settings.muteAll ? 0 : 0.22 * (settings.musicVolume / 100);

function playMainMenuMusic() {
    mainMenuMusic.play().catch(() => {});
}

function setupMainMenuMusicUnlock() {
    const unlockMusic = () => {
        playMainMenuMusic();
    };

    document.addEventListener('pointerdown', unlockMusic, { once: true });
    document.addEventListener('keydown', unlockMusic, { once: true });
    playMainMenuMusic();
}

function playMenuSound(path, defaultVolume = 0.5) {
    const currentSettings = getSavedSettings();
    if (currentSettings.muteAll) return;
    const finalVolume = defaultVolume * (currentSettings.effectsVolume / 100);
    const sound = new Audio(path);
    sound.volume = Math.max(0, Math.min(1, finalVolume));
    sound.play().catch(() => {});
}

function playNavigationSound() {
    playMenuSound('../Sounds/empty_mag.mp3', 0.12);
}

function playSelectSound() {
    playMenuSound('../Sounds/powerup.mp3', 0.2);
}

function playBackSound() {
    playMenuSound('../Sounds/empty_mag.mp3', 0.18);
}


// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    setupMainMenuMusicUnlock();
    
    // Get all menu items
    const menuItems = document.querySelectorAll('.menu-item');
    let currentSelection = 0;
    
    // Initialize menu
    function initMenu() {
        if (menuItems.length > 0) {
            selectMenuItem(0);
        }
        
        // Add entrance animation sound effect trigger point
        setTimeout(() => {
            console.log('Menu fully loaded');
        }, 1000);
    }
    
    // Select a menu item
    function selectMenuItem(index) {
        // Remove selection from all items
        menuItems.forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to current item
        if (menuItems[index]) {
            menuItems[index].classList.add('selected');
            currentSelection = index;
            
            // Optional: Add visual highlight
            const link = menuItems[index].querySelector('a');
            if (link) {
                link.style.borderColor = '#daa520';
                link.style.backgroundColor = 'rgba(218, 165, 32, 0.15)';
            }
        }
    }
    
    // Remove selection styling
    function deselectAll() {
        menuItems.forEach(item => {
            const link = item.querySelector('a');
            if (link) {
                link.style.borderColor = '';
                link.style.backgroundColor = '';
            }
        });
    }
    
    // Match Settings Modal States & Logic
    let isModalOpen = false;
    let matchIsMultiplayer = false;
    let selectedMap = 'city';
    let selectedDifficulty = 'medium';
    let selectedDuration = 10; // default Wave 10

    const matchModal = document.getElementById('match-modal');
    const modalClose = document.getElementById('modal-close');
    const launchMatchBtn = document.getElementById('launch-match-btn');
    const mapCards = document.querySelectorAll('.map-card');
    const diffBtns = document.querySelectorAll('.diff-btn');

    function openMatchSettingsModal(isMultiplayer) {
        matchIsMultiplayer = isMultiplayer;
        isModalOpen = true;
        
        // Reset selections to defaults
        selectedMap = 'city';
        selectedDifficulty = 'medium';
        selectedDuration = 10;
        
        // Reset duration dropdown
        const durationSelect = document.getElementById('duration-select');
        if (durationSelect) durationSelect.value = '10';
        
        mapCards.forEach(c => c.classList.remove('active'));
        const defaultCard = document.querySelector('.map-card[data-map="city"]');
        if (defaultCard) defaultCard.classList.add('active');
        
        diffBtns.forEach(b => b.classList.remove('active'));
        const defaultDiff = document.querySelector('.diff-btn[data-diff="medium"]');
        if (defaultDiff) defaultDiff.classList.add('active');
        
        matchModal.classList.add('visible');
        playSelectSound();
    }

    function closeMatchSettingsModal() {
        isModalOpen = false;
        matchModal.classList.remove('visible');
        playBackSound();
    }

    function launchMatch() {
        const durationSelect = document.getElementById('duration-select');
        if (durationSelect) selectedDuration = parseInt(durationSelect.value, 10);
        let url = `arena.html?map=${selectedMap}&difficulty=${selectedDifficulty}&maxWaves=${selectedDuration}`;
        if (matchIsMultiplayer) {
            url = `arena.html?multiplayer=1&map=${selectedMap}&difficulty=${selectedDifficulty}&maxWaves=${selectedDuration}`;
        }
        
        playSelectSound();
        launchMatchBtn.style.transform = 'scale(0.95)';
        launchMatchBtn.disabled = true;
        
        setTimeout(() => {
            window.location.href = url;
        }, 300);
    }

    // Modal Events
    if (modalClose) {
        modalClose.addEventListener('click', closeMatchSettingsModal);
    }
    
    if (matchModal) {
        matchModal.addEventListener('click', (e) => {
            if (e.target === matchModal) {
                closeMatchSettingsModal();
            }
        });
    }

    mapCards.forEach(card => {
        card.addEventListener('click', () => {
            mapCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedMap = card.getAttribute('data-map');
            playNavigationSound();
        });
    });

    diffBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            diffBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDifficulty = btn.getAttribute('data-diff');
            playNavigationSound();
        });
    });

    if (launchMatchBtn) {
        launchMatchBtn.addEventListener('click', launchMatch);
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (isModalOpen) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeMatchSettingsModal();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                launchMatch();
            }
            return;
        }

        switch(e.key) {
            case 'ArrowDown':
            case 's':
            case 'S':
                e.preventDefault();
                currentSelection = (currentSelection + 1) % menuItems.length;
                selectMenuItem(currentSelection);
                playNavigationSound();
                break;
                
            case 'ArrowUp':
            case 'w':
            case 'W':
                e.preventDefault();
                currentSelection = (currentSelection - 1 + menuItems.length) % menuItems.length;
                selectMenuItem(currentSelection);
                playNavigationSound();
                break;
                
            case 'Enter':
                e.preventDefault();
                if (menuItems[currentSelection]) {
                    const link = menuItems[currentSelection].querySelector('a');
                    if (link) {
                        const isSP = menuItems[currentSelection].getAttribute('data-index') === '1';
                        const isMP = menuItems[currentSelection].getAttribute('data-index') === '2';
                        
                        if (isSP || isMP) {
                            openMatchSettingsModal(isMP);
                        } else {
                            playSelectSound();
                            // Add click animation
                            link.style.transform = 'translateX(10px) scale(0.95)';
                            setTimeout(() => {
                                window.location.href = link.href;
                            }, 200);
                        }
                    }
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                playBackSound();
                console.log('Back action (ESC pressed)');
                break;
        }
    });
    
    // Mouse hover effects
    menuItems.forEach((item, index) => {
        const link = item.querySelector('a');
        
        link.addEventListener('mouseenter', function() {
            if (!isModalOpen) {
                currentSelection = index;
                playNavigationSound();
            }
        });
        
        link.addEventListener('click', function(e) {
            const isSP = item.getAttribute('data-index') === '1';
            const isMP = item.getAttribute('data-index') === '2';
            
            if (isSP || isMP) {
                e.preventDefault();
                openMatchSettingsModal(isMP);
            } else {
                playSelectSound();
            }
        });
    }); 
    
    // Initialize the menu
    initMenu();
    init3DBackground();
    
    // Add version info to console
    console.log('%c Crownfall ', 'background: #1a1410; color: #daa520; font-size: 20px; font-weight: bold;');
    console.log('%c Arena Survival Multiplayer - Main Menu v1.0.0 ', 'background: #2d2418; color: #d4c5a9; font-size: 12px;');
    console.log('%c Use Arrow Keys or W/S to navigate | ENTER to select | ESC to go back ', 'color: #a8906e;');
});

// Prevent context menu on right click for immersive experience
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// Add loading screen fade out effect
window.addEventListener('load', function() {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s';
        document.body.style.opacity = '1';
    }, 100);
});

function init3DBackground() {
    const canvas = document.getElementById('menu-canvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    // Solid pitch-black atmospheric background
    scene.background = new THREE.Color(0x050403);
    scene.fog = new THREE.FogExp2(0x050403, 0.12);

    // Camera positioned to view the entire framed layout from further away
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 11.5);

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: false, // Set to false to cover the brown CSS gradient completely
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lights - moderately raised ambient for better detail visibility on unlit sides
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambientLight);

    // Sweeping Gold Spotlight with no distance decay (decay = 0) and high intensity (800)
    const spotLightRight = new THREE.SpotLight(0xdaa520, 800);
    spotLightRight.position.set(6.2, 8, 5.0); // Positioned further forward to hit the front of the weapons
    spotLightRight.angle = Math.PI / 2.5; // Wider cone angle for maximum coverage
    spotLightRight.penumbra = 0.8;
    spotLightRight.decay = 0; // Constant intensity over distance
    scene.add(spotLightRight);

    // Sweeping Cyan Spotlight with no distance decay (decay = 0) and high intensity (800)
    const spotLightLeft = new THREE.SpotLight(0x00ffff, 800);
    spotLightLeft.position.set(-6.2, 8, 5.0); // Positioned further forward to hit the front of the weapons
    spotLightLeft.angle = Math.PI / 2.5; // Wider cone angle for maximum coverage
    spotLightLeft.penumbra = 0.8;
    spotLightLeft.decay = 0; // Constant intensity over distance
    scene.add(spotLightLeft);

    // Groups to hold models - pushed slightly wider to match the deeper camera position
    const showcaseGroup = new THREE.Group(); // Right group (M4A1 & Crown)
    showcaseGroup.position.set(window.innerWidth > 768 ? 6.2 : 0, -0.5, 0);
    scene.add(showcaseGroup);

    const leftGroup = new THREE.Group(); // Left group (AK-47)
    leftGroup.position.set(window.innerWidth > 768 ? -6.2 : 0, -0.5, 0);
    scene.add(leftGroup);

    // Nested local point lights to create a gorgeous radiant internal glow envelope
    const localGlowRight = new THREE.PointLight(0xdaa520, 35, 6);
    localGlowRight.position.set(0, 0.2, 0.5);
    showcaseGroup.add(localGlowRight);

    const localGlowLeft = new THREE.PointLight(0x00ffff, 35, 6);
    localGlowLeft.position.set(0, 0.2, 0.5);
    leftGroup.add(localGlowLeft);

    // Setup Spotlight targets
    spotLightRight.target = showcaseGroup;
    spotLightLeft.target = leftGroup;

    const loader = new GLTFLoader();
    let m4a1Model = null;
    let crownModel = null;
    let ak47Model = null;

    // Load M4A1 (Right side)
    loader.load('../Weapons/M4A1.glb', (gltf) => {
        m4a1Model = gltf.scene;
        m4a1Model.scale.set(0.65, 0.65, 0.65);
        m4a1Model.position.set(0, -0.4, 0);
        m4a1Model.rotation.set(0.1, -Math.PI / 4, 0);
        
        m4a1Model.traverse((child) => {
            if (child.isMesh) {
                child.material.roughness = 0.2;
                child.material.metalness = 0.9;
                if (child.material.emissive) {
                    child.material.emissive.setHex(0xdaa520);
                    child.material.emissiveIntensity = 1.2;
                }
                // Bright glowing wireframe overlay
                const wireframeGeom = new THREE.WireframeGeometry(child.geometry);
                const wireframeMat = new THREE.LineBasicMaterial({ color: 0xdaa520, transparent: true, opacity: 0.75 });
                const wireframe = new THREE.LineSegments(wireframeGeom, wireframeMat);
                child.add(wireframe);
            }
        });
        showcaseGroup.add(m4a1Model);
    }, undefined, (e) => console.warn('Failed to load M4A1 model', e));

    // Load Crown (Right side - floating above M4A1)
    loader.load('../PickUps/Crown.glb', (gltf) => {
        crownModel = gltf.scene;
        crownModel.scale.set(0.8, 0.8, 0.8);
        crownModel.position.set(0, 0.9, 0);
        
        crownModel.traverse((child) => {
            if (child.isMesh) {
                child.material.roughness = 0.05;
                child.material.metalness = 0.95;
                if (child.material.emissive) {
                    child.material.emissive.setHex(0xdaa520);
                    child.material.emissiveIntensity = 2.8;
                }
                // Bright cyan glowing wireframe overlay for the crown
                const wireframeGeom = new THREE.WireframeGeometry(child.geometry);
                const wireframeMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.85 });
                const wireframe = new THREE.LineSegments(wireframeGeom, wireframeMat);
                child.add(wireframe);
            }
        });
        showcaseGroup.add(crownModel);
    }, undefined, (e) => console.warn('Failed to load Crown model', e));

    // Load AK-47 (Left side)
    loader.load('../Weapons/AK-47.glb', (gltf) => {
        ak47Model = gltf.scene;
        ak47Model.scale.set(0.65, 0.65, 0.65);
        ak47Model.position.set(0, -0.1, 0);
        ak47Model.rotation.set(0.1, Math.PI / 4, 0);
        
        ak47Model.traverse((child) => {
            if (child.isMesh) {
                child.material.roughness = 0.2;
                child.material.metalness = 0.9;
                if (child.material.emissive) {
                    child.material.emissive.setHex(0x00ffff);
                    child.material.emissiveIntensity = 1.2;
                }
                // Bright cyan glowing wireframe overlay for AK-47
                const wireframeGeom = new THREE.WireframeGeometry(child.geometry);
                const wireframeMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.75 });
                const wireframe = new THREE.LineSegments(wireframeGeom, wireframeMat);
                child.add(wireframe);
            }
        });
        leftGroup.add(ak47Model);
    }, undefined, (e) => console.warn('Failed to load AK-47 model', e));

    // Interactive mouse rotation tracking
    let targetX = 0;
    let targetY = 0;
    window.addEventListener('mousemove', (e) => {
        targetX = (e.clientX - window.innerWidth / 2) * 0.0003;
        targetY = (e.clientY - window.innerHeight / 2) * 0.0003;
    });

    // Handle resizing
    window.addEventListener('resize', () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        showcaseGroup.position.set(width > 768 ? 6.2 : 0, -0.5, 0);
        leftGroup.position.set(width > 768 ? -6.2 : 0, -0.5, 0);
    });

    // Animation loop
    const clock = new THREE.Clock();

    // Make spotlight beams follow the breathing floating models
    function animate() {
        requestAnimationFrame(animate);

        const elapsed = clock.getElapsedTime();

        // Slow rotations and floating
        if (m4a1Model) {
            m4a1Model.rotation.y = elapsed * 0.25;
            m4a1Model.position.y = -0.4 + Math.sin(elapsed * 1.5) * 0.08;
        }

        if (crownModel) {
            crownModel.rotation.y = -elapsed * 0.35;
            crownModel.position.y = 0.9 + Math.sin(elapsed * 2.0) * 0.12;
            crownModel.rotation.z = Math.sin(elapsed * 0.8) * 0.05;
        }

        if (ak47Model) {
            ak47Model.rotation.y = -elapsed * 0.25;
            ak47Model.position.y = -0.1 + Math.sin(elapsed * 1.7) * 0.08;
        }

        // Sweeping spotlights from higher above aiming exactly at weapon centers
        spotLightRight.position.x = 6.2 + Math.sin(elapsed * 0.4) * 1.2;
        spotLightRight.position.z = 5.0 + Math.cos(elapsed * 0.4) * 0.8;

        spotLightLeft.position.x = -6.2 - Math.sin(elapsed * 0.4) * 1.2;
        spotLightLeft.position.z = 5.0 + Math.cos(elapsed * 0.4) * 0.8;

        // Smooth mouse lag tracking on both left and right groups
        showcaseGroup.rotation.y += (targetX - showcaseGroup.rotation.y) * 0.05;
        showcaseGroup.rotation.x += (targetY - showcaseGroup.rotation.x) * 0.05;

        leftGroup.rotation.y += (targetX - leftGroup.rotation.y) * 0.05;
        leftGroup.rotation.x += (targetY - leftGroup.rotation.x) * 0.05;

        renderer.render(scene, camera);
    }

    animate();
}
