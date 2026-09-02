import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, performance: { now: () => 0 } });
for (const file of [
  'js/utils.js', 'js/fx.js', 'js/config.js', 'js/attacks.js', 'js/spawns.js',
  'js/sprites.js', 'js/entities.js', 'js/weapons.js', 'js/game.js',
]) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
}

const result = vm.runInContext(`(() => {
  const valid = validatePlayableWeaponDefinitions();
  const playable = [...PLAYABLE_WEAPON_IDS];
  const experimental = [...EXPERIMENTAL_WEAPON_IDS];
  const deadEnds = [];
  let legacyFusionRejected = false;
  const playableUseTreeStats = playable.every(id => {
    const weapon = makeWeapon(id);
    const baseFire = SKILL_TREES[id].forms.base.fire;
    return !WEAPON_DEFS[id].levelStats && weapon.stats.damage === baseFire.damage;
  });

  try { makeWeapon('annihilator'); }
  catch (_) { legacyFusionRejected = true; }

  for (const id of playable) {
    const tree = SKILL_TREES[id];
    const finalId = tree.finalForm || null;
    for (const [formId, form] of Object.entries(tree.forms)) {
      if (formId !== finalId && (form.evolutions || []).length === 0) {
        deadEnds.push(id + ':' + formId);
      }
    }
  }

  const paths = {
    cannonShotgun: validateEvolutionPath(SKILL_TREES.cannon, ['base','shotgun','ultimate']),
    cannonRail: validateEvolutionPath(SKILL_TREES.cannon, ['base','rail','ultimate']),
    swordOrbit: validateEvolutionPath(SKILL_TREES.sword, ['base','orbit','ascendant']),
    swordHunter: validateEvolutionPath(SKILL_TREES.sword, ['base','hunter','ascendant']),
    novaFlame: validateEvolutionPath(SKILL_TREES.nova, ['base','flameblade','plague']),
    novaMist: validateEvolutionPath(SKILL_TREES.nova, ['base','mist','plague']),
  };

  return { valid, playable, experimental, deadEnds, legacyFusionRejected, playableUseTreeStats, paths };
})()`, context);

assert(result.valid, '正式武器定义必须通过启动校验');
assert.equal(result.playable.join(','), 'cannon,nova,sword', '正式开局范围必须明确且稳定');
assert(result.playable.every(id => !result.experimental.includes(id)), '正式与实验武器不得重叠');
assert.equal(result.experimental.sort().join(','), 'laser,ram,trail', '未完成武器应留在实验范围');
assert(result.legacyFusionRejected, '已废止的旧融合武器不得再由运行时创建');
assert(result.playableUseTreeStats, '正式武器的运行数值必须只读取技能树');
assert.equal(result.deadEnds.length, 0, '正式技能树不得存在非终极断头形态');
assert(Object.values(result.paths).every(Boolean), '每条正式分支必须可从 base 抵达最终形态');

console.log('playable-weapons-smoke:', result);
