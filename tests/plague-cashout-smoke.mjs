import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, performance:{ now:() => 0 } });
for (const file of ['js/utils.js','js/fx.js','js/config.js','js/attacks.js','js/sprites.js','js/entities.js','js/weapons.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename:file });
}

const result = vm.runInContext(`(() => {
  const p = new Player();
  p.addWeapon('nova'); p.treeId = 'nova'; p.formId = 'plague';
  p.formChain = ['base','mist','plague'];
  p.skills.spent = new Set(['n1','n2','n3','n0','nm1','nm2','nm3','nm0','np1','np2','np3','np4','np5','np6']);
  p.recomputeFire();

  const outer = p.attacks.find(a => a.mode === 'mist').fire;
  const inner = p.attacks.find(a => a.mode === 'plague').fire;
  const invalidFields = p.attacks.flatMap(a => Object.entries(a.fire).filter(([,v]) => typeof v === 'number' && !Number.isFinite(v)).map(([field,value]) => ({mode:a.mode,field,value:String(value)})));
  const finite = invalidFields.length === 0;
  const burstOnAllCorrosion = p.attacks.filter(a => Number.isFinite(a.fire.stackDps)).every(a => !!a.fire.corrosionBurst);
  const finalCapShared = p.attacks.filter(a => Number.isFinite(a.fire.stackDps)).every(a => a.fire.corrosionBurst.triggerStacks === inner.maxStacks);

  const enemy = {
    x:180,y:100,dead:false,dot:{stacks:11,dps:5,time:4},damage:0,
    hurt(v){ this.damage += v; },
  };
  const game = { time:30, sporeClouds:[], rings:[], burst(){}, enemies:[enemy] };
  applyCorrosionSnapshot(enemy, {stacks:1,layerDps:5,maxStacks:12,duration:4,burst:inner.corrosionBurst}, game, '#8dff5d');

  const regen = dotRegenScaling(p);
  const outerRadius = outer.radius * (outer.rangeMul || 1) * (outer.mistRadiusMul || 1) * regen.rangeMul;
  const innerRadius = inner.radius * (inner.rangeMul || 1) * regen.rangeMul;
  return {
    finite, invalidFields, burstOnAllCorrosion, finalCapShared, outerRadius, innerRadius,
    outerDps:outer.dps * (outer.mistDmgMul || 1) * p.dmgMul,
    innerDps:inner.dps * (inner.mistDmgMul || 1) * p.dmgMul,
    burstDamage:enemy.damage, stacksAfter:enemy.dot.stacks, clouds:game.sporeClouds.length,
    cloudDps:game.sporeClouds[0]?.dps, dpsEstimate:p.dpsEstimate,
  };
})()`, context);

assert(result.finite, `跨形态升级后所有数值字段必须保持有限，不能产生 NaN: ${JSON.stringify(result.invalidFields)}`);
assert(result.burstOnAllCorrosion, '最终形态必须让保留的全部腐蚀攻击都可触发结算');
assert(result.finalCapShared, '保留攻击必须统一按最终形态层数上限触发结算');
assert(result.outerRadius > result.innerRadius, '外圈低毒半径必须大于内圈高毒');
assert(result.outerDps >= 12, '外圈直接毒伤不得低于旧版 12 DPS 基线');
assert(result.innerDps > result.outerDps, '内圈直接毒伤必须高于外圈');
assert.equal(result.burstDamage, 240, '满层时应一次结算全部剩余 DoT：5×12层×4秒');
assert.equal(result.stacksAfter, 0, '结算后腐蚀层必须清空');
assert.equal(result.clouds, 1, '满层引爆必须留下额外孢子云');
assert(result.cloudDps >= 12 && Number.isFinite(result.dpsEstimate), '引爆云与理论 DPS 必须有效');

console.log('plague-cashout-smoke:', result);
