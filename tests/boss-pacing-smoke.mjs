import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, URLSearchParams, location:{search:'?balance=actual'} });
for (const file of ['js/utils.js','js/config.js']) vm.runInContext(fs.readFileSync(new URL(file, root),'utf8'),context,{filename:file});
vm.runInContext(`
  class PrismBoss { constructor(){this.type='prism';this.def={boss:true};this.maxHp=500;this.hp=500;this.dead=false} }
  class DragonBoss { constructor(){this.type='dragon';this.def={boss:true};this.maxHp=100;this.hp=100;this.dead=false} }
`, context);
vm.runInContext(fs.readFileSync(new URL('js/game-encounter.js', root),'utf8'),context,{filename:'js/game-encounter.js'});

const result = vm.runInContext(`(() => {
  const game={time:90,W:1080,H:675,enemies:[],spawnQueue:[],triggeredBosses:new Set(),bossCooldownUntil:0,
    player:{dpsEstimate:100},announce:null,initialState:'playing',hpScale(){return 1}};
  GameEncounterSystem.prototype.updateBossSchedule.call(game);
  const prism={type:game.enemies[0]?.type,hp:game.enemies[0]?.maxHp};
  game.enemies=[]; game.time=180; game.bossCooldownUntil=195;
  GameEncounterSystem.prototype.updateBossSchedule.call(game);
  const blockedDuringRecovery=game.enemies.length===0;
  game.time=195; game.enemies=Array.from({length:11},()=>({dead:false,def:{boss:false}}));
  GameEncounterSystem.prototype.updateBossSchedule.call(game);
  const blockedByCrowd=!game.enemies.some(x=>x.def?.boss);
  game.enemies.length=5;
  GameEncounterSystem.prototype.updateBossSchedule.call(game);
  return {prism,blockedDuringRecovery,blockedByCrowd,dragon:game.enemies.find(x=>x.def?.boss)?.type||null};
})()`, context);

assert.equal(result.prism.type,'prism');
assert(Math.abs(result.prism.hp-1960)<1e-6,'Boss生命应按当前DPS目标时长自适应并受倍率边界约束');
assert(result.blockedDuringRecovery,'整备期内不得补触发逾期Boss');
assert(result.blockedByCrowd,'场上普通敌人过多时不得强插Boss');
assert.equal(result.dragon,'dragon');
console.log('boss-pacing-smoke:', result);
