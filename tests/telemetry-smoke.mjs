import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const memory = new Map();
const localStorage = {
  getItem:key => memory.has(key) ? memory.get(key) : null,
  setItem:(key, value) => memory.set(key, String(value)),
  removeItem:key => memory.delete(key),
};
const context = vm.createContext({
  console, Math, Date, URLSearchParams, localStorage,
  location:{ hostname:'127.0.0.1', search:'?telemetry=1&session=test-session&runs=3' },
});
for (const file of ['js/utils.js', 'js/config.js', 'js/run-state.js', 'js/telemetry.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename:file });
}

const result = vm.runInContext(`(() => {
  const game = {
    state:RUN_STATES.PLAYING, time:0, initialWeapon:'cannon', archetypeDef:{id:'fortress'},
    level:1, kills:0, score:0, eBullets:[], enemies:[],
    player:{ hp:100, maxHp:100, armor:1, regen:0, dmgMul:1, atkSpdMul:1, moveMul:1, formId:'base', formChain:['base'], skills:{spent:new Set()} },
  };
  RunMonitor.start(game);
  RunMonitor.frame(1 / 60);
  game.time = 2.1;
  const boss = { type:'prism', def:{boss:true}, phaseLabel:'棱镜封锁' };
  game.enemies = [boss]; game.eBullets = [{dead:false}, {dead:false}];
  RunMonitor.sample(game);
  RunMonitor.event('enemy_defeated', { enemy:'mite', offscreen:true }, game);
  game.player.hp = 88;
  RunMonitor.damage(game, 12, {type:'prism_bullet'}, false);
  RunMonitor.damage(game, 0, {type:'prism_bullet'}, true);
  game.time = 8.4; game.level = 3; game.kills = 7; game.score = 900;
  RunMonitor.bossDefeated(game, boss);
  transitionRunState(game, RUN_STATES.GAMEOVER, 'test-finish');
  return JSON.parse(localStorage.getItem(RunMonitor.storageKey));
})()`, context);

assert.equal(result.length, 1);
const run = result[0];
assert.equal(run.session, 'test-session');
assert.equal(run.outcome, 'gameover');
assert.equal(run.weapon, 'cannon');
assert.equal(run.balanceRevision, 'v35-spore-cloud');
assert.equal(run.damageTaken, 12);
assert.equal(run.shieldBlocks, 1);
assert.equal(run.damageBySource.prism_bullet, 12);
assert.equal(run.bossEncounters.prism.defeatedAt, 8.4);
assert.equal(run.level, 3);
assert.equal(run.peakEnemyBullets, 2);
assert.equal(run.offscreenKills, 1);
assert(run.events.some(event => event.type === 'boss_defeated'));
assert(run.events.some(event => event.type === 'state' && event.to === 'gameover'));

console.log('telemetry-smoke:', {
  outcome:run.outcome, duration:run.duration, damage:run.damageTaken,
  shieldBlocks:run.shieldBlocks, events:run.events.length, samples:run.samples.length,
});
