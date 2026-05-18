// King of the Hill HUD JavaScript - Crownfall
// Front-end only - static display, no game simulation

// Initialize the HUD
document.addEventListener('DOMContentLoaded', function() {
    setupPauseMenuListeners();
    
    console.log('%c Crownfall King of the Hill HUD ', 'background: #1a1410; color: #daa520; font-size: 16px; font-weight: bold;');
});

// ==================== PAUSE MENU FUNCTIONS ====================

function setupPauseMenuListeners() {
    const pauseOverlay = document.getElementById('pause-overlay');
    const continueBtn = document.getElementById('continue-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const menuBtn = document.getElementById('menu-btn');
    const ingameSettingsOverlay = document.getElementById('ingame-settings-overlay');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const backToGameBtn = document.getElementById('back-to-game-btn');
    
    // ESC key to toggle pause menu
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (pauseOverlay.classList.contains('active') && !ingameSettingsOverlay.classList.contains('active')) {
                resumeGame();
            } else if (!pauseOverlay.classList.contains('active')) {
                pauseGame();
            }
        }
    });
    
    // Continue button - resume game
    if (continueBtn) {
        continueBtn.addEventListener('click', function() {
            resumeGame();
        });
    }
    
    // Settings button - open in-game settings overlay
    if (settingsBtn) {
        settingsBtn.addEventListener('click', function() {
            ingameSettingsOverlay.classList.add('active');
        });
    }
    
    // Main Menu button - navigate to main menu
    if (menuBtn) {
        menuBtn.addEventListener('click', function() {
            window.location.href = 'mainmenu.html';
        });
    }
    
    // Close settings button - close overlay, return to pause menu
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', function() {
            ingameSettingsOverlay.classList.remove('active');
        });
    }
    
    // Back to game button - close settings, return to pause menu
    if (backToGameBtn) {
        backToGameBtn.addEventListener('click', function() {
            ingameSettingsOverlay.classList.remove('active');
        });
    }
}

function pauseGame() {
    const pauseOverlay = document.getElementById('pause-overlay');
    pauseOverlay.classList.add('active');
}

function resumeGame() {
    const pauseOverlay = document.getElementById('pause-overlay');
    pauseOverlay.classList.remove('active');
    const ingameSettingsOverlay = document.getElementById('ingame-settings-overlay');
    ingameSettingsOverlay.classList.remove('active');
}
