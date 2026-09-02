import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync(new URL('js/run-state.js', root), 'utf8'), context);
const result = vm.runInContext(`(() => {
  const game = { state:RUN_STATES.MENU, time:0 };
  transitionRunState(game, RUN_STATES.PLAYING, 'start');
  transitionRunState(game, RUN_STATES.LEVELUP, 'level');
  transitionRunState(game, RUN_STATES.TREE, 'inspect');
  transitionRunState(game, RUN_STATES.LEVELUP, 'return');
  let illegalRejected = false;
  try { transitionRunState(game, RUN_STATES.VICTORY, 'skip'); } catch (_) { illegalRejected = true; }
  return { state:game.state, illegalRejected, states:Object.values(RUN_STATES) };
})()`, context);
assert.equal(result.state, 'levelup');
assert(result.illegalRejected, '不得从升级界面跳过战斗直接进入胜利');
assert.equal(result.states.length, 8, '状态集合必须包含完整流程');
console.log('run-state-smoke:', result);
