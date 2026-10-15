(() => {
  'use strict';

  const COLS = 10, ROWS = 20, BLOCK = 30;
  const COLORS = {
    I: '#39e7f5', O: '#ffd166', T: '#b794f6',
    S: '#57e389', Z: '#ff6685', J: '#6598ff', L: '#ff9f5a'
  };
  const SHAPES = {
    I: [[1,1,1,1]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1]],
    S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]]
  };

  const boardCanvas = document.getElementById('board');
  const ctx = boardCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nextCtx = nextCanvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const restartBtn = document.getElementById('restart-btn');

  let grid, current, nextType, score, lines, level, running, paused, gameOver;
  let dropCounter = 0, lastTime = 0, animationId = null;
  let bag = [];
  let best = Number(localStorage.getItem('neonTetrisBest') || 0);

  function makeGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }
  function refillBag() {
    bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  function randomType() {
    if (!bag.length) refillBag();
    return bag.pop();
  }
  function newPiece(type = randomType()) {
    const shape = SHAPES[type].map(row => row.slice());
    return { type, shape, x: Math.floor((COLS - shape[0].length) / 2), y: 0 };
  }
  function collides(piece, dx = 0, dy = 0, shape = piece.shape) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const nx = piece.x + x + dx, ny = piece.y + y + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && grid[ny][nx]) return true;
      }
    }
    return false;
  }
  function rotateMatrix(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]).reverse());
  }
  function rotate() {
    if (!running || paused || gameOver) return;
    const rotated = rotateMatrix(current.shape);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(current, kick, 0, rotated)) {
        current.x += kick;
        current.shape = rotated;
        draw();
        return;
      }
    }
  }
  function move(dx, dy) {
    if (!running || paused || gameOver) return false;
    if (!collides(current, dx, dy)) {
      current.x += dx;
      current.y += dy;
      if (dy > 0) score += 1;
      updateStats();
      draw();
      return true;
    }
    if (dy > 0) lockPiece();
    return false;
  }
  function hardDrop() {
    if (!running || paused || gameOver) return;
    let distance = 0;
    while (!collides(current, 0, 1)) { current.y++; distance++; }
    score += distance * 2;
    lockPiece();
    updateStats();
    draw();
  }
  function lockPiece() {
    current.shape.forEach((row, y) => row.forEach((cell, x) => {
      if (cell) {
        const gy = current.y + y, gx = current.x + x;
        if (gy >= 0) grid[gy][gx] = current.type;
      }
    }));
    clearLines();
    spawnPiece();
  }
  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (grid[y].every(Boolean)) {
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared++;
        y++;
      }
    }
    if (cleared) {
      const points = [0, 100, 300, 500, 800];
      score += (points[cleared] || cleared * 250) * level;
      lines += cleared;
      level = Math.floor(lines / 10) + 1;
    }
  }
  function spawnPiece() {
    current = newPiece(nextType);
    nextType = randomType();
    drawNext();
    if (collides(current)) endGame();
  }
  function startGame() {
    cancelAnimationFrame(animationId);
    grid = makeGrid(); bag = [];
    score = 0; lines = 0; level = 1;
    running = true; paused = false; gameOver = false;
    dropCounter = 0; lastTime = 0;
    nextType = randomType();
    current = newPiece();
    nextType = randomType();
    overlay.classList.add('hidden');
    pauseBtn.disabled = false;
    pauseBtn.innerHTML = 'Ⅱ &nbsp; PAUSE';
    document.getElementById('game-status').textContent = 'Playing';
    updateStats(); drawNext(); draw();
    animationId = requestAnimationFrame(update);
  }
  function endGame() {
    running = false; gameOver = true; paused = false;
    pauseBtn.disabled = true;
    document.getElementById('game-status').textContent = 'Game over';
    if (score > best) {
      best = score;
      localStorage.setItem('neonTetrisBest', String(best));
    }
    updateStats();
    overlayTitle.textContent = 'GAME OVER';
    overlayText.textContent = `Final score: ${score.toLocaleString()}. Give it another run!`;
    startBtn.textContent = 'PLAY AGAIN';
    overlay.classList.remove('hidden');
  }
  function togglePause() {
    if (!running || gameOver) return;
    paused = !paused;
    pauseBtn.innerHTML = paused ? '▶ &nbsp; RESUME' : 'Ⅱ &nbsp; PAUSE';
    document.getElementById('game-status').textContent = paused ? 'Paused' : 'Playing';
    if (paused) {
      overlayTitle.textContent = 'PAUSED';
      overlayText.textContent = 'Take a breath. Your blocks are waiting.';
      startBtn.textContent = 'RESUME GAME';
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
      lastTime = 0;
    }
  }
  function update(time = 0) {
    if (!running) return;
    const delta = lastTime ? time - lastTime : 0;
    lastTime = time;
    if (!paused) {
      dropCounter += delta;
      const interval = Math.max(90, 850 - (level - 1) * 65);
      if (dropCounter > interval) {
        move(0, 1);
        dropCounter = 0;
      }
      draw();
    }
    animationId = requestAnimationFrame(update);
  }
  function drawCell(context, x, y, color, size, alpha = 1) {
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.fillStyle = 'rgba(255,255,255,.19)';
    context.fillRect(x * size + 3, y * size + 3, size - 6, 3);
    context.strokeStyle = 'rgba(255,255,255,.16)';
    context.strokeRect(x * size + 1.5, y * size + 1.5, size - 3, size - 3);
    context.globalAlpha = 1;
  }
  function drawGrid() {
    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
    ctx.fillStyle = '#080d18';
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    ctx.strokeStyle = 'rgba(126, 151, 190, .09)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * BLOCK + .5, 0); ctx.lineTo(x * BLOCK + .5, ROWS * BLOCK); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * BLOCK + .5); ctx.lineTo(COLS * BLOCK, y * BLOCK + .5); ctx.stroke();
    }
    if (grid) grid.forEach((row, y) => row.forEach((type, x) => {
      if (type) drawCell(ctx, x, y, COLORS[type], BLOCK);
    }));
  }
  function drawPiece(piece, alpha = 1, offsetY = 0) {
    if (!piece) return;
    piece.shape.forEach((row, y) => row.forEach((cell, x) => {
      if (cell && piece.y + y + offsetY >= 0) drawCell(ctx, piece.x + x, piece.y + y + offsetY, COLORS[piece.type], BLOCK, alpha);
    }));
  }
  function draw() {
    drawGrid();
    if (!grid || !current) return;
    let ghostY = current.y;
    while (!collides({ ...current, y: ghostY }, 0, 1)) ghostY++;
    drawPiece({ ...current, y: ghostY }, .2);
    drawPiece(current);
  }
  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextCtx.fillStyle = '#0a1120';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextType) return;
    const shape = SHAPES[nextType];
    const size = 20;
    const ox = (nextCanvas.width - shape[0].length * size) / 2;
    const oy = (nextCanvas.height - shape.length * size) / 2;
    shape.forEach((row, y) => row.forEach((cell, x) => {
      if (!cell) return;
      nextCtx.fillStyle = COLORS[nextType];
      nextCtx.fillRect(ox + x * size + 1, oy + y * size + 1, size - 2, size - 2);
      nextCtx.fillStyle = 'rgba(255,255,255,.2)';
      nextCtx.fillRect(ox + x * size + 3, oy + y * size + 3, size - 6, 3);
    }));
  }
  function updateStats() {
    document.getElementById('score').textContent = String(score || 0).padStart(6, '0');
    document.getElementById('best').textContent = String(Math.max(best, score || 0)).padStart(6, '0');
    document.getElementById('lines').textContent = String(lines || 0);
    document.getElementById('level').textContent = String(level || 1);
    document.getElementById('to-next').textContent = String(10 - ((lines || 0) % 10));
  }

  startBtn.addEventListener('click', () => {
    if (paused && running) togglePause();
    else startGame();
  });
  pauseBtn.addEventListener('click', togglePause);
  restartBtn.addEventListener('click', startGame);

  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (['arrowleft','arrowright','arrowup','arrowdown',' '].includes(key)) event.preventDefault();
    if (key === 'r') { startGame(); return; }
    if (key === 'p') { togglePause(); return; }
    if (!running || paused || gameOver) return;
    if (key === 'arrowleft' || key === 'a') move(-1, 0);
    else if (key === 'arrowright' || key === 'd') move(1, 0);
    else if (key === 'arrowdown' || key === 's') move(0, 1);
    else if (key === 'arrowup' || key === 'w') rotate();
    else if (key === ' ') hardDrop();
  });
  document.querySelectorAll('.mobile-controls button').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'left') move(-1, 0);
      if (action === 'right') move(1, 0);
      if (action === 'down') move(0, 1);
      if (action === 'rotate') rotate();
      if (action === 'drop') hardDrop();
    });
  });

  document.getElementById('best').textContent = String(best).padStart(6, '0');
  grid = makeGrid();
  score = 0; lines = 0; level = 1;
  drawGrid(); drawNext(); updateStats();
})();
