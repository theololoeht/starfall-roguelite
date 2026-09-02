import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

function load(search) {
  const context = vm.createContext({ console, Math, URLSearchParams, location: { search } });
  for (const file of ['js/utils.js', 'js/config.js']) {
    vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
  }
  return vm.runInContext(`({
    mode: BALANCE_MODE,
    profile: JSON.parse(JSON.stringify(BALANCE)),
    midBossAt: BOSS_SCHEDULE.find(x => !x.final).at,
    bossAt: BOSS_SCHEDULE.find(x => x.final).at,
    waveLen: WAVE_LEN,
    firstFormationAt: FIRST_FORMATION_AT,
    unlocks: ENEMY_SPAWN_ROSTER.map(x => [x.type, x.unlockAt]),
    baseUnlocks: ENEMY_SPAWN_ROSTER_BASE.map(x => [x.type, x.unlockAt]),
    scaledDamage: scaledEnemyDamage(20),
    debugHp: DEBUG_SCENARIOS.boss.playerHp,
  })`, context);
}

const actual = load('?balance=actual');
const test = load('?balance=test');
const fallback = load('?balance=unknown');

assert.equal(actual.mode, 'actual');
assert.equal(test.mode, 'test');
assert.equal(fallback.mode, 'actual', '非法或缺失配置档必须安全回退正式数值');
assert.equal(actual.bossAt, 180);
assert.equal(test.bossAt, 36);
assert.equal(actual.midBossAt, 90);
assert.equal(test.midBossAt, 18);
assert.equal(actual.waveLen, 30);
assert.equal(test.waveLen, 12);
assert.equal(actual.firstFormationAt, 24);
assert.equal(test.firstFormationAt, 8);
assert.equal(actual.scaledDamage, 20);
assert.equal(test.scaledDamage, 10);
assert.equal(actual.profile.combat.playerDamageMul, 1);
assert.equal(actual.profile.combat.enemyHpMul, 1.35);
assert.equal(actual.profile.combat.bossTuning.dragon.targetSeconds, 36);
assert.equal(actual.profile.pacing.bossRecovery, 15);
assert.equal(actual.profile.pacing.groupBase, 2);
assert.equal(actual.profile.pacing.groupMax, 4);
assert.equal(actual.profile.growth.hpPerSecond, 0.009);
assert.equal(test.profile.combat.playerDamageMul, 2);
assert.equal(test.profile.combat.enemyHpMul, 0.65);
assert.equal(test.profile.combat.xpMul, 3);
assert.equal(test.debugHp, 99999, '99999 生命只能保留在显式调试场景配置中');

for (let i = 0; i < actual.unlocks.length; i++) {
  assert.equal(actual.unlocks[i][1], actual.baseUnlocks[i][1], '正式档必须保留设计解锁时间');
  assert.equal(test.unlocks[i][1], test.baseUnlocks[i][1] * 0.2, '测试档必须按统一倍率压缩解锁时间');
}

console.log('balance-profiles-smoke:', {
  actual: { midBossAt:actual.midBossAt, bossAt:actual.bossAt, waveLen:actual.waveLen, damage:actual.scaledDamage },
  test: { midBossAt:test.midBossAt, bossAt:test.bossAt, waveLen:test.waveLen, damage:test.scaledDamage },
});
