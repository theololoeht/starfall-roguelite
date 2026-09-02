import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, URLSearchParams, location:{search:'?balance=actual'}, performance:{now:()=>0} });
for (const file of ['js/utils.js','js/fx.js','js/config.js','js/sprites.js','js/entities.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, {filename:file});
}

const result = vm.runInContext(`(() => {
  const enemy = {dead:false,spawning:false,damage:0,circleHit(){return {damageMul:1}},hurt(v){this.damage+=v}};
  const cloud = new SporeCloud(100,100,54,3,8,'#8dff5d');
  const game = {enemies:[enemy]};
  for(let i=0;i<60;i++) cloud.update(1/60,game);
  return {damage:enemy.damage,life:cloud.life,dead:cloud.dead};
})()`, context);

assert(result.damage > 6.5 && result.damage < 9.5, '一秒孢子云应造成约8点持续伤害');
assert(result.life > 1.9 && !result.dead, '孢子云必须原地驻留而非命中即消失');
console.log('spore-cloud-smoke:', result);
