// ==================== تنظیمات اصلی ====================
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;
const canvas = document.getElementById('tetris-board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.blockSize = rect.width / COLS;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const linesElement = document.getElementById('lines');
const challengeText = document.getElementById('challenge-text');
const finalScoreSpan = document.getElementById('final-score');
const highScoreSpan = document.getElementById('high-score');
const modal = document.getElementById('game-over-modal');

// ==================== متغیرهای بازی ====================
let board = [];
let currentPiece = null;
let nextPiece = null;
let score = 0;
let lines = 0;
let level = 1;
let gameOver = false;
let paused = false;
let dropInterval = 1000;
let lastDropTime = 0;
let animationId = null;
let highScore = parseInt(localStorage.getItem('tetrisHighScore')) || 0;

// ==================== تعریف قطعات ====================
const SHAPES = {
    I: [[1,1,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]],
    O: [[1,1],[1,1]],
    S: [[0,1,1],[1,1,0]],
    T: [[0,1,0],[1,1,1]],
    Z: [[1,1,0],[0,1,1]]
};
const COLORS = {
    I: '#00f0f0',
    J: '#0000f0',
    L: '#f0a000',
    O: '#f0f000',
    S: '#00f000',
    T: '#a000f0',
    Z: '#f00000'
};

// ==================== کلاس قطعه با وال‌کیک ====================
class Piece {
    constructor(shape, color) {
        this.shape = shape;
        this.color = color;
        this.x = Math.floor((COLS - shape[0].length) / 2);
        this.y = 0;
    }

    rotate() {
        const newShape = this.shape[0].map((_, idx) => 
            this.shape.map(row => row[idx]).reverse()
        );
        // وال‌کیک: امتحان ۵ حالت جابجایی
        const kicks = [0, -1, 1, -2, 2];
        for (let kick of kicks) {
            if (!this.collision(this.x + kick, this.y, newShape)) {
                this.x += kick;
                this.shape = newShape;
                return;
            }
        }
    }

    collision(offsetX, offsetY, shape = this.shape) {
        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    const newX = this.x + x + offsetX;
                    const newY = this.y + y + offsetY;
                    if (newX < 0 || newX >= COLS || newY >= ROWS || newY < 0) return true;
                    if (newY >= 0 && board[newY] && board[newY][newX]) return true;
                }
            }
        }
        return false;
    }

    moveDown() {
        if (!this.collision(0, 1)) { this.y++; return true; }
        return false;
    }
    moveHorizontal(dx) {
        if (!this.collision(dx, 0)) this.x += dx;
    }
    hardDrop() {
        while (!this.collision(0, 1)) this.y++;
        this.lockPiece();
    }
    lockPiece() {
        for (let y = 0; y < this.shape.length; y++) {
            for (let x = 0; x < this.shape[y].length; x++) {
                if (this.shape[y][x]) {
                    const boardY = this.y + y;
                    const boardX = this.x + x;
                    if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
                        board[boardY][boardX] = this.color;
                    }
                }
            }
        }
        clearLines();
        spawnPiece();
        saveGame();
        checkChallenge();
    }
}

// ==================== صدا (Web Audio) ====================
let audioCtx = null;

function playSound(type) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        let freq = 400;
        let duration = 0.1;
        if (type === 'move') { freq = 300; duration = 0.05; }
        else if (type === 'rotate') { freq = 500; duration = 0.07; }
        else if (type === 'drop') { freq = 200; duration = 0.15; gain.gain.value = 0.3; }
        else if (type === 'clear') { freq = 800; duration = 0.2; gain.gain.value = 0.4; }
        else if (type === 'gameover') { freq = 150; duration = 0.5; gain.gain.value = 0.3; }
        osc.frequency.value = freq;
        gain.gain.value = 0.2;
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) { /* بی‌صدا */ }
}

// ==================== چالش‌ها ====================
const challenges = [
    { text: 'پاک کردن ۲ خط در ۳۰ ثانیه', condition: () => lines >= 2 && Date.now() - startTime < 30000, done: false },
    { text: 'امتیاز ۵۰۰ بگیر', condition: () => score >= 500, done: false },
    { text: '۳ قطعه T بچین', condition: () => { /* شمارش قطعات T */ return false; }, done: false }
];
let startTime = Date.now();
let currentChallengeIndex = 0;

function updateChallenge() {
    const ch = challenges[currentChallengeIndex];
    if (ch && !ch.done) {
        challengeText.textContent = ch.text;
        if (ch.condition()) {
            ch.done = true;
            score += 100;
            playSound('clear');
            updateUI();
            setTimeout(() => {
                currentChallengeIndex = (currentChallengeIndex + 1) % challenges.length;
                challenges[currentChallengeIndex].done = false;
                updateChallenge();
            }, 2000);
        }
    } else {
        challengeText.textContent = '✅ همه چالش‌ها انجام شد!';
    }
}
function checkChallenge() { updateChallenge(); }

// ==================== توابع بازی ====================
function createRandomPiece() {
    const types = Object.keys(SHAPES);
    const type = types[Math.floor(Math.random() * types.length)];
    return new Piece(SHAPES[type].map(row => [...row]), COLORS[type]);
}

function spawnPiece() {
    currentPiece = nextPiece || createRandomPiece();
    nextPiece = createRandomPiece();
    currentPiece.x = Math.floor((COLS - currentPiece.shape[0].length) / 2);
    currentPiece.y = 0;
    if (currentPiece.collision(0, 0)) {
        gameOver = true;
        playSound('gameover');
        cancelAnimationFrame(animationId);
        showGameOver();
    }
    drawNextPiece();
}

function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(cell => cell !== 0)) {
            board.splice(y, 1);
            board.unshift(Array(COLS).fill(0));
            cleared++;
            y++;
            playSound('clear');
        }
    }
    if (cleared > 0) {
        const points = [0, 100, 300, 500, 800];
        score += points[cleared] * level;
        lines += cleared;
        level = Math.floor(lines / 10) + 1;
        dropInterval = Math.max(100, 1000 - (level - 1) * 80);
        updateUI();
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('tetrisHighScore', highScore);
        }
    }
}

function updateUI() {
    scoreElement.textContent = score;
    levelElement.textContent = level;
    linesElement.textContent = lines;
}

function showGameOver() {
    finalScoreSpan.textContent = score;
    highScoreSpan.textContent = highScore;
    modal.classList.add('show');
}

// ==================== رسم ====================
function drawBoard() {
    const bs = canvas.blockSize || BLOCK_SIZE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (board[y][x]) {
                ctx.fillStyle = board[y][x];
                ctx.fillRect(x * bs, y * bs, bs - 1, bs - 1);
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fillRect(x * bs, y * bs, bs - 1, 3);
            }
        }
    }
    if (currentPiece && !gameOver) {
        drawPiece(ctx, currentPiece, currentPiece.x, currentPiece.y, bs);
    }
    // خطوط شبکه
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * bs, 0);
        ctx.lineTo(i * bs, ROWS * bs);
        ctx.stroke();
    }
    for (let i = 0; i <= ROWS; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * bs);
        ctx.lineTo(COLS * bs, i * bs);
        ctx.stroke();
    }
}

function drawPiece(context, piece, offX, offY, bs) {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x]) {
                const dx = (offX + x) * bs;
                const dy = (offY + y) * bs;
                context.fillStyle = piece.color;
                context.fillRect(dx, dy, bs - 1, bs - 1);
                context.fillStyle = 'rgba(255,255,255,0.2)';
                context.fillRect(dx, dy, bs - 1, 3);
            }
        }
    }
}

function drawNextPiece() {
    const bs = 24;
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (nextPiece) {
        const shape = nextPiece.shape;
        const offX = (nextCanvas.width - shape[0].length * bs) / 2;
        const offY = (nextCanvas.height - shape.length * bs) / 2;
        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    nextCtx.fillStyle = nextPiece.color;
                    nextCtx.fillRect(offX + x * bs, offY + y * bs, bs - 1, bs - 1);
                    nextCtx.fillStyle = 'rgba(255,255,255,0.2)';
                    nextCtx.fillRect(offX + x * bs, offY + y * bs, bs - 1, 3);
                }
            }
        }
    }
}

// ==================== حلقه بازی ====================
function gameLoop(timestamp) {
    if (gameOver || paused) {
        animationId = requestAnimationFrame(gameLoop);
        return;
    }
    if (timestamp - lastDropTime > dropInterval) {
        if (!currentPiece.moveDown()) {
            currentPiece.lockPiece();
        } else {
            playSound('move');
        }
        lastDropTime = timestamp;
    }
    drawBoard();
    animationId = requestAnimationFrame(gameLoop);
}

// ==================== کنترل‌ها ====================
document.addEventListener('keydown', (e) => {
    if (gameOver) return;
    switch (e.code) {
        case 'ArrowLeft': if (!paused) { currentPiece.moveHorizontal(-1); playSound('move'); } e.preventDefault(); break;
        case 'ArrowRight': if (!paused) { currentPiece.moveHorizontal(1); playSound('move'); } e.preventDefault(); break;
        case 'ArrowDown': if (!paused && currentPiece.moveDown()) { playSound('move'); lastDropTime = performance.now(); } e.preventDefault(); break;
        case 'ArrowUp': if (!paused) { currentPiece.rotate(); playSound('rotate'); } e.preventDefault(); break;
        case 'Space': if (!paused) { currentPiece.hardDrop(); playSound('drop'); lastDropTime = performance.now(); } e.preventDefault(); break;
        case 'KeyP': paused = !paused; e.preventDefault(); break;
    }
    drawBoard();
});

function setupTouchButton(id, action) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const eventName = window.PointerEvent ? 'pointerdown' : 'touchstart';
    btn.addEventListener(eventName, (e) => {
        e.preventDefault();
        action();
        drawBoard();
    }, { passive: false });
    if (!window.PointerEvent) {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            action();
            drawBoard();
        });
    }
}

setupTouchButton('btn-left', () => { if (!paused && !gameOver) { currentPiece.moveHorizontal(-1); playSound('move'); } });
setupTouchButton('btn-right', () => { if (!paused && !gameOver) { currentPiece.moveHorizontal(1); playSound('move'); } });
setupTouchButton('btn-rotate', () => { if (!paused && !gameOver) { currentPiece.rotate(); playSound('rotate'); } });
setupTouchButton('btn-down', () => { if (!paused && !gameOver && currentPiece.moveDown()) { playSound('move'); lastDropTime = performance.now(); } });
setupTouchButton('btn-drop', () => { if (!paused && !gameOver) { currentPiece.hardDrop(); playSound('drop'); lastDropTime = performance.now(); } });

document.querySelectorAll('.touch-btn').forEach(btn => {
    btn.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
});

// ==================== ذخیره و بازیابی ====================
function saveGame() {
    try {
        const data = { board, score, lines, level, dropInterval };
        localStorage.setItem('tetrisSave', JSON.stringify(data));
    } catch(e) {}
}

function loadGame() {
    try {
        const raw = localStorage.getItem('tetrisSave');
        if (!raw) return false;
        const data = JSON.parse(raw);
        board = data.board;
        score = data.score;
        lines = data.lines;
        level = data.level;
        dropInterval = data.dropInterval;
        return true;
    } catch(e) { return false; }
}

// ==================== شروع مجدد و مقداردهی ====================
function resetGame() {
    board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 1000;
    gameOver = false;
    paused = false;
    currentPiece = null;
    nextPiece = null;
    startTime = Date.now();
    currentChallengeIndex = 0;
    challenges.forEach(c => c.done = false);
    updateUI();
    modal.classList.remove('show');
    spawnPiece();
    lastDropTime = performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(gameLoop);
    updateChallenge();
    saveGame();
}

document.getElementById('restart-btn').addEventListener('click', resetGame);
document.getElementById('modal-restart-btn').addEventListener('click', resetGame);

// ==================== شروع بازی ====================
if (!loadGame()) {
    resetGame();
} else {
    // ادامه بازی قبلی
    spawnPiece();
    lastDropTime = performance.now();
    updateUI();
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(gameLoop);
    updateChallenge();
}