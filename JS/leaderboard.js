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
    } catch (e) { }
    return defaults;
}

const settings = getSavedSettings();
const mainMenuMusic = new Audio('../Sounds/main_menu.mp3');
mainMenuMusic.loop = true;
mainMenuMusic.volume = settings.muteAll ? 0 : 0.22 * (settings.musicVolume / 100);

function playMainMenuMusic() {
    mainMenuMusic.play().catch(() => { });
}

function setupMainMenuMusicUnlock() {
    const unlockMusic = () => {
        playMainMenuMusic();
    };

    document.addEventListener('pointerdown', unlockMusic, { once: true });
    document.addEventListener('keydown', unlockMusic, { once: true });
    playMainMenuMusic();
}

function mergeAndSortLeaderboards(server, local) {
    const combined = [...(server || []), ...(local || [])];
    const unique = [];
    const seen = new Set();

    combined.forEach(entry => {
        if (!entry) return;
        const key = `${entry.name || 'Anonymous'}_${entry.mode || 'Arena'}_${entry.score || 0}_${entry.date || '01/01'}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(entry);
        }
    });

    unique.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    return unique.slice(0, 10);
}

function fetchLeaderboard() {
    const statusMsg = document.getElementById('status-message');
    if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.textContent = 'Loading scores...';
    }

    // Load local storage scores first as fallback/merge source
    let localScores = [];
    try {
        const localRaw = localStorage.getItem('crownfall_leaderboard');
        if (localRaw) {
            localScores = JSON.parse(localRaw);
        }
    } catch (e) {
        console.error('Error reading local leaderboard:', e);
    }
    if (!Array.isArray(localScores)) localScores = [];

    let socket = null;
    let connectionTimeout = null;

    const useLocalFallback = (message) => {
        if (connectionTimeout) clearTimeout(connectionTimeout);
        renderLeaderboard(localScores.slice(0, 10));
        if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.textContent = message;
        }
    };

    try {
        const wsUrl = 'wss://preston-rental-respect-contemporary.trycloudflare.com';
        socket = new WebSocket(wsUrl);

        // 1.5 seconds timeout to fallback to local scores if server is not responding
        connectionTimeout = setTimeout(() => {
            if (socket.readyState !== WebSocket.OPEN) {
                try { socket.close(); } catch (err) { }
                useLocalFallback('Offline — showing local scores');
            }
        }, 1500);

        socket.addEventListener('open', () => {
            if (connectionTimeout) clearTimeout(connectionTimeout);
            socket.send(JSON.stringify({ type: 'get_leaderboard' }));
        });

        socket.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'leaderboard_data') {
                    const merged = mergeAndSortLeaderboards(message.data, localScores);
                    renderLeaderboard(merged);
                    if (statusMsg) statusMsg.style.display = 'none';
                    socket.close();
                }
            } catch (e) {
                console.error(e);
                useLocalFallback('Failed to load server scores');
            }
        });

        socket.addEventListener('error', () => {
            useLocalFallback('Offline — showing local scores');
        });
    } catch (e) {
        useLocalFallback('Offline — showing local scores');
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
document.addEventListener('DOMContentLoaded', function () {
    setupMainMenuMusicUnlock();
    initializeEventListeners();
    fetchLeaderboard();

    console.log('%c Crownfall Leaderboard ', 'background: #1a1410; color: #daa520; font-size: 16px; font-weight: bold;');
});

// Initialize event listeners
function initializeEventListeners() {
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', function (e) {
        e.preventDefault();
        fetchLeaderboard();
    });

    // Back button
    document.getElementById('back-btn').addEventListener('click', function () {
        window.location.href = 'mainmenu.html';
    });

    // ESC key to go back
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            window.location.href = 'mainmenu.html';
        }
    });
}
