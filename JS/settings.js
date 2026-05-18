// Settings JavaScript - Crownfall
// Full implementation with data persistence and key-binding system

const mainMenuMusic = new Audio('../Sounds/main_menu.mp3');
mainMenuMusic.loop = true;
mainMenuMusic.volume = 0.22;

// Default settings object
const defaultSettings = {
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
    },
    graphics: {
        quality: 'medium',
        shadows: true,
        particles: true
    },
    nickname: ''
};

// Currently loaded settings
let activeSettings = { ...defaultSettings };
let activeBindingButton = null;

// Helper to get friendly key name for display
function getFriendlyKeyName(code) {
    if (!code) return 'NONE';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code === 'Space') return 'Space';
    if (code === 'ArrowUp') return 'Arrow Up';
    if (code === 'ArrowDown') return 'Arrow Down';
    if (code === 'ArrowLeft') return 'Arrow Left';
    if (code === 'ArrowRight') return 'Arrow Right';
    if (code === 'Mouse0') return 'Left Mouse';
    if (code === 'Mouse1') return 'Middle Mouse';
    if (code === 'Mouse2') return 'Right Mouse';
    return code;
}

// Load settings from localStorage
function loadSettings() {
    try {
        const saved = localStorage.getItem('crownfall_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            activeSettings = {
                ...defaultSettings,
                ...parsed,
                controls: { ...defaultSettings.controls, ...(parsed.controls || {}) },
                graphics: { ...defaultSettings.graphics, ...(parsed.graphics || {}) }
            };
        } else {
            activeSettings = JSON.parse(JSON.stringify(defaultSettings));
        }
    } catch (e) {
        console.error('Failed to load settings', e);
        activeSettings = JSON.parse(JSON.stringify(defaultSettings));
    }
}

// Save settings to localStorage
function saveSettingsToStorage() {
    try {
        localStorage.setItem('crownfall_settings', JSON.stringify(activeSettings));
        return true;
    } catch (e) {
        console.error('Failed to save settings', e);
        return false;
    }
}

function applyAudioSettings() {
    if (activeSettings.muteAll) {
        mainMenuMusic.volume = 0;
    } else {
        mainMenuMusic.volume = 0.22 * (activeSettings.musicVolume / 100);
    }
}

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

// Initialize settings page
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    applyAudioSettings();
    setupMainMenuMusicUnlock();
    
    // Set UI elements from active settings
    updateUIFromSettings();
    initializeEventListeners();
    
    console.log('%c Crownfall Settings Loaded ', 'background: #1a1410; color: #daa520; font-size: 16px; font-weight: bold;');
});

// Update all UI elements based on activeSettings
function updateUIFromSettings() {
    // Audio elements
    document.getElementById('music-volume').value = activeSettings.musicVolume;
    document.getElementById('music-value').textContent = activeSettings.musicVolume + '%';
    
    document.getElementById('effects-volume').value = activeSettings.effectsVolume;
    document.getElementById('effects-value').textContent = activeSettings.effectsVolume + '%';
    
    document.getElementById('mute-all').checked = activeSettings.muteAll;
    
    // Disable volume sliders if mute-all is checked
    toggleSlidersState(activeSettings.muteAll);

    // Controls buttons
    document.querySelectorAll('.key-bind-btn').forEach(btn => {
        const action = btn.dataset.action;
        if (action && activeSettings.controls[action]) {
            btn.textContent = getFriendlyKeyName(activeSettings.controls[action]);
        }
    });

    // Graphics
    if (activeSettings.graphics.quality) {
        document.getElementById('graphics-quality').value = activeSettings.graphics.quality;
    }
    document.getElementById('enable-shadows').checked = activeSettings.graphics.shadows;
    document.getElementById('enable-particles').checked = activeSettings.graphics.particles;

    // Nickname
    document.getElementById('player-nickname').value = activeSettings.nickname || '';
}

function toggleSlidersState(isMuted) {
    const musicSlider = document.getElementById('music-volume');
    const effectsSlider = document.getElementById('effects-volume');
    if (isMuted) {
        musicSlider.setAttribute('disabled', 'true');
        effectsSlider.setAttribute('disabled', 'true');
    } else {
        musicSlider.removeAttribute('disabled');
        effectsSlider.removeAttribute('disabled');
    }
}

// Initialize all event listeners
function initializeEventListeners() {
    // Music Volume change
    document.getElementById('music-volume').addEventListener('input', function(e) {
        activeSettings.musicVolume = parseInt(e.target.value);
        document.getElementById('music-value').textContent = activeSettings.musicVolume + '%';
        applyAudioSettings();
    });
    document.getElementById('music-volume').addEventListener('change', function(e) {
        saveSettingsToStorage();
        showStatusMessage('Settings saved successfully!');
    });

    // Effects Volume change
    document.getElementById('effects-volume').addEventListener('input', function(e) {
        activeSettings.effectsVolume = parseInt(e.target.value);
        document.getElementById('effects-value').textContent = activeSettings.effectsVolume + '%';
    });
    document.getElementById('effects-volume').addEventListener('change', function(e) {
        saveSettingsToStorage();
        showStatusMessage('Settings saved successfully!');
    });

    // Mute All toggle
    document.getElementById('mute-all').addEventListener('change', function(e) {
        activeSettings.muteAll = e.target.checked;
        toggleSlidersState(activeSettings.muteAll);
        applyAudioSettings();
        saveSettingsToStorage();
        showStatusMessage('Settings saved successfully!');
    });

    // Key binding modal handlers
    const modal = document.getElementById('key-bind-modal');
    const cancelBindBtn = document.getElementById('cancel-bind');

    document.querySelectorAll('.key-bind-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            activeBindingButton = btn;
            modal.style.display = 'flex';
            
            // Add listeners to capture the next input
            window.addEventListener('keydown', handleKeyBindingInput);
            window.addEventListener('mousedown', handleMouseBindingInput);
        });
    });

    function closeKeyBindModal() {
        modal.style.display = 'none';
        activeBindingButton = null;
        window.removeEventListener('keydown', handleKeyBindingInput);
        window.removeEventListener('mousedown', handleMouseBindingInput);
    }

    cancelBindBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeKeyBindModal();
    });

    function handleKeyBindingInput(e) {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
            closeKeyBindModal();
            return;
        }

        if (activeBindingButton) {
            const action = activeBindingButton.dataset.action;
            activeSettings.controls[action] = e.code;
            activeBindingButton.textContent = getFriendlyKeyName(e.code);
            saveSettingsToStorage();
            showStatusMessage('Settings saved successfully!');
            closeKeyBindModal();
        }
    }

    function handleMouseBindingInput(e) {
        // Exclude cancel button click
        if (e.target.id === 'cancel-bind' || e.target.closest('#cancel-bind')) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();

        if (activeBindingButton) {
            const action = activeBindingButton.dataset.action;
            const mouseCode = 'Mouse' + e.button; // Mouse0, Mouse1, Mouse2
            activeSettings.controls[action] = mouseCode;
            activeBindingButton.textContent = getFriendlyKeyName(mouseCode);
            saveSettingsToStorage();
            showStatusMessage('Settings saved successfully!');
            closeKeyBindModal();
        }
    }

    // Graphics changes
    document.getElementById('graphics-quality').addEventListener('change', function(e) {
        activeSettings.graphics.quality = e.target.value;
        saveSettingsToStorage();
        showStatusMessage('Settings saved successfully!');
    });

    document.getElementById('enable-shadows').addEventListener('change', function(e) {
        activeSettings.graphics.shadows = e.target.checked;
        saveSettingsToStorage();
        showStatusMessage('Settings saved successfully!');
    });

    document.getElementById('enable-particles').addEventListener('change', function(e) {
        activeSettings.graphics.particles = e.target.checked;
        saveSettingsToStorage();
        showStatusMessage('Settings saved successfully!');
    });

    // Nickname changes
    document.getElementById('player-nickname').addEventListener('change', function(e) {
        activeSettings.nickname = e.target.value.trim();
        saveSettingsToStorage();
        showStatusMessage('Settings saved successfully!');
    });

    // Reset controls button
    document.getElementById('reset-controls').addEventListener('click', function(e) {
        e.preventDefault();
        activeSettings.controls = { ...defaultSettings.controls };
        updateUIFromSettings();
        saveSettingsToStorage();
        showStatusMessage('Controls reset to default keys.');
    });
    
    // Save button
    document.getElementById('save-settings').addEventListener('click', function(e) {
        e.preventDefault();
        
        // Grab values from graphics and nickname
        activeSettings.graphics.quality = document.getElementById('graphics-quality').value;
        activeSettings.graphics.shadows = document.getElementById('enable-shadows').checked;
        activeSettings.graphics.particles = document.getElementById('enable-particles').checked;
        activeSettings.nickname = document.getElementById('player-nickname').value.trim();

        if (saveSettingsToStorage()) {
            showStatusMessage('Settings saved successfully!');
        } else {
            showStatusMessage('Error saving settings.', true);
        }
    });
    
    // Back button
    document.getElementById('back-to-menu').addEventListener('click', function() {
        window.location.href = 'mainmenu.html';
    });
    
    // ESC key to go back (unless binding modal is open)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display !== 'flex') {
            window.location.href = 'mainmenu.html';
        }
    });
}

function showStatusMessage(text, isError = false) {
    const msgEl = document.getElementById('status-message');
    if (!msgEl) return;
    
    msgEl.textContent = text;
    msgEl.className = 'status-message'; // Reset classes
    msgEl.classList.add(isError ? 'error' : 'success');
    msgEl.classList.add('show');
    
    setTimeout(() => {
        msgEl.classList.remove('show');
    }, 3000);
}
