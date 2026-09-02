import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, performance: { now: () => 0 } });
for (const file of [
  'js/utils.js', 'js/fx.js', 'js/config.js', 'js/run-state.js', 'js/attacks.js', 'js/spawns.js',
  'js/sprites.js', 'js/entities.js', 'js/weapons.js', 'js/game-spawning.js', 'js/game-collision.js',
  'js/game-encounter.js', 'js/game-progression.js', 'js/game-skill-tree.js', 'js/game-effects.js', 'js/game.js', 'js/ui.js',
]) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename:file });
}

const result = vm.runInContext(`(() => {
  const enemy = {
    x:210, y:100, r:14, dead:false, spawning:false, damage:0,
    circleHit(x,y,r){ return dist(this.x,this.y,x,y) <= this.r+r ? {x:this.x,y:this.y,damageMul:1} : null; },
    hurt(v){ this.damage += v; },
  };
  const makePath = chain => {
    const p = new Player(); p.x = 100; p.y = 100; p.aim = 0; p.addWeapon('sword');
    p.treeId = 'sword'; p.formChain = chain; p.formId = chain[chain.length - 1]; p.recomputeFire();
    const game = {
      player:p, enemies:[enemy], eBullets:[], pBullets:[], rings:[],
      nearestEnemy(){ return enemy; }, burst(){},
    };
    swordTick(game, p.mainWeapon, 0.2);
    const panel = swordPanelModel(p);
    return {
      modes:p.attacks.map(a => a.mode), bullets:game.pBullets.length,
      orbitPoints:p.mainWeapon.attackStates['sword:orbit:1']?.points?.length || 0,
      crownActive:!!p.mainWeapon.attackStates['sword:ascendant:2'],
      panelText:[panel.title, ...panel.lines].join(' | '),
    };
  };
  return {
    orbit:makePath(['base','orbit','ascendant']),
    hunter:makePath(['base','hunter','ascendant']),
  };
})()`, context);

assert.equal(result.orbit.modes.join(','), 'sword_slash,orbit_blade,blade_crown', '环刃路线必须保留基础斩并新增两段攻击');
assert.equal(result.hunter.modes.join(','), 'sword_slash,phase_wave,blade_crown', '猎杀路线必须保留基础斩并新增两段攻击');
assert(result.orbit.orbitPoints >= 3, '环刃路线必须生成真实环绕刃判定点');
assert(result.hunter.bullets >= 2, '猎杀与终极攻击必须生成真实相位弹体');
assert(result.orbit.crownActive && result.hunter.crownActive, '两条路线都必须执行最终刃冠 handler');
assert(!result.orbit.panelText.includes('NaN') && !result.hunter.panelText.includes('NaN'), '剑系混合攻击面板不得出现 NaN');

console.log('sword-progression-smoke:', result);
