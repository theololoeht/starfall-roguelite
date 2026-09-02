import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, performance: { now: () => 0 } });
for (const file of ['js/utils.js', 'js/fx.js', 'js/config.js', 'js/entities.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
}

const result = vm.runInContext(`(() => {
  const game = {
    player: {x: CANVAS_W / 2, y: CANVAS_H / 2, radius: 13, hurt() {}},
    eBullets: [], rings: [], particles: [], dragonBreaths: [], shake() {},
  };
  const dragon = new DragonBoss(-90, CANVAS_H * 0.28, 1);
  dragon.spawning = false;
  const phases = new Set();
  let breathFrames = 0;
  for (let i = 0; i < 1500; i++) {
    game.dragonBreaths.length = 0;
    dragon.update(1 / 60, game);
    phases.add(dragon.phase);
    if (game.dragonBreaths.length) breathFrames++;
  }
  const chain = [{x:dragon.x,y:dragon.y}, ...dragon.bodyPoints];
  const gaps = chain.slice(1).map((p,i) => dist(chain[i].x, chain[i].y, p.x, p.y));
  const zones = dragon.getHitZones();
  const headProbe = dragon.circleHit(dragon.x, dragon.y, 1);
  const bodyProbe = dragon.circleHit(zones[5].x, zones[5].y, 1);
  return {
    trailLength: dragon.trail.length,
    bodyCount: dragon.bodyPoints.length,
    minGap: Math.min(...gaps), maxGap: Math.max(...gaps),
    ySpread: Math.max(...chain.map(p=>p.y)) - Math.min(...chain.map(p=>p.y)),
    finite: chain.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.angle ?? 0)),
    phases: [...phases], bodyShots: dragon.bodyShotsFired, breathFrames,
    zoneCount: zones.length, bodyDamageMul: zones[1].damageMul,
    headProbe: headProbe?.kind, bodyProbe: bodyProbe?.kind,
  };
})()`, context);

assert.equal(result.bodyCount, 11, '龙身体节数量应稳定为 11');
assert(result.trailLength > 100, '龙头移动后轨迹必须持续增长');
assert(result.finite, '龙的全部坐标必须是有限数');
// 节点按 27px 弧长采样；突击急转处的相邻节点直线弦长会略短。
assert(result.minGap > 22 && result.maxGap < 30, `节距弦长应保持连续，实际 ${result.minGap}-${result.maxGap}`);
assert(result.ySpread > 20, '运行 12 秒后骨链应形成可见曲线，而不是保持初始直线');
assert.deepEqual(new Set(result.phases), new Set(['orbit', 'assault', 'breath']), '必须完整进入盘旋、突击、吐息三阶段');
assert(result.bodyShots >= 8, '身体节点应在盘旋阶段持续发射子弹');
assert(result.breathFrames > 60, '吐息 active 阶段应持续多帧而非瞬时判定');
assert.equal(result.zoneCount, 12, '龙头与 11 节身体都应有独立碰撞区');
assert.equal(result.bodyDamageMul, 0.35, '身体命中仅造成 35% 伤害');
assert.equal(result.headProbe, 'head', '龙头坐标必须命中完整伤害弱点');
assert.equal(result.bodyProbe, 'body', '身体坐标必须命中减伤碰撞区');

console.log('dragon-motion-smoke:', result);
