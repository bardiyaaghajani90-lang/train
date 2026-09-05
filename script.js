const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');

const scoreSpan = document.getElementById('score');
const levelSpan = document.getElementById('level');
const linesSpan = document.getElementById('lines');

// تنظیم ابعاد بوم اصلی
function resizeBoard() {
    const rect = boardCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    boardCanvas.width = rect.width * dpr;
    boardCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    boardCanvas._blockSize = rect.width / COLS;
}
window.addEventListener('resize', resizeBoard);
resizeBoard();

// ===== تعریف قطعات =====
const SHAPES = {
    I: { shape: [[1,1,1,1]], color: '#00f0f0' },
    O: { shape: [[1,1],[1,1]], color: '#f0f000' },
    T: { shape: [[0,1,0],[1,1,1]], color: '#a000f0' },
    S: { shape: [[0,1,1],[1,1,0]], color: '#00f000' },
    Z: { shape: [[1,1,0],[0,1,1]], color: '#f00000' },
    L: { shape: [[0,0,1],[1,1,1]], color: '#f0a000' },
    J: { shape: [[1,0,0],[1,1,1]], color: '#0000f0' }
};
const PIECE_NAMES = Object.keys(SHAPES);

// ===== وضعیت بازی =====
let board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
let current = null;       // قطعه فعلی { shape, color, x, y }
let next = null;
let score = 0;
let lines = 0;
let level = 1;
let gameOver = false;
let dropInterval = 1000;
let lastDrop = 0;
let animId = null;
let paused = false;

// ===== کلاس قطعه =====
class Piece {
    constructor(name) {
        const data = SHAPES[name];
        this.shape = data.shape.map(row => [...row]);
        this.color = data.color;
        this.name = name;
        this.x = Math.floor((COLS - this.shape[0].length) / 2);
        this.y = 0;
    }

    // چرخش با وال‌کیک ساده
    rotate() {
        const oldShape = this.shape;
        const rotated = oldShape[0].map((_, idx) => oldShape.map(row => row[idx]).reverse());
        const kicks = [0, -1, 1, -2, 2];
        for (let kick of kicks) {
            if (!this._collides(this.x + kick, this.y, rotated)) {
                this.x += kick;
                this.shape = rotated;
                return;
            }
        }
    }

    _collides(offX, offY, shape = this.shape) {
        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    const newX = offX + x;
                    const newY = offY + y;
                    if (newX < 0 || newX >= COLS || newY >= ROWS || newY < 0) return true;
                    if (newY >= 0 && board[newY][newX]) return true;
                }
            }
        }
        return false;
    }

    moveDown() {
        if (!this._collides(this.x, this.y + 1)) {
            this.y++;
            return true;
        }
        return false;
    }

    moveLeft() {
        if (!this._collides(this.x - 1, this.y)) this.x--;
    }

    moveRight() {
        if (!this._collides(this.x + 1, this.y)) this.x++;
    }

    hardDrop() {
        while (!this._collides(this.x, this.y + 1)) this.y++;
        this.lock();
    }

    lock() {
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
    }
}

// ===== توابع اصلی =====
function randomPiece() {
    const name = PIECE_NAMES[Math.floor(Math.random() * PIECE_NAMES.length)];
    return new Piece(name);
}

function spawnPiece() {
    current = next || randomPiece();
    next = randomPiece();
    current.x = Math.floor((COLS - current.shape[0].length) / 2);
    current.y = 0;
    if (current._collides(current.x, current.y)) {
        gameOver = true;
        cancelAnimationFrame(animId);
        alert('بازی تمام شد! امتیاز: ' + score);
    }
    drawNext();
}

function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(cell => cell !== 0)) {
            board.splice(y, 1);
            board.unshift(Array(COLS).fill(0));
            cleared++;
            y++;
        }
    }
    if (cleared > 0) {
        const points = [0, 100, 300, 500, 800];
        score += points[cleared] * level;
        lines += cleared;
        level = Math.floor(lines / 10) + 1;
        dropInterval = Math.max(100, 1000 - (level - 1) * 80);
        updateUI();
    }
}

function updateUI() {
    scoreSpan.textContent = score;
    levelSpan.textContent = level;
    linesSpan.textContent = lines;
}

// ===== رسم =====
function draw() {
    const bs = boardCanvas._blockSize || BLOCK_SIZE;
    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

    // تخته
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

    // قطعه فعلی
    if (current && !gameOver) {
        for (let y = 0; y < current.shape.length; y++) {
            for (let x = 0; x < current.shape[y].length; x++) {
                if (current.shape[y][x]) {
                    const dx = (current.x + x) * bs;
                    const dy = (current.y + y) * bs;
                    ctx.fillStyle = current.color;
                    ctx.fillRect(dx, dy, bs - 1, bs - 1);
                    ctx.fillStyle = 'rgba(255,255,255,0.2)';
                    ctx.fillRect(dx, dy, bs - 1, 3);
                }
            }
        }
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

function drawNext() {
    const size = 24;
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!next) return;
    const shape = next.shape;
    const offX = (nextCanvas.width - shape[0].length * size) / 2;
    const offY = (nextCanvas.height - shape.length * size) / 2;
    for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
            if (shape[y][x]) {
                nextCtx.fillStyle = next.color;
                nextCtx.fillRect(offX + x * size, offY + y * size, size - 1, size - 1);
                nextCtx.fillStyle = 'rgba(255,255,255,0.2)';
                nextCtx.fillRect(offX + x * size, offY + y * size, size - 1, 3);
            }
        }
    }
}

// ===== حلقه بازی =====
function loop(time) {
    if (gameOver || paused) {
        animId = requestAnimationFrame(loop);
        return;
    }
    if (time - lastDrop > dropInterval) {
        if (!current.moveDown()) {
            current.lock();
        }
        lastDrop = time;
    }
    draw();
    animId = requestAnimationFrame(loop);
}

// ===== کنترل‌ها =====
document.addEventListener('keydown', (e) => {
    if (gameOver || !current) return;
    switch (e.code) {
        case 'ArrowLeft':  current.moveLeft(); e.preventDefault(); break;
        case 'ArrowRight': current.moveRight(); e.preventDefault(); break;
        case 'ArrowDown':  current.moveDown(); lastDrop = performance.now(); e.preventDefault(); break;
        case 'ArrowUp':    current.rotate(); e.preventDefault(); break;
        case 'Space':      current.hardDrop(); lastDrop = performance.now(); e.preventDefault(); break;
        case 'KeyP':       paused = !paused; e.preventDefault(); break;
    }
    draw();
});

// دکمه‌های لمسی
function setupButton(id, action) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!gameOver && current) action();
        draw();
    });
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!gameOver && current) action();
        draw();
    }, { passive: false });
}

setupButton('moveLeft', () => current.moveLeft());
setupButton('moveRight', () => current.moveRight());
setupButton('rotate', () => current.rotate());
setupButton('hardDrop', () => { current.hardDrop(); lastDrop = performance.now(); });

// شروع مجدد
document.getElementById('restart').addEventListener('click', resetGame);

function resetGame() {
    board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
    score = 0; lines = 0; level = 1;
    dropInterval = 1000;
    gameOver = false;
    paused = false;
    current = null; next = null;
    updateUI();
    spawnPiece();
    lastDrop = performance.now();
    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
}

// ===== شروع =====
resetGame();
