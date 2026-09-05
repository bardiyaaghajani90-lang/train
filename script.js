// ==================== تنظیمات اصلی ====================
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30; // پیکسل
const canvas = document.getElementById('tetris-board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');

// عناصر نمایش امتیاز و سطح
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const linesElement = document.getElementById('lines');

// ==================== متغیرهای بازی ====================
let board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
let currentPiece = null;
let nextPiece = null;
let score = 0;
let lines = 0;
let level = 1;
let gameOver = false;
let paused = false;
let dropInterval = 1000; // میلی‌ثانیه
let lastDropTime = 0;
let animationId = null;

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

// ==================== کلاس قطعه ====================
class Piece {
    constructor(shape, color) {
        this.shape = shape;
        this.color = color;
        this.x = Math.floor((COLS - shape[0].length) / 2);
        this.y = 0;
    }

    // چرخش ۹۰ درجه در جهت عقربه‌های ساعت
    rotate() {
        const newShape = this.shape[0].map((_, idx) => 
            this.shape.map(row => row[idx]).reverse()
        );
        if (!this.collision(this.x, this.y, newShape)) {
            this.shape = newShape;
        }
    }

    // بررسی برخورد با دیوارها یا قطعات موجود
    collision(offsetX, offsetY, shape = this.shape) {
        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    const newX = this.x + x + offsetX;
                    const newY = this.y + y + offsetY;
                    if (newX < 0 || newX >= COLS || newY >= ROWS || newY < 0) {
                        return true;
                    }
                    if (newY >= 0 && board[newY][newX]) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // حرکت به پایین
    moveDown() {
        if (!this.collision(0, 1)) {
            this.y++;
            return true;
        }
        return false;
    }

    // حرکت افقی
    moveHorizontal(dx) {
        if (!this.collision(dx, 0)) {
            this.x += dx;
        }
    }

    // فرود سریع
    hardDrop() {
        while (!this.collision(0, 1)) {
            this.y++;
        }
        this.lockPiece();
    }

    // قفل کردن قطعه روی تخته
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
    }
}

// ==================== توابع بازی ====================
function createRandomPiece() {
    const shapes = Object.keys(SHAPES);
    const type = shapes[Math.floor(Math.random() * shapes.length)];
    return new Piece(SHAPES[type].map(row => [...row]), COLORS[type]);
}

function spawnPiece() {
    currentPiece = nextPiece || createRandomPiece();
    nextPiece = createRandomPiece();
    currentPiece.x = Math.floor((COLS - currentPiece.shape[0].length) / 2);
    currentPiece.y = 0;

    if (currentPiece.collision(0, 0)) {
        gameOver = true;
        cancelAnimationFrame(animationId);
        alert('بازی تمام شد! امتیاز شما: ' + score);
    }
    drawNextPiece();
}

function clearLines() {
    let linesCleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(cell => cell !== 0)) {
            board.splice(y, 1);
            board.unshift(Array(COLS).fill(0));
            linesCleared++;
            y++; // بررسی دوباره همان ردیف
        }
    }

    if (linesCleared > 0) {
        // امتیازدهی
        const points = [0, 100, 300, 500, 800];
        score += points[linesCleared] * level;
        lines += linesCleared;
        level = Math.floor(lines / 10) + 1;
        dropInterval = Math.max(100, 1000 - (level - 1) * 80);

        // به‌روزرسانی رابط کاربری
        updateUI();
    }
}

function updateUI() {
    scoreElement.textContent = score;
    levelElement.textContent = level;
    linesElement.textContent = lines;
}

// ==================== رسم روی بوم ====================
function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // رسم خانه‌های تخته
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (board[y][x]) {
                ctx.fillStyle = board[y][x];
                ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
                // کمی براقیت
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE - 1, 3);
            }
        }
    }

    // رسم قطعه فعلی
    if (currentPiece && !gameOver) {
        drawPiece(ctx, currentPiece, currentPiece.x, currentPiece.y);
    }

    // رسم خطوط شبکه
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * BLOCK_SIZE, 0);
        ctx.lineTo(i * BLOCK_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i <= ROWS; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * BLOCK_SIZE);
        ctx.lineTo(canvas.width, i * BLOCK_SIZE);
        ctx.stroke();
    }
}

function drawPiece(context, piece, offsetX, offsetY) {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x]) {
                const drawX = (offsetX + x) * BLOCK_SIZE;
                const drawY = (offsetY + y) * BLOCK_SIZE;
                context.fillStyle = piece.color;
                context.fillRect(drawX, drawY, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
                context.fillStyle = 'rgba(255,255,255,0.2)';
                context.fillRect(drawX, drawY, BLOCK_SIZE - 1, 3);
            }
        }
    }
}

function drawNextPiece() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (nextPiece) {
        const shape = nextPiece.shape;
        const blockSize = 24; // اندازه کوچکتر برای نمایش
        const offsetX = (nextCanvas.width - shape[0].length * blockSize) / 2;
        const offsetY = (nextCanvas.height - shape.length * blockSize) / 2;

        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    nextCtx.fillStyle = nextPiece.color;
                    nextCtx.fillRect(offsetX + x * blockSize, offsetY + y * blockSize, blockSize - 1, blockSize - 1);
                    nextCtx.fillStyle = 'rgba(255,255,255,0.2)';
                    nextCtx.fillRect(offsetX + x * blockSize, offsetY + y * blockSize, blockSize - 1, 3);
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
        case 'ArrowLeft':
            if (!paused) currentPiece.moveHorizontal(-1);
            e.preventDefault();
            break;
        case 'ArrowRight':
            if (!paused) currentPiece.moveHorizontal(1);
            e.preventDefault();
            break;
        case 'ArrowDown':
            if (!paused && currentPiece.moveDown()) {
                lastDropTime = performance.now();
            }
            e.preventDefault();
            break;
        case 'ArrowUp':
            if (!paused) currentPiece.rotate();
            e.preventDefault();
            break;
        case 'Space':
            if (!paused) currentPiece.hardDrop();
            lastDropTime = performance.now();
            e.preventDefault();
            break;
        case 'KeyP':
            paused = !paused;
            e.preventDefault();
            break;
    }
    drawBoard();
});

// دکمه شروع مجدد
document.getElementById('restart-btn').addEventListener('click', () => {
    resetGame();
});

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
    updateUI();
    spawnPiece();
    lastDropTime = performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(gameLoop);
}

// ==================== شروع بازی ====================
resetGame();
