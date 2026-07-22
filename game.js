const PLAYERS = ['red', 'green', 'blue', 'yellow'];

let currentPlayerIndex = 0;
let gameState = 'waiting_for_roll';
let lastRollValue = 0;
let bonusTurnsRemaining = 0;
let finishedPlayers = [];
let soundMuted = false;

/* Web Audio Synthesizer Engine */
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
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
            // Pit rattle sound
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
            // Lightweight tap sound
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
            // Yard release sweep sound
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
            // Crunchy capture/attack sound
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
        } else if (type === 'home') {
            // Reaching home sound
            [523.25, 659.25].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.1);
                gain.gain.setValueAtTime(0.15, now + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + i * 0.1);
                osc.stop(now + i * 0.1 + 0.2);
            });
        } else if (type === 'victory') {
            // Winning fanfare sequence
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
    } catch (e) {
        console.log("Audio not allowed yet or not supported.");
    }
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

/* Theme Switcher Function */
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
            
            if (cellIndex === GOAL_CELL) {
                cell.classList.add('goal-zone');
            } else if (safeCells.includes(cellIndex)) {
                cell.classList.add('safe-zone');
            }
            
            cell.style.gridRowStart = r;
            cell.style.gridColumnStart = c;
            board.appendChild(cell);
            cellIndex++;
        }
    }
    updateUI();
}

function rollPits(playerColor, forcedRoll = null) {
    if (gameState !== 'waiting_for_roll' || PLAYERS[currentPlayerIndex] !== playerColor) return;

    playSound('roll');

    let pits = [];
    let roundCount = 0;

    if (forcedRoll !== null) {
        if (forcedRoll === 8) { pits = [0,0,0,0]; roundCount = 0; }
        else if (forcedRoll === 4) { pits = [1,1,1,1]; roundCount = 4; }
    } else {
        for (let i = 0; i < 4; i++) {
            let outcome = Math.floor(Math.random() * 2);
            pits.push(outcome);
            if (outcome === 1) roundCount++;
        }
    }

    for (let i = 0; i < 4; i++) {
        document.getElementById(`pit-${i}`).className = 'pit ' + (pits[i] === 0 ? 'flat' : 'round');
    }

    let rollValue = 0, extraTurnsEarned = 0, yardReleaseMax = 0;
    if (roundCount === 1) rollValue = 1;
    else if (roundCount === 2) rollValue = 2;
    else if (roundCount === 3) { rollValue = 3; yardReleaseMax = 1; }
    else if (roundCount === 4) { rollValue = 4; yardReleaseMax = 2; extraTurnsEarned = 1; }
    else if (roundCount === 0) { rollValue = 8; yardReleaseMax = 4; extraTurnsEarned = 2; }

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
            } else if (tempZone === 'goal') {
                break;
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

    if (possibleMoves.length > 1) {
        let firstMove = possibleMoves[0];
        let allIdentical = possibleMoves.every(m => {
            if (m.type !== firstMove.type) return false;
            if (m.type === 'yard_release') return true;
            return m.token.zone === firstMove.token.zone && m.token.pos === firstMove.token.pos;
        });
        if (allIdentical) possibleMoves = [firstMove];
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

function executeYardRelease(player, targetTokens) {
    playSound('release');
    targetTokens.forEach(token => { token.zone = 'outer'; token.pos = 0; });
    if (checkCaptures(player, startCells[player])) bonusTurnsRemaining += 1;
    clearHighlights();
    updateUI();
    completeTurn();
}

async function executeBoardMove(player, token, steps) {
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

    if (finalStep.zone === 'goal') {
        playSound('home');
    } else if (checkCaptures(player, actualBoardCell)) {
        bonusTurnsRemaining += 1;
    }
    completeTurn();
}

function checkCaptures(activePlayer, boardCellIndex) {
    if (safeCells.includes(boardCellIndex)) return false;
    let capturedAny = false;

    PLAYERS.forEach(opp => {
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
    let activePlayer = PLAYERS[currentPlayerIndex];
    let completedAll = tokens[activePlayer].every(t => t.zone === 'goal' || t.zone === 'finished');
    
    if (completedAll && !finishedPlayers.includes(activePlayer)) {
        finishedPlayers.push(activePlayer);
        tokens[activePlayer].forEach(t => t.zone = 'finished');
    }

    if (finishedPlayers.length === 3) {
        playSound('victory');
        let loser = PLAYERS.find(p => !finishedPlayers.includes(p));
        const suffixes = ['1st', '2nd', '3rd'];
        let rankSummary = finishedPlayers.map((p, i) => `${suffixes[i]} Place: ${p.toUpperCase()}`).join('\n');
        
        showModal(
            "🏆 Game Over!", 
            `${rankSummary}\n\n💀 ${loser.toUpperCase()} is the LOSER!`, 
            "Play Again", 
            () => { resetGame(); }
        );
        return;
    }

    if (bonusTurnsRemaining > 0) {
        bonusTurnsRemaining--;
        gameState = 'waiting_for_roll';
    } else {
        do {
            currentPlayerIndex = (currentPlayerIndex + 1) % PLAYERS.length;
        } while (finishedPlayers.includes(PLAYERS[currentPlayerIndex]));
        
        gameState = 'waiting_for_roll';
    }
    updateUI();
}

function highlightSelectableOptions(player, possibleMoves) {
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
    PLAYERS.forEach(p => {
        const yardElement = document.getElementById(`yard-${p}`);
        if (yardElement) { yardElement.classList.remove('highlight-selectable'); yardElement.onclick = null; }
    });
    document.querySelectorAll('.token').forEach(token => {
        token.classList.remove('selectable'); token.onclick = null;
    });
}

function updateUI() {
    const rankLabels = ['1st', '2nd', '3rd', ''];

    PLAYERS.forEach((player, idx) => {
        const btn = document.getElementById(`btn-${player}`);
        if (!btn) return;

        if (finishedPlayers.includes(player)) {
            btn.classList.remove('active-turn-btn');
            btn.disabled = true;
        } else if (idx === currentPlayerIndex && gameState === 'waiting_for_roll') {
            btn.classList.add('active-turn-btn');
            btn.disabled = false;
        } else {
            btn.classList.remove('active-turn-btn');
            btn.disabled = true;
        }

        const yardElement = document.getElementById(`yard-${player}`);
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

    PLAYERS.forEach(player => {
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

function showModal(title, message, buttonText, onButtonClickCallback) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    const btn = document.getElementById('modal-btn');
    btn.innerText = buttonText;
    btn.onclick = () => {
        closeModal();
        if (onButtonClickCallback) onButtonClickCallback();
    };
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
    tokens = {
        red: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}],
        green: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}],
        blue: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}],
        yellow: [{id:0, pos:-1, zone:'yard'}, {id:1, pos:-1, zone:'yard'}, {id:2, pos:-1, zone:'yard'}, {id:3, pos:-1, zone:'yard'}]
    };
    initBoard();
}

/* DEVELOPER SECRET CHEAT CODES */
window.addEventListener('keydown', (e) => {
    let activePlayer = PLAYERS[currentPlayerIndex];

    if (e.key === '8') {
        if (gameState === 'waiting_for_roll') rollPits(activePlayer, 8);
    }
    else if (e.key === '4') {
        if (gameState === 'waiting_for_roll') rollPits(activePlayer, 4);
    }
    else if (e.key.toLowerCase() === 'w') {
        tokens[activePlayer][0] = { id: 0, pos: GOAL_CELL, zone: 'goal' };
        tokens[activePlayer][1] = { id: 1, pos: GOAL_CELL, zone: 'goal' };
        tokens[activePlayer][2] = { id: 2, pos: GOAL_CELL, zone: 'goal' };
        tokens[activePlayer][3] = { id: 3, pos: playerPaths[activePlayer].inner.length - 1, zone: 'inner' };
        
        updateUI();
        document.getElementById('roll-status').innerText = `${activePlayer.toUpperCase()} is 1 step away from victory!`;
    }
});

window.onload = initBoard;

