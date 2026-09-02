// ===== 输入与启动（鼠标 + 触屏统一走 Pointer Events）=====
const canvas = document.getElementById('game');
const input = { keys: {}, mx: CANVAS_W / 2, my: CANVAS_H / 2, mouseActive: false };

window.addEventListener('keydown', e => {
  input.keys[e.code] = true;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    input.mouseActive = false;
    e.preventDefault();
  }
  if (e.code === 'Tab' || e.code === 'KeyT') { e.preventDefault(); game.toggleTree(); }
  if (e.code === 'Escape') { game.state === RUN_STATES.TREE ? game.closeTree() : game.togglePause(); }
  if (e.code === 'KeyP' && game.state !== RUN_STATES.TREE) game.togglePause();
  if (e.code === 'KeyQ' && game.state === RUN_STATES.PAUSED) UI.showMenu();   // 暂停中返回主菜单
});
window.addEventListener('keyup', e => { input.keys[e.code] = false; });

function setPointer(e) {
  const r = canvas.getBoundingClientRect();
  input.mx = (e.clientX - r.left) * canvas.width / r.width;
  input.my = (e.clientY - r.top) * canvas.height / r.height;
  input.mouseActive = true;
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointermove', setPointer);
canvas.addEventListener('pointerdown', e => {
  setPointer(e);
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  if (e.button === 2) { game.trySword(); return; }          // 右键：挥刀清弹幕
  if (game.state === RUN_STATES.TREE) game.treeClick(input.mx, input.my);
});

validateAllAttackDefinitions();
validatePlayableWeaponDefinitions();
validateSpawnDefinitions();
const game = new Game(canvas);
UI.init();
