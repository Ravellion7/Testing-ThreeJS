// Leaderboard JavaScript - Crownfall
// Front-end only - no data management, only navigation

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

function fetchLeaderboard() {
    const statusMsg = document.getElementById('status-message');
    if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.textContent = 'Loading scores from server...';
    }

    try {
        const wsUrl = 'ws://localhost:8080';
        const socket = new WebSocket(wsUrl);

        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({ type: 'get_leaderboard' }));
        });

        socket.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'leaderboard_data') {
                    renderLeaderboard(message.data);
                    if (statusMsg) statusMsg.style.display = 'none';
                    socket.close();
                }
            } catch (e) {
                console.error(e);
            }
        });

        socket.addEventListener('error', () => {
            if (statusMsg) {
                statusMsg.style.display = 'block';
                statusMsg.textContent = 'Failed to connect to score server.';
            }
        });
    } catch (e) {
        if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.textContent = 'Failed to load leaderboard.';
        }
    }
}

function renderLeaderboard(data) {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #a8906e; padding: 20px;">No scores recorded yet. Be the first!</td></tr>`;
        return;
    }

    data.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.className = 'slide-in';
        row.style.animationDelay = (index * 0.05) + 's';

        const rank = index + 1;
        const name = entry.name || 'Anonymous';
        const mode = entry.mode || 'Arena';
        const score = Number(entry.score || 0).toLocaleString();
        const date = entry.date || '01/01';

        row.innerHTML = `
            <td class="col-position">${rank}</td>
            <td class="col-player"><span class="player-name">${name}</span></td>
            <td class="col-mode"><span class="mode-badge mode-${mode.toLowerCase()}">${mode}</span></td>
            <td class="col-score"><span class="score-value">${score}</span></td>
            <td class="col-date"><span class="date-value">${date}</span></td>
        `;
        tbody.appendChild(row);
    });
}

// Initialize leaderboard page
document.addEventListener('DOMContentLoaded', function() {
    setupMainMenuMusicUnlock();
    initializeEventListeners();
    fetchLeaderboard();
    
    console.log('%c Crownfall Leaderboard ', 'background: #1a1410; color: #daa520; font-size: 16px; font-weight: bold;');
});

// Initialize event listeners
function initializeEventListeners() {
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', function(e) {
        e.preventDefault();
        fetchLeaderboard();
    });
    
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
