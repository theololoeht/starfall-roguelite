import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, performance: { now: () => 0 } });
for (const file of ['js/utils.js', 'js/fx.js', 'js/config.js', 'js/attacks.js', 'js/spawns.js', 'js/sprites.js', 'js/entities.js', 'js/weapons.js', 'js/game.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
}

const result = vm.runInContext(`(() => {
  const valid = validateAllAttackDefinitions();
  const kinds = ['gun','laser','ram','nova','pulse','spore','flameblade','mist','plague','sword','sword_fusion','trail'];
  const registered = kinds.every(k => !!ATTACK_HANDLERS[k]);

  let invalidSporeRejected = false;
  try {
    const bad = {...SKILL_TREES.nova.forms.base.fire, capacity:null};
    validateAttackSpec('spore', bad, 'bad-spore');
  } catch (_) { invalidSporeRejected = true; }

  const laser = new Player();
  laser.addWeapon('laser');
  refreshPlayerAttackMetrics(laser);

  const nova = new Player();
  nova.addWeapon('nova'); nova.treeId = 'nova'; nova.formId = 'plague';
  nova.formChain = ['base','flameblade','plague']; nova.recomputeFire();
  const novaModes = nova.attacks.map(a => a.mode);

  const queued = [];
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    player:{x:CANVAS_W/2,y:CANVAS_H/2,dpsEstimate:100}, time:999, waveBudgetHp:5000,
    waveSpentHp:0, spawnQueue:[], enemies:[], hpScale(){return 1;},
    queueSpawn(type,angle,perp,delay){ queued.push({type,angle,perp,delay}); },
  });
  const saved = MASS_SPAWNS.slice();
  MASS_SPAWNS.splice(0, MASS_SPAWNS.length, saved.find(x => x.id === 'mixedWedge'));
  g.runMassSpawn();
  MASS_SPAWNS.splice(0, MASS_SPAWNS.length, ...saved);

  return {
    valid, registered, invalidSporeRejected,
    laserDps:laser.dpsEstimate,
    novaModes, novaDps:nova.dpsEstimate,
    mixedQueued:queued.length,
    queuedTypesValid:queued.every(x => !!ENEMY_DEFS[x.type]),
    budgetBeforeMaterialize:g.waveSpentHp,
  };
})()`, context);

assert(result.valid && result.registered, '全部攻击定义必须通过注册表校验');
assert(result.invalidSporeRejected, '孢子缺少容量上限时必须启动失败');
assert(Number.isFinite(result.laserDps) && result.laserDps > 0, '非技能树武器也必须拥有有限 DPS 估算');
assert.equal(result.novaModes.join(','), 'spore,flameblade,plague', '保留型进化应形成三段独立攻击');
assert(Number.isFinite(result.novaDps) && result.novaDps > result.laserDps, '持续伤害和终极形态必须进入 DPS 估算');
assert(result.mixedQueued > 0 && result.queuedTypesValid, '混编生成必须展开为有效的具体敌机类型');
assert.equal(result.budgetBeforeMaterialize, 0, '排队预警阶段不得提前消耗血量预算');

console.log('attack-framework-smoke:', result);
