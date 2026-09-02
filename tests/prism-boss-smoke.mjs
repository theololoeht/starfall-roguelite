import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, URLSearchParams, location:{ search:'?balance=test' }, performance:{ now:() => 0 } });
for (const file of ['js/utils.js', 'js/fx.js', 'js/config.js', 'js/spawns.js', 'js/sprites.js', 'js/entities.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename:file });
}

const result = vm.runInContext(`(() => {
  const boss = new PrismBoss(CANVAS_W / 2, CANVAS_H * 0.24, 1);
  boss.spawning = false;
  const game = {
    player:{ x:CANVAS_W / 2, y:CANVAS_H * 0.78, radius:13, hurt(){} },
    enemies:[boss], eBullets:[], rings:[], flashes:[], particles:[], spawnQueue:[],
    queueSpawn(type, angle, perp, delay, meta) { this.spawnQueue.push({type, angle, perp, delay, ...meta}); return true; },
    shake(){}, addFloat(){}, onEnemyKilled(){},
  };
  for (let i = 0; i < 8 * 60; i++) boss.update(1 / 60, game);
  const ward = {
    phase:boss.phase, label:boss.phaseLabel, rings:boss.ringsFired,
    summons:boss.summonsQueued, bullets:game.eBullets.length,
    zones:boss.getHitZones().map(x => x.kind),
  };
  boss.hp = boss.maxHp * 0.49;
  for (let i = 0; i < 9 * 60; i++) boss.update(1 / 60, game);
  const overload = {
    phase:boss.phase, stage:boss.phaseStage, label:boss.phaseLabel,
    fans:boss.fansFired, axes:boss.axesFired, bullets:game.eBullets.length,
    zones:boss.getHitZones().map(x => x.kind), x:boss.x, y:boss.y,
  };
  return { ward, overload };
})()`, context);

assert.equal(result.ward.phase, 'ward');
assert.equal(result.ward.zones.filter(x => x === 'shield').length, 4);
assert(result.ward.rings >= 2, '前半阶段应重复释放留缺口环弹');
assert(result.ward.summons >= 3, '前半阶段应排入护卫召唤');
assert.equal(result.overload.phase, 'overload');
assert.equal(result.overload.stage, 'active');
assert.deepEqual([...result.overload.zones], ['core'], '过载阶段应解除护盾命中区');
assert(result.overload.fans >= 2, '过载阶段应释放瞄准扇射');
assert(result.overload.axes >= 2, '过载阶段应释放三轴弹幕');
assert(Number.isFinite(result.overload.x) && Number.isFinite(result.overload.y));

console.log('prism-boss-smoke:', result);
