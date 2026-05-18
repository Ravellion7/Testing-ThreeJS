// Credits JavaScript - Crownfall

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

// Initialize credits page
document.addEventListener('DOMContentLoaded', function() {
    setupMainMenuMusicUnlock();
    initializeEventListeners();
});

// Initialize event listeners
function initializeEventListeners() {
    // Back button
    document.getElementById('back-btn').addEventListener('click', function() {
        window.location.href = 'mainmenu.html';
    });
    
    // ESC key to go back
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            window.location.href = 'mainmenu.html';
        }
    });
    
}

// Easter egg: Konami code
let konamiCode = [];
const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

document.addEventListener('keydown', function(e) {
    konamiCode.push(e.key);
    
    if (konamiCode.length > konamiSequence.length) {
        konamiCode.shift();
    }
    
    if (konamiCode.join(',') === konamiSequence.join(',')) {
        activateEasterEgg();
        konamiCode = [];
    }
});

// Easter egg activation
function activateEasterEgg() {
    const container = document.querySelector('.credits-container');
    container.style.animation = 'none';
    
    // Rainbow effect
    let hue = 0;
    const rainbowInterval = setInterval(() => {
        hue = (hue + 5) % 360;
        container.style.borderColor = `hsl(${hue}, 70%, 50%)`;
        document.querySelectorAll('.member-name, .game-name, .credits-title').forEach(el => {
            el.style.color = `hsl(${hue}, 70%, 60%)`;
        });
    }, 50);
    
    // Stop after 5 seconds
    setTimeout(() => {
        clearInterval(rainbowInterval);
        container.style.borderColor = '';
        document.querySelectorAll('.member-name, .game-name, .credits-title').forEach(el => {
            el.style.color = '';
        });
    }, 5000);
    
}

// Prevent context menu
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// Add loading screen fade in effect
window.addEventListener('load', function() {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s';
        document.body.style.opacity = '1';
    }, 100);
});

