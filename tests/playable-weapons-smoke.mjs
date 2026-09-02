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

  for (const id of playable) {
    const tree = SKILL_TREES[id];
    const finalId = tree.finalForm || null;
    for (const [formId, form] of Object.entries(tree.forms)) {
      if (formId !== finalId && (form.evolutions || []).length === 0) {
        deadEnds.push(id + ':' + formId);
      }
    }
  }

  return { valid, playable, experimental, deadEnds };
})()`, context);

assert(result.valid, '正式武器定义必须通过启动校验');
assert.equal(result.playable.join(','), 'cannon,nova,sword', '正式开局范围必须明确且稳定');
assert(result.playable.every(id => !result.experimental.includes(id)), '正式与实验武器不得重叠');
assert.equal(result.experimental.sort().join(','), 'laser,ram,trail', '未完成武器应留在实验范围');

console.log('playable-weapons-smoke:', result);
