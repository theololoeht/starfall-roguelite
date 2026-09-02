import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, URLSearchParams, location:{search:'?balance=actual'} });
for (const file of ['js/utils.js', 'js/config.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename:file });
}

const balance = vm.runInContext(`({
  revision:BALANCE_REVISION,
  enemyHpMul:BALANCE.combat.enemyHpMul,
  bossTuning:JSON.parse(JSON.stringify(BALANCE.combat.bossTuning)),
  spawnBase:BALANCE.pacing.spawnBase,
  spawnMin:BALANCE.pacing.spawnMin,
  groupBase:BALANCE.pacing.groupBase,
  groupMax:BALANCE.pacing.groupMax,
  autoAimTurnSpeed:PLAYER_BASE.autoAimTurnSpeed,
})`, context);
assert.equal(balance.revision, 'v35-spore-cloud');
assert(balance.enemyHpMul > 1);
assert(balance.bossTuning.prism.targetSeconds >= 20 && balance.bossTuning.dragon.maxMul >= 8);
assert(balance.spawnMin < 0.5 && balance.groupBase >= 2 && balance.groupMax >= 4);
assert(balance.autoAimTurnSpeed >= 8 && balance.autoAimTurnSpeed <= 10, '自动转向应灵敏但有限速');

const entities = fs.readFileSync(new URL('js/entities.js', root), 'utf8');
const collision = fs.readFileSync(new URL('js/game-collision.js', root), 'utf8');
const encounter = fs.readFileSync(new URL('js/game-encounter.js', root), 'utf8');
assert.match(entities, /autoAimTurnSpeed \* dt/, '玩家朝向必须按帧限速而非瞬间赋值');
assert.match(entities, /this\.x = clamp\(this\.x, 10, CANVAS_W - 10\)/, '经验晶体必须留在可见区域');
assert.match(collision, /!e\.def\?\.boss.*e\.x < -12/, '屏外普通敌人不得成为自动索敌目标');
assert.match(encounter, /const dropX = clamp\(e\.x, 18, this\.W - 18\)/, '屏外击杀必须把经验投放到画面边缘');

console.log('playtest-feedback-smoke:', balance);
