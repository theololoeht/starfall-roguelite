import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, performance: { now: () => 0 } });
for (const file of ['js/utils.js', 'js/fx.js', 'js/config.js', 'js/attacks.js', 'js/sprites.js', 'js/weapons.js', 'js/entities.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
}

const result = vm.runInContext(`(() => {
  const player = {
    x: 100, y: 200, aim: 0,
    fire: { damage: 8, interval: 0.46, projectiles: 3, bulletSpeed: 640, bulletR: 4.5, pierce: 1, spread: 0.11 },
    form: { color: '#4fd2ff' }, formId: 'base', treeId: 'cannon',
    skills: { spent: new Set() }, dmgMul: 1, atkSpdMul: 1,
    stillT: 0, shotN: 0, empT: 0, muzzleFlashT: 0,
    formChain: ['base'],
    attacks: [{ formId: 'base', mode: 'gun', fire: null, color: '#4fd2ff' }],
  };
  const game = { player, pBullets: [], burst() {}, empPulse() {} };
  const weapon = { t: 0, def: { color: '#4fd2ff' } };
  player.attacks[0].fire = player.fire;
  gunTick(game, weapon, 1 / 60);
  return {
    bullets: game.pBullets.map(b => ({ x:b.x, y:b.y, speed:Math.hypot(b.vx,b.vy), damage:b.dmg })),
    muzzleFlashT: player.muzzleFlashT,
    baseMuzzles: Sprites.playerMuzzles('base', 3, 1),
    shotgunMuzzles: Sprites.playerMuzzles('shotgun', 5, 5),
    ultimateExhausts: Sprites.playerExhausts('ultimate'),
  };
})()`, context);

assert.equal(result.bullets.length, 3, '三联炮必须生成三条独立弹道');
assert(result.bullets.every(b => b.x >= 132), '子弹必须从机头炮管外生成，不能从机身内部出现');
assert.equal(result.bullets.map(b => Math.round(b.y)).join(','), '193,200,207', '三联炮起点应与三个可见硬点一致');
assert(result.bullets.every(b => Math.abs(b.speed - 640) < 0.001), '视觉硬点调整不得改变弹速');
assert(result.bullets.every(b => b.damage === 8), '视觉硬点调整不得改变伤害');
assert(result.muzzleFlashT > 0, '开火后必须产生短促枪口闪光');
assert.equal(result.shotgunMuzzles.map(m => m.x).join(','), '-11,-5.5,0,5.5,11', '散裂形态硬点应覆盖双叉之间的完整宽度');
assert.equal(result.ultimateExhausts.length, 3, '旗舰三喷口必须对应三条尾焰');

console.log('projectile-art-smoke:', result);
