import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, performance:{now:()=>0} });
for (const file of ['js/utils.js','js/fx.js','js/config.js','js/run-state.js','js/attacks.js','js/spawns.js','js/sprites.js','js/entities.js','js/weapons.js','js/game.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, {filename:file});
}
vm.runInContext(`const input={keys:{},mx:0,my:0,mouseActive:false};`, context);

const result = vm.runInContext(`(() => {
  const makeNova = branch => {
    const p = new Player(); p.addWeapon('nova'); p.treeId='nova'; p.formId='plague';
    p.formChain=['base',branch,'plague']; p.recomputeFire(); p.x=200; p.y=200; p.aim=0;
    return p;
  };
  const enemy = {x:200,y:80,dead:false,spawning:false,dot:{stacks:0,dps:0,time:0},
    circleHit(){return null;},segmentHit(){return null;},hurt(){}};
  const fakeGame = p => ({player:p,enemies:[enemy],pBullets:[],rings:[],flashes:[],particles:[],trails:[],
    nearestEnemy(){return enemy;},shake(){},burst(){},explosion(){},addFloat(){}});

  const mist = makeNova('mist'), mistGame=fakeGame(mist);
  novaTick(mistGame,mist.mainWeapon,0.1);
  const mistRt=mist.mainWeapon.attackStates['nova:plague:2'], orbitA=mistRt.bladeAngles[0];
  mist.aim=2.4; novaTick(mistGame,mist.mainWeapon,0.1);
  const orbitDelta=Math.abs(angDiff(mistRt.bladeAngles[0],orbitA));

  const flame = makeNova('flameblade'), flameGame=fakeGame(flame);
  novaTick(flameGame,flame.mainWeapon,0.1);
  const flameRt=flame.mainWeapon.attackStates['nova:plague:2'];

  const shield = new Player(), shieldHp=shield.hp;
  const shieldGame={rings:[],flashes:[],particles:[],addFloat(){},shake(){},burst(){},nearestEnemy(){return null;}};
  shield.hurt(40,shieldGame,{x:shield.x+100,y:shield.y});
  const shieldFirst={hp:shield.hp,layers:shield.shield,hitT:shield.shieldFx.hitT,angle:shield.shieldFx.impactAngle};
  shield.hurt(40,shieldGame,{x:shield.x,y:shield.y+100});
  const overlapHp=shield.hp;
  shield.shieldIframes=0; shield.hurt(40,shieldGame,{x:shield.x,y:shield.y+100});
  const realHitHp=shield.hp;
  shield.iframes=0; shield.hitIdleT=shield.shieldRegenT-0.01; shield.update(0.02,shieldGame);

  const director=Object.create(Game.prototype);
  Object.assign(director,{spawnQueue:[],enemies:[]});
  let accepted=0;
  for(let i=0;i<13;i++) if(director.queueSpawn('mite',0,i,0.5,{source:'natural',groupId:'test'})) accepted++;
  const picked=chooseFormation(['vee','spiral','ring'],['vee','spiral']);

  return {
    mistModes:mist.attacks.map(a=>a.mode), mistParents:mist.attacks.map(a=>a.parentFormId),
    mistBehavior:mistRt.bladeBehavior, orbitDelta,
    flameModes:flame.attacks.map(a=>a.mode), flameParents:flame.attacks.map(a=>a.parentFormId),
    flameBehavior:flameRt.bladeBehavior, lockTarget:flameRt.lockTarget===enemy,
    shieldFirst, shieldHp, overlapHp, realHitHp, recharged:shield.shield, chargeT:shield.shieldFx.chargeT,
    accepted, source:director.spawnQueue[0].source, groupId:director.spawnQueue[0].groupId,
    antiRepeatPick:picked, spawnValid:validateSpawnDefinitions(),
    validMistPath:validateEvolutionPath(SKILL_TREES.nova,['base','mist','plague']),
    invalidPath:validateEvolutionPath(SKILL_TREES.nova,['base','plague']),
  };
})()`, context);

assert.equal(result.mistModes.join(','),'spore,mist,plague','毒雾终极路线必须保留三段攻击');
assert.equal(result.flameModes.join(','),'spore,flameblade,plague','焰刃终极路线必须保留三段攻击');
assert.equal(result.mistParents.join(','),',base,mist','毒雾终极攻击必须记录父分支');
assert.equal(result.flameParents.join(','),',base,flameblade','焰刃终极攻击必须记录父分支');
assert(result.mistBehavior==='orbit' && result.orbitDelta>0.1 && result.orbitDelta<0.25,'毒雾来源双刃必须按固定角速度公转且不跟随机头跳转');
assert(result.flameBehavior==='targetLock' && result.lockTarget,'焰刃来源双刃必须主动锁定最近敌人');
assert.equal(result.shieldFirst.hp,result.shieldHp,'光盾必须完整抵消一次伤害');
assert(result.shieldFirst.layers===0 && result.shieldFirst.hitT>0 && Number.isFinite(result.shieldFirst.angle),'光盾受击必须消耗一层并记录方向反馈');
assert.equal(result.overlapHp,result.shieldHp,'同一碰撞簇不得瞬间穿透刚破碎的光盾');
assert(result.realHitHp<result.shieldHp,'保护窗结束后的真实伤害必须生效');
assert(result.recharged===1 && result.chargeT>0,'连续安全时间达到阈值后应恢复一层并触发充能反馈');
assert.equal(result.accepted,12,'自然刷怪待生成队列必须受来源容量限制');
assert(result.source==='natural' && result.groupId==='test','出怪请求必须保留来源与分组');
assert.equal(result.antiRepeatPick,'ring','阵型选择必须避开最近两次重复');
assert(result.spawnValid && result.validMistPath && !result.invalidPath,'出怪定义和进化路径必须通过契约校验');

console.log('systems-v23-smoke:',result);
