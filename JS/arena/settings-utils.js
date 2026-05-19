// No imports needed — pure functions using only localStorage and DOM.

let settingsSavedTimeout = null;

export function getSavedSettings() {
    const defaults = {
        musicVolume: 100,
        effectsVolume: 100,
        muteAll: false,
        controls: {
            moveForward: 'KeyW', moveLeft: 'KeyA', moveBackward: 'KeyS',
            moveRight: 'KeyD', use: 'KeyE', shoot: 'Mouse0', reload: 'KeyR',
        },
        graphics: { quality: 'medium', shadows: true, particles: true },
        nickname: '',
    };
    try {
        const saved = localStorage.getItem('crownfall_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                ...defaults, ...parsed,
                controls: { ...defaults.controls, ...(parsed.controls || {}) },
                graphics: { ...defaults.graphics, ...(parsed.graphics || {}) },
            };
        }
    } catch (e) {
        console.error('Failed to load settings', e);
    }
    return defaults;
}

export function showSettingsSavedNotification() {
    let toast = document.getElementById('settings-saved-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'settings-saved-toast';
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:rgba(17,13,10,.9);border:1px solid #daa520;box-shadow:0 0 15px rgba(218,165,32,.3);border-radius:6px;padding:10px 20px;color:#fff;font-family:monospace;font-size:13px;letter-spacing:.05em;text-transform:uppercase;z-index:10001;pointer-events:none;opacity:0;transition:opacity .3s ease,transform .3s ease;transform:translateY(10px)';
        toast.textContent = 'Settings Saved Successfully';
        document.body.appendChild(toast);
    }
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    if (settingsSavedTimeout) clearTimeout(settingsSavedTimeout);
    settingsSavedTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
    }, 2000);
}

export function saveSettings(settings) {
    try {
        localStorage.setItem('crownfall_settings', JSON.stringify(settings));
        showSettingsSavedNotification();
        return true;
    } catch (e) {
        console.error('Failed to save settings', e);
        return false;
    }
}
