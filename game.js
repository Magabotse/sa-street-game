const ALL_PLAYERS = ['red', 'green', 'blue', 'yellow'];

let activePlayers = ['red', 'green', 'blue', 'yellow'];
let currentPlayerIndex = 0;
let gameState = 'waiting_for_roll';
let lastRollValue = 0;
let bonusTurnsRemaining = 0;
let finishedPlayers = [];
let soundMuted = false;
let isObserving = false;

// Mode & AI settings
let selectedHumanCount = 4;
let fillWithCpu = false;
let aiDifficulty = 1;
let playerTypes = { red: 'human', green: 'human', blue: 'human', yellow: 'human' };

/* ===================================================
   ONLINE LINK / WEBRTC MULTIPLAYER LOGIC
   =================================================== */
let peer = null;
let roomConnections = []; // Host: array of conns
let hostConn = null; // Client: conn to host
let isHost = false;
let myAssignedColor = null;
let currentRoomCode = null;

function showLinkMenu() {
    hideAllScreens();
    document.getElementById('link-menu').style.display = 'flex';
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function createRoom() {
    currentRoomCode = generateRoomCode();
    isHost = true;
    myAssignedColor = 'red';
    roomConnections = [];

    peer = new Peer(`sagame-${currentRoomCode}`);

    peer.on('open', () => {
        setupLobbyUI();
    });

    peer.on('connection', (conn) => {
        if (roomConnections.length >= 3) {
            conn.send({ type: 'error', message: 'Room full!' });
            setTimeout(() => conn.close(), 500);
            return;
        }

        roomConnections.push(conn);
        let assignedColor = ALL_PLAYERS[roomConnections.length];

        conn.on('open', () => {
            conn.send({ type: 'init_client', color: assignedColor, roomCode: currentRoomCode });
            broadcastLobbyState();
        });

        conn.on('data', (data) => handleNetworkData(data, conn));

        conn.on('close', () => {
            roomConnections = roomConnections.filter(c => c !== conn);
            broadcastLobbyState();
        });
    });

    peer.on('error', () => {
        showModal("Connection Error", "Could not create room. Try again.");
    });
}

function joinRoomFromInput() {
    let code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (!code) return;
    joinRoom(code);
}

function joinRoom(code) {
    isHost = false;
    currentRoomCode = code;
    peer = new Peer();

    peer.on('open', () => {
        hostConn = peer.connect(`sagame-${code}`);

        hostConn.on('open', () => {});
        hostConn.on('data', (data) => handleNetworkData(data, hostConn));
        hostConn.on('close', () => {
            showModal("Disconnected", "Host closed the room.", "OK", () => showMainMenu());
        });
    });

    peer.on('error', () => {
        showModal("Join Error", "Room not found or unavailable.");
    });
}

// Broadcasts data to all connections (Host -> Clients or Client -> Host)
function broadcastNetworkData(data) {
    if (isHost) {
        roomConnections.forEach(c => c.send(data));
    } else if (hostConn) {
        hostConn.send(data);
    }
}

function setupLobbyUI() {
    hideAllScreens();
    document.getElementById('lobby-code-display').innerText = currentRoomCode;
    document.getElementById('start-link-game-btn').style.display = isHost ? 'block' : 'none';
    document.getElementById('lobby-menu').style.display = 'flex';
}

function handleNetworkData(data, senderConn = null) {
    if (data.type === 'init_client') {
        myAssignedColor = data.color;
        currentRoomCode = data.roomCode;
        setupLobbyUI();
    } else if (data.type === 'lobby_update') {
        updateLobbyPlayerList(data.players);
        if (isHost) {
            document.getElementById('start-link-game-btn').style.display = 'block';
        }
    } else if (data.type === 'start_game') {
        activePlayers = data.activePlayers;
        playerTypes = data.playerTypes;
        hideAllScreens();
        document.getElementById('mode-badge').innerText = `Online Link (${myAssignedColor ? myAssignedColor.toUpperCase() : 'SPECTATOR'})`;
        document.getElementById('game-screen').style.display = 'block';
        resetGame();
    } else if (data.type === 'roll_action') {
        // If host receives action from client, relay to other clients
        if (isHost) {
            roomConnections.forEach(c => {
                if (c !== senderConn) c.send(data);
            });
        }
        rollPits(data.player, data.forcedRoll, data.forcedPits, true);
    } else if (data.type === 'yard_release_action') {
        if (isHost) {
            roomConnections.forEach(c => {
                if (c !== senderConn) c.send(data);
            });
        }
        let targetTokens = tokens[data.player].filter(t => data.targetTokenIds.includes(t.id));
        executeYardRelease(data.player, targetTokens, true);
    } else if (data.type === 'board_move_action') {
        if (isHost) {
            roomConnections.forEach(c => {
                if (c !== senderConn) c.send(data);
            });
        }
        let token = tokens[data.player].find(t => t.id === data.tokenId);
        executeBoardMove(data.player, token, data.steps, true);
    } else if (data.type === 'sync_turn_state') {
        // Keeps extra turns and turn index locked in sync across network
        currentPlayerIndex = data.currentPlayerIndex;
        bonusTurnsRemaining = data.bonusTurnsRemaining;
        gameState = data.gameState;
        updateUI();
    }
}

function broadcastLobbyState() {
    let playerList = ['red (HOST)'];
    roomConnections.forEach((c, i) => {
        playerList.push(`${ALL_PLAYERS[i + 1]}`);
    });
    updateLobbyPlayerList(playerList);
    broadcastNetworkData({ type: 'lobby_update', players: playerList });
}

function updateLobbyPlayerList(players) {
    let list = document.getElementById('lobby-player-list');
    list.innerHTML = players.map(p => `<li style="padding:4px 0; color:var(--yard-border);">🎮 Player ${p.toUpperCase()}</li>`).join('');
}

function copyRoomLink() {
    let url = `${window.location.origin}${window.location.pathname}?room=${currentRoomCode}`;
    navigator.clipboard.writeText(url);
    showModal("Link Copied", "Share this invite link or code with your friends!");
}

function leaveLinkLobby() {
    if (peer) peer.destroy();
    showMainMenu();
}

function hostStartLinkGame() {
    if (!isHost) return;

    activePlayers = ['red'];
    playerTypes = { red: 'human' };

    roomConnections.forEach((c, i) => {
        let color = ALL_PLAYERS[i + 1];
        activePlayers.push(color);
        playerTypes[color] = 'human';
    });

    let payload = {
        type: 'start_game',
        activePlayers: activePlayers,
        playerTypes: playerTypes
    };

    broadcastNetworkData(payload);

    hideAllScreens();
    document.getElementById('mode-badge').innerText = `Online Link (RED - HOST)`;
    document.getElementById('game-screen').style.display = 'block';
    resetGame();
}

window.addEventListener('DOMContentLoaded', () => {
    let params = new URLSearchParams(window.location.search);
    let roomParam = params.get('room');
    if (roomParam) {
        joinRoom(roomParam.toUpperCase());
    }
});

/* ===================================================
   GAME ENGINE LOGIC & SOUNDS
   =================================================== */
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function toggleSound() {
    soundMuted = !soundMuted;
    document.getElementById('sound-btn').innerText = soundMuted ? '🔇' : '🔊';
}

function playSound(type) {
    if (soundMuted) return;
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        if (type === 'roll') {
            for (let i = 0; i < 4; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(150 + Math.random() * 200, now + i * 0.04);
                gain.gain.setValueAtTime(0.08, now + i * 0.04);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.04 + 0.03);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + i * 0.04);
                osc.stop(now + i * 0.04 + 0.03);
            }
        } else if (type === 'step') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'release') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(700, now + 0.15);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'capture') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'victory') {
            const notes = [440, 554.37, 659.25, 880];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + i * 0.12);
                gain.gain.setValueAtTime(0.18, now + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.25);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + i * 0.12);
                osc.stop(now + i * 0.12 + 0.25);
            });
        }
    } catch (e) {}
}

function hideAllScreens() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('link-menu').style.display = 'none';
    document.getElementById('lobby-menu').style.display = 'none';
    document.getElementById('player-count-menu').style.display = 'none';
    document.getElementById('cpu-prompt-menu').style.display = 'none';
    document.getElementById('difficulty-menu').style.display = 'none';
    document.getElementById('game-screen').style.display = 'none';
}

function showMainMenu() {
    isObserving = false;
    hideAllScreens();
    document.getElementById('main-menu').style.display = 'flex';
}

function showPlayerCountMenu() {
    hideAllScreens();
    document.getElementById('player-count-menu').style.display = 'flex';
}

function startVsComputerSolo() {
    selectedHumanCount = 1;
    fillWithCpu = true;
    showDifficultyMenuForFill();
}

function selectPlayerCount(count) {
    selectedHumanCount = count;
    if (count === 4) {
        fillWithCpu = false;
        configureAndStartGame();
    } else {
        hideAllScreens();
        document.getElementById('cpu-prompt-text').innerText = 
            `You selected ${count} human player${count > 1 ? 's' : ''}. Fill remaining ${4 - count} slot${(4 - count) > 1 ? 's' : ''} with CPU bots?`;
        document.getElementById('cpu-prompt-menu').style.display = 'flex';
    }
}

function showDifficultyMenuForFill() {
    hideAllScreens();
    document.getElementById('difficulty-menu').style.display = 'flex';
}

function handleDifficultyBack() {
    if (selectedHumanCount === 1) showMainMenu();
    else { hideAllScreens(); document.getElementById('cpu-prompt-menu').style.display = 'flex'; }
}

function startLocalGameWithoutCpu() {
    fillWithCpu = false;
    configureAndStartGame();
}

function confirmDifficultyAndStart(difficulty) {
    aiDifficulty = difficulty;
    fillWithCpu = true;
    configureAndStartGame();
}

function configureAndStartGame() {
    activePlayers = [];
    playerTypes = {};
    isObserving = false;

    for (let i = 0; i < 4; i++) {
        let color = ALL_PLAYERS[i];
        if (i < selectedHumanCount) {
            activePlayers.push(color);
            playerTypes[color] = 'human';
        } else if (fillWithCpu) {
            activePlayers.push(color);
            playerTypes[color] = 'bot';
        }
    }

    let badgeText = `${selectedHumanCount} Player${selectedHumanCount > 1 ? 's' : ''}`;
    if (fillWithCpu && selectedHumanCount < 4) {
        const diffNames = ["Lvl 1 CPU", "Lvl 2 CPU", "Lvl 3 CPU 😈"];
        badgeText += ` + ${diffNames[aiDifficulty - 1]}`;
    }
    document.getElementById('mode-badge').innerText = badgeText;

    hideAllScreens();
    document.getElementById('game-screen').style.display = 'block';
    resetGame();
}

function confirmReturnToMenu() {
    showModal("Return to Menu?", "Your current game progress will be reset.", "Yes, Quit", () => {
        if (peer) peer.destroy();
        showMainMenu();
    });
}

const GOAL_CELL = 12;
const safeCells = [2, 10, 14, 22];
const startCells = { red: 10, green: 2, blue: 14, yellow: 22 };

const playerPaths = {
    red: {
        outer: [10, 5, 0, 1, 2, 3, 4, 9, 14, 19, 24, 23, 22, 21, 20, 15],
        inner: [16, 17, 18, 13, 8, 7, 6, 11]
    },
    green: {
        outer: [2, 3, 4, 9, 14, 19, 24, 23, 22, 21, 20, 15, 10, 5, 0, 1],
        inner: [6, 11, 16, 17, 18, 13, 8, 7]
    },
    blue: {
        outer: [14, 19, 24, 23, 22, 21, 20, 15, 10, 5, 0, 1, 2, 3, 4, 9],
        inner: [8, 7, 6, 11, 16, 17, 18, 13]
    },
    yellow: {
        outer: [22, 21, 20, 15, 10, 5, 0, 1, 2, 3, 4, 9, 14, 19, 24, 23],
        inner: [18, 13, 8, 7, 6, 11, 16, 17]
    }
};

let tokens = {
    red: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}],
    green: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}],
    blue: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}],
    yellow: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}]
};

const layoutControls = {
    green: { yard: { r: 1, c: 4 }, btn: { r: 1, c: 5 } }, 
    red: { yard: { r: 4, c: 1 }, btn: { r: 3, c: 1 } }, 
    blue: { yard: { r: 4, c: 7 }, btn: { r: 5, c: 7 } }, 
    yellow: { yard: { r: 7, c: 4 }, btn: { r: 7, c: 3 } }  
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function changeTheme(themeName) {
    document.body.setAttribute('data-theme', themeName);
}

function initBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    for (let p in layoutControls) {
        let cfg = layoutControls[p];
        const btn = document.createElement('button');
        btn.id = `btn-${p}`;
        btn.className = 'throw-btn';
        btn.innerText = 'T';
        btn.setAttribute('onclick', `rollPits('${p}')`);
        btn.style.gridRowStart = cfg.btn.r;
        btn.style.gridColumnStart = cfg.btn.c;
        board.appendChild(btn);

        const yard = document.createElement('div');
        yard.id = `yard-${p}`;
        yard.className = 'yard-container';
        yard.style.gridRowStart = cfg.yard.r;
        yard.style.gridColumnStart = cfg.yard.c;
        board.appendChild(yard);
    }

    let cellIndex = 0;
    for (let r = 2; r <= 6; r++) {
        for (let c = 2; c <= 6; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = cellIndex;
            if (cellIndex === GOAL_CELL) cell.classList.add('goal-zone');
            else if (safeCells.includes(cellIndex)) cell.classList.add('safe-zone');
            cell.style.gridRowStart = r;
            cell.style.gridColumnStart = c;
            board.appendChild(cell);
            cellIndex++;
        }
    }
    updateUI();
}

function rollPits(playerColor, forcedRoll = null, forcedPits = null, isRemote = false) {
    if (gameState !== 'waiting_for_roll' || activePlayers[currentPlayerIndex] !== playerColor) return;

    if (myAssignedColor && playerColor !== myAssignedColor && !isRemote && playerTypes[playerColor] === 'human') return;

    playSound('roll');

    let pits = [];
    let roundCount = 0;

    if (forcedPits !== null) {
        pits = forcedPits;
        roundCount = pits.reduce((acc, val) => acc + val, 0);
    } else {
        for (let i = 0; i < 4; i++) {
            let outcome = Math.floor(Math.random() * 2);
            pits.push(outcome);
            if (outcome === 1) roundCount++;
        }
    }

    let rollValue = 0, extraTurnsEarned = 0, yardReleaseMax = 0;
    if (roundCount === 1) rollValue = 1;
    else if (roundCount === 2) rollValue = 2;
    else if (roundCount === 3) { rollValue = 3; yardReleaseMax = 1; }
    else if (roundCount === 4) { rollValue = 4; yardReleaseMax = 2; extraTurnsEarned = 1; }
    else if (roundCount === 0) { rollValue = 8; yardReleaseMax = 4; extraTurnsEarned = 2; }

    if (forcedRoll !== null) rollValue = forcedRoll;

    if (!isRemote && (peer && (isHost || hostConn))) {
        broadcastNetworkData({ 
            type: 'roll_action', 
            player: playerColor, 
            forcedRoll: rollValue,
            forcedPits: pits
        });
    }

    for (let i = 0; i < 4; i++) {
        document.getElementById(`pit-${i}`).className = 'pit ' + (pits[i] === 0 ? 'flat' : 'round');
    }

    lastRollValue = rollValue;
    bonusTurnsRemaining += extraTurnsEarned;

    document.getElementById('roll-status').innerText = `${playerColor.toUpperCase()} rolled: ${rollValue}`;

    evaluateMoves(playerColor, rollValue, yardReleaseMax);
}

function evaluateMoves(player, roll, yardReleaseMax) {
    let activePlayerTokens = tokens[player];
    let yardTokens = activePlayerTokens.filter(t => t.zone === 'yard');
    let activeTokens = activePlayerTokens.filter(t => t.zone !== 'yard' && t.zone !== 'goal' && t.zone !== 'finished');
    let path = playerPaths[player];
    let possibleMoves = [];

    if (yardTokens.length > 0 && yardReleaseMax > 0) {
        let countToRelease = Math.min(yardTokens.length, yardReleaseMax);
        possibleMoves.push({
            type: 'yard_release',
            count: countToRelease,
            targetTokens: yardTokens.slice(0, countToRelease)
        });
    }

    activeTokens.forEach(token => {
        let pathSteps = [];
        let tempPos = token.pos;
        let tempZone = token.zone;

        for (let step = 1; step <= roll; step++) {
            if (tempZone === 'outer') {
                let nextIndex = tempPos + 1;
                if (nextIndex < path.outer.length) tempPos = nextIndex;
                else { tempPos = 0; tempZone = 'inner'; }
            } else if (tempZone === 'inner') {
                let nextIndex = tempPos + 1;
                if (nextIndex < path.inner.length) tempPos = nextIndex;
                else {
                    if (step === roll) { tempPos = GOAL_CELL; tempZone = 'goal'; }
                    else tempPos = 0;
                }
            }
            pathSteps.push({ pos: tempPos, zone: tempZone });
        }

        if (pathSteps.length === roll) {
            possibleMoves.push({ type: 'board_move', token: token, steps: pathSteps });
        }
    });

    if (possibleMoves.length === 0) {
        document.getElementById('roll-status').innerText += " (No valid moves)";
        setTimeout(completeTurn, 1000);
        return;
    }

    if (possibleMoves.length === 1) {
        let move = possibleMoves[0];
        if (move.type === 'yard_release') executeYardRelease(player, move.targetTokens);
        else executeBoardMove(player, move.token, move.steps);
    } else {
        gameState = 'waiting_for_move';
        highlightSelectableOptions(player, possibleMoves);
    }
}

function executeYardRelease(player, targetTokens, isRemote = false) {
    if (!isRemote && (peer && (isHost || hostConn))) {
        let ids = targetTokens.map(t => t.id);
        broadcastNetworkData({ type: 'yard_release_action', player: player, targetTokenIds: ids });
    }

    playSound('release');
    targetTokens.forEach(token => { token.zone = 'outer'; token.pos = 0; });
    if (checkCaptures(player, startCells[player])) bonusTurnsRemaining += 1;
    clearHighlights();
    updateUI();
    completeTurn();
}

async function executeBoardMove(player, token, steps, isRemote = false) {
    if (!isRemote && (peer && (isHost || hostConn))) {
        broadcastNetworkData({ type: 'board_move_action', player: player, tokenId: token.id, steps: steps });
    }

    clearHighlights();
    gameState = 'animating';

    for (let i = 0; i < steps.length; i++) {
        token.pos = steps[i].pos;
        token.zone = steps[i].zone;
        playSound('step');
        updateUI();
        await sleep(200);
    }

    let finalStep = steps[steps.length - 1];
    let actualBoardCell = -1;
    let path = playerPaths[player];

    if (finalStep.zone === 'outer') actualBoardCell = path.outer[finalStep.pos];
    else if (finalStep.zone === 'inner') actualBoardCell = path.inner[finalStep.pos];

    if (finalStep.zone === 'goal') playSound('victory');
    else if (checkCaptures(player, actualBoardCell)) bonusTurnsRemaining += 1;
    
    completeTurn();
}

function checkCaptures(activePlayer, boardCellIndex) {
    if (safeCells.includes(boardCellIndex)) return false;
    let capturedAny = false;

    activePlayers.forEach(opp => {
        if (opp === activePlayer) return;
        tokens[opp].forEach(token => {
            let oppActualCell = -1;
            let oppPath = playerPaths[opp];
            if (token.zone === 'outer') oppActualCell = oppPath.outer[token.pos];
            if (token.zone === 'inner') oppActualCell = oppPath.inner[token.pos];

            if (oppActualCell === boardCellIndex) {
                token.zone = 'yard'; token.pos = -1;
                capturedAny = true;
            }
        });
    });

    if (capturedAny) playSound('capture');
    return capturedAny;
}

function completeTurn() {
    let activePlayer = activePlayers[currentPlayerIndex];
    let completedAll = tokens[activePlayer].every(t => t.zone === 'goal' || t.zone === 'finished');
    
    if (completedAll && !finishedPlayers.includes(activePlayer)) {
        finishedPlayers.push(activePlayer);
        tokens[activePlayer].forEach(t => t.zone = 'finished');

        let isHumanWinner = (playerTypes[activePlayer] === 'human' && finishedPlayers.length === 1);
        let hasRemainingBots = activePlayers.some(p => !finishedPlayers.includes(p) && playerTypes[p] === 'bot');

        if (isHumanWinner && hasRemainingBots && !isObserving && !peer) {
            playSound('victory');
            showModal(
                "🥇 You Won 1st Place!",
                "Great job! Would you like to exit to the main menu or observe the CPUs finish the match?",
                "🏠 Main Menu",
                () => { showMainMenu(); },
                "👁️ Spectate CPUs",
                () => {
                    isObserving = true;
                    document.getElementById('mode-badge').innerText = "👁️ Spectating CPUs";
                    continueTurnProgression();
                }
            );
            return;
        }
    }

    let winningThreshold = activePlayers.length - 1;
    if (finishedPlayers.length >= winningThreshold && activePlayers.length > 1) {
        playSound('victory');
        let loser = activePlayers.find(p => !finishedPlayers.includes(p));
        const suffixes = ['1st', '2nd', '3rd', '4th'];
        let rankSummary = finishedPlayers.map((p, i) => `${suffixes[i]} Place: ${p.toUpperCase()}`).join('\n');
        rankSummary += `\n💀 ${suffixes[finishedPlayers.length]} Place (Loser): ${loser.toUpperCase()}`;

        showModal("🏆 Game Complete!", rankSummary, "Main Menu", () => { showMainMenu(); });
        return;
    }

    continueTurnProgression();
}

function continueTurnProgression() {
    if (bonusTurnsRemaining > 0) {
        bonusTurnsRemaining--;
        gameState = 'waiting_for_roll';
    } else {
        do {
            currentPlayerIndex = (currentPlayerIndex + 1) % activePlayers.length;
        } while (finishedPlayers.includes(activePlayers[currentPlayerIndex]));
        
        gameState = 'waiting_for_roll';
    }

    // Host sends authority turn packet to ensure all peers lock onto exact same turn/bonus status
    if (isHost && peer) {
        broadcastNetworkData({
            type: 'sync_turn_state',
            currentPlayerIndex: currentPlayerIndex,
            bonusTurnsRemaining: bonusTurnsRemaining,
            gameState: gameState
        });
    }

    updateUI();

    let nextPlayer = activePlayers[currentPlayerIndex];
    if (playerTypes[nextPlayer] === 'bot' && gameState === 'waiting_for_roll' && (!peer || isHost)) {
        setTimeout(() => rollPits(nextPlayer), 600);
    }
}

function highlightSelectableOptions(player, possibleMoves) {
    if (myAssignedColor && player !== myAssignedColor && playerTypes[player] === 'human') return;

    possibleMoves.forEach(move => {
        if (move.type === 'yard_release') {
            const yardElement = document.getElementById(`yard-${player}`);
            yardElement.classList.add('highlight-selectable');
            yardElement.onclick = () => {
                yardElement.onclick = null;
                executeYardRelease(player, move.targetTokens);
            };
        } else if (move.type === 'board_move') {
            let actualBoardCell = -1;
            let path = playerPaths[player];
            if (move.token.zone === 'outer') actualBoardCell = path.outer[move.token.pos];
            if (move.token.zone === 'inner') actualBoardCell = path.inner[move.token.pos];

            const cellElement = document.querySelector(`.cell[data-index='${actualBoardCell}']`);
            if (cellElement) {
                const tokenElement = cellElement.querySelector(`.token-${player}[data-token-id='${move.token.id}']`);
                if (tokenElement) {
                    tokenElement.classList.add('selectable');
                    tokenElement.onclick = (e) => {
                        e.stopPropagation();
                        executeBoardMove(player, move.token, move.steps);
                    };
                }
            }
        }
    });
}

function clearHighlights() {
    ALL_PLAYERS.forEach(p => {
        const yardElement = document.getElementById(`yard-${p}`);
        if (yardElement) { yardElement.classList.remove('highlight-selectable'); yardElement.onclick = null; }
    });
    document.querySelectorAll('.token').forEach(token => {
        token.classList.remove('selectable'); token.onclick = null;
    });
}

function updateUI() {
    const rankLabels = ['1st', '2nd', '3rd', '4th'];

    ALL_PLAYERS.forEach((player) => {
        const btn = document.getElementById(`btn-${player}`);
        const yardElement = document.getElementById(`yard-${player}`);

        let isActiveInGame = activePlayers.includes(player);

        if (!isActiveInGame) {
            if (btn) btn.style.visibility = 'hidden';
            if (yardElement) yardElement.style.opacity = '0.15';
            return;
        } else {
            if (btn) btn.style.visibility = 'visible';
            if (yardElement) yardElement.style.opacity = '1';
        }

        let isCurrentTurn = (activePlayers[currentPlayerIndex] === player);
        let isMyTurnInLink = (!myAssignedColor || myAssignedColor === player);

        if (finishedPlayers.includes(player)) {
            btn.classList.remove('active-turn-btn');
            btn.disabled = true;
        } else if (isCurrentTurn && gameState === 'waiting_for_roll' && isMyTurnInLink) {
            btn.classList.add('active-turn-btn');
            btn.disabled = false;
        } else {
            btn.classList.remove('active-turn-btn');
            btn.disabled = true;
        }

        if (yardElement) {
            yardElement.innerHTML = '';
            
            if (finishedPlayers.includes(player)) {
                let rankIndex = finishedPlayers.indexOf(player);
                const rankBadge = document.createElement('div');
                rankBadge.className = 'yard-rank-badge';
                rankBadge.innerText = rankLabels[rankIndex] || '';
                yardElement.appendChild(rankBadge);
            } else {
                tokens[player].forEach(token => {
                    if (token.zone === 'yard') {
                        const tokenDiv = document.createElement('div');
                        tokenDiv.className = `token token-${player}`;
                        tokenDiv.dataset.tokenId = token.id;
                        yardElement.appendChild(tokenDiv);
                    }
                });
            }
        }
    });

    document.querySelectorAll('.cell').forEach(cell => {
        cell.querySelectorAll('.token').forEach(t => t.remove());
    });

    activePlayers.forEach(player => {
        tokens[player].forEach(token => {
            let targetCellIndex = -1;
            let path = playerPaths[player];
            if (token.zone === 'outer') targetCellIndex = path.outer[token.pos];
            else if (token.zone === 'inner') targetCellIndex = path.inner[token.pos];
            else if (token.zone === 'goal') targetCellIndex = GOAL_CELL;

            if (targetCellIndex !== -1) {
                const cell = document.querySelector(`.cell[data-index='${targetCellIndex}']`);
                if (cell) {
                    const tokenDiv = document.createElement('div');
                    tokenDiv.className = `token token-${player}`;
                    tokenDiv.dataset.tokenId = token.id;
                    cell.appendChild(tokenDiv);
                }
            }
        });
    });
}

function showModal(title, message, btn1Text = "OK", btn1Callback = null, btn2Text = null, btn2Callback = null) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    
    const primaryBtn = document.getElementById('modal-btn-primary');
    primaryBtn.innerText = btn1Text;
    primaryBtn.onclick = () => {
        closeModal();
        if (btn1Callback) btn1Callback();
    };

    const secondaryBtn = document.getElementById('modal-btn-secondary');
    if (btn2Text) {
        secondaryBtn.style.display = 'block';
        secondaryBtn.innerText = btn2Text;
        secondaryBtn.onclick = () => {
            closeModal();
            if (btn2Callback) btn2Callback();
        };
    } else {
        secondaryBtn.style.display = 'none';
    }

    document.getElementById('game-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('game-modal').style.display = 'none';
}

function resetGame() {
    currentPlayerIndex = 0;
    gameState = 'waiting_for_roll';
    lastRollValue = 0;
    bonusTurnsRemaining = 0;
    finishedPlayers = [];
    isObserving = false;
    tokens = {
        red: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}],
        green: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}],
        blue: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}],
        yellow: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}]
    };
    initBoard();
}

window.onload = () => {
    showMainMenu();
};

