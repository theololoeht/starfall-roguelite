import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, performance: { now: () => 0 } });
const files = [
  'js/utils.js', 'js/fx.js', 'js/config.js', 'js/run-state.js', 'js/attacks.js', 'js/spawns.js',
  'js/sprites.js', 'js/entities.js', 'js/weapons.js', 'js/game-spawning.js', 'js/game-collision.js',
  'js/game-encounter.js', 'js/game-progression.js', 'js/game-skill-tree.js', 'js/game-effects.js', 'js/game.js',
];
for (const file of files) vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename:file });

const result = vm.runInContext(`(() => {
  const methods = Object.getOwnPropertyNames(Game.prototype);
  const owners = {
    spawning: Object.getOwnPropertyNames(GameSpawningSystem.prototype),
    collision: Object.getOwnPropertyNames(GameCollisionSystem.prototype),
    encounter: Object.getOwnPropertyNames(GameEncounterSystem.prototype),
    progression: Object.getOwnPropertyNames(GameProgressionSystem.prototype),
    skillTree: Object.getOwnPropertyNames(GameSkillTreeSystem.prototype),
    effects: Object.getOwnPropertyNames(GameEffectsSystem.prototype),
  };
  return { methods, owners };
})()`, context);

const expected = {
  spawning:['queueSpawn', 'spawnFromAngle', 'updateSpawns', 'runMassSpawn', 'updateFormations'],
  collision:['collide', 'nearestEnemy'],
  encounter:['updateBossSchedule', 'updateBossIntro', 'onEnemyKilled'],
  progression:['gainXP', 'openChoice', 'buildStatCards', 'pickStat', 'hpScale', 'openTree', 'closeTree', 'toggleTree'],
  skillTree:['treeLayout', 'treeClick', 'hexPath', 'drawTree'],
  effects:['burst', 'explosion', 'explosionHostile', 'addFloat', 'shake'],
};
for (const [system, methods] of Object.entries(expected)) {
  for (const method of methods) {
    assert.ok(result.owners[system].includes(method), `${method} must belong to ${system}`);
    assert.ok(result.methods.includes(method), `${method} must be composed onto Game`);
  }
}

const gameSource = fs.readFileSync(new URL('js/game.js', root), 'utf8');
assert.ok(gameSource.split(/\r?\n/).length < 500, 'game.js should remain below the second extraction ceiling');
assert.ok(!gameSource.includes('  queueSpawn(type,'), 'spawn implementation must not drift back into game.js');
assert.ok(!gameSource.includes('  collide()'), 'collision implementation must not drift back into game.js');
assert.ok(!gameSource.includes('  treeLayout()'), 'skill-tree implementation must not drift back into game.js');
assert.ok(!gameSource.includes('  explosion(x,'), 'effects implementation must not drift back into game.js');

console.log('game-systems-smoke:', {
  gameLines:gameSource.split(/\r?\n/).length,
  systems:Object.fromEntries(Object.entries(result.owners).map(([key, names]) => [key, names.length - 1])),
});
