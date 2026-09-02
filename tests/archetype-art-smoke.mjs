import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math, performance: { now: () => 0 } });
for (const file of ['js/utils.js', 'js/fx.js', 'js/config.js', 'js/attacks.js', 'js/sprites.js', 'js/entities.js', 'js/weapons.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
}

const result = vm.runInContext(`(() => {
  function enemyAt(x, y) {
    return {
      x, y, dead:false, spawning:false,
      dot:{stacks:0,dps:0,time:0}, damage:0,
      circleHit(cx, cy, r) { return Math.hypot(this.x-cx, this.y-cy) <= r ? {x:this.x,y:this.y,damageMul:1} : null; },
      segmentHit(x1,y1,x2,y2,padding) { return distToSeg(this.x,this.y,x1,y1,x2,y2) <= padding + 8 ? {x:this.x,y:this.y,damageMul:1} : null; },
      hurt(v) { this.damage += v; },
    };
  }
  const basePlayer = id => ({
    x:100,y:100,treeId:id,formId:'base',form:SKILL_TREES[id].forms.base,
    fire:{...SKILL_TREES[id].forms.base.fire},skills:{spent:new Set()},
    dmgMul:1,atkSpdMul:1,regen:0,t:0,aim:0,muzzleFlashT:0,
    formChain:['base'],shield:0,hitIdleT:0,
    attacks:[{formId:'base',mode:SKILL_TREES[id].forms.base.fire.mode||'gun',fire:{...SKILL_TREES[id].forms.base.fire},color:SKILL_TREES[id].forms.base.color}],
  });
  const novaFormPlayer = formId => {
    const chain = formId === 'plague' ? ['base','flameblade','plague'] : ['base',formId];
    const p = { ...basePlayer('nova'), formId, form:SKILL_TREES.nova.forms[formId],
      fire:{...SKILL_TREES.nova.forms[formId].fire}, aim:0,
      formChain:chain.slice() };
    // 攻击组：链上每段形态各一段攻击（攻击保留语义）
    p.attacks = chain.map(fid => {
      const fm = SKILL_TREES.nova.forms[fid];
      const f = { ...fm.fire };
      for (const cid of chain) {
        const cm = SKILL_TREES.nova.forms[cid];
        for (const n of cm.nodes) if (p.skills.spent.has(n.id)) n.apply(f);
        if (cm.capstone && p.skills.spent.has(cm.capstone.id)) cm.capstone.apply(f);
      }
      return { formId:fid, mode:f.mode||'gun', fire:f, color:fm.color };
    });
    p.fire = p.attacks[p.attacks.length-1].fire;
    return p;
  };

  const novaEnemy = enemyAt(600,100), novaPlayer = basePlayer('nova'), novaWeapon = makeWeapon('nova');
  const novaGame = {player:novaPlayer,enemies:[novaEnemy],pBullets:[],nearestEnemy(x,y,r){return Math.hypot(novaEnemy.x-x,novaEnemy.y-y)<=r?novaEnemy:null;},rings:[],flashes:[],shake(){},burst(){}};
  novaTick(novaGame,novaWeapon,1/60);
  const spore = novaGame.pBullets[0];
  const novaShot = {count:novaGame.pBullets.length,vis:spore?.vis,homing:spore?.homing,damage:novaEnemy.damage,rangeLife:spore?.life,
    spawnNear:Math.hypot(spore.x-novaPlayer.x,spore.y-novaPlayer.y)<40,
    noLock:spore.homeTarget===null};
  // 近距武装：远处保持漂移，敌机靠近孢子后锁定并加速。
  spore.update(1/60, novaGame);
  const stayedUnarmed = spore.homeTarget === null;
  novaEnemy.x = spore.x + 80; novaEnemy.y = spore.y;
  const speedBeforeArm = Math.hypot(spore.vx, spore.vy);
  spore.update(1/60, novaGame);
  const armedNearby = spore.homeTarget === novaEnemy;
  const speedAfterArm = Math.hypot(spore.vx, spore.vy);
  for (let i = 0; i < 20; i++) novaTick(novaGame, novaWeapon, 1);
  const sporeCap = novaGame.pBullets.filter(b => !b.dead && b.ownerAttackId === 'nova:base:0').length;
  spore.applyCorrosionTo(novaEnemy);
  const novaHit = {damage:novaEnemy.damage,stacks:novaEnemy.dot.stacks,dps:novaEnemy.dot.dps,time:novaEnemy.dot.time};
  const regen0 = dotRegenScaling({regen:0}), regen3 = dotRegenScaling({regen:3}), regenCap = dotRegenScaling({regen:10});

  const flameEnemy = enemyAt(170,100), flamePlayer = novaFormPlayer('flameblade'), flameWeapon = makeWeapon('nova');
  const flameGame = {player:flamePlayer,enemies:[flameEnemy],pBullets:[],rings:[],flashes:[],shake(){},burst(){},explosion(){}};
  novaTick(flameGame,flameWeapon,0.13);
  const flameRt = flameWeapon.attackStates['nova:flameblade:1'];
  const flame = {damage:flameEnemy.damage,stacks:flameEnemy.dot.stacks,angles:flameRt.bladeAngles.length,
    sporesKept:flameGame.pBullets.filter(b=>b.vis==='spore').length,   // 前一级攻击方式保留：孢子仍在生成
    bladeKeyed:!!flameRt};

  const mistEnemy = enemyAt(150,100), mistPlayer = novaFormPlayer('mist'), mistWeapon = makeWeapon('nova');
  const mistGame = {player:mistPlayer,enemies:[mistEnemy],pBullets:[],rings:[],flashes:[],shake(){},burst(){},explosion(){}};
  novaTick(mistGame,mistWeapon,0.2);
  const mistRt = mistWeapon.attackStates['nova:mist:1'];
  const mist = {damage:mistEnemy.damage,stacks:mistEnemy.dot.stacks,motes:mistRt.motes.length,radius:mistRt.mistRadius};

  const plagueEnemy = enemyAt(150,100), plaguePlayer = novaFormPlayer('plague'), plagueWeapon = makeWeapon('nova');
  const plagueGame = {player:plaguePlayer,enemies:[plagueEnemy],pBullets:[],rings:[],flashes:[],shake(){},burst(){},explosion(){}};
  novaTick(plagueGame,plagueWeapon,0.13);
  const plagueRt = plagueWeapon.attackStates['nova:plague:2'];
  const plague = {damage:plagueEnemy.damage,stacks:plagueEnemy.dot.stacks,motes:plagueRt.motes.length,angles:plagueRt.bladeAngles.length};

  const swordEnemy = enemyAt(150,100), swordPlayer = basePlayer('sword'), swordWeapon = makeWeapon('sword');
  const swordGame = {player:swordPlayer,enemies:[swordEnemy],nearestEnemy(){return swordEnemy;},burst(){}};
  swordTick(swordGame,swordWeapon,1/60);
  const swordBefore = {phase:swordWeapon.state.phase,damage:swordEnemy.damage};
  swordTick(swordGame,swordWeapon,0.2);
  const swordAfter = {phase:swordWeapon.state.phase,damage:swordEnemy.damage,marks:swordWeapon.state.marks.length};

  return {
    ready:[!!SKILL_TREES.nova,!!SKILL_TREES.sword],
    branchForms:SKILL_TREES.nova.branchForms,
    visuals:['nova','flameblade','mist','plague'].map(id=>Sprites.playerExhausts(id).length),
    novaShot,novaHit,sporeCap,stayedUnarmed,armedNearby,speedBeforeArm,speedAfterArm,regen0,regen3,regenCap,flame,mist,plague,swordBefore,swordAfter,
  };
})()`, context);

assert.equal(result.ready.join(','), 'true,true', '腐蚀孢子与相位刃必须进入正式可选列表');
assert.equal(result.novaShot.count, 1, '腐蚀孢子应在远距离目标存在时发射一枚弹体');
assert(result.novaShot.vis === 'spore' && result.novaShot.homing, '腐蚀孢子必须使用独立视觉并轻度追踪');
assert(result.novaShot.spawnNear, '孢子应在机体附近随机生成（而非炮口直射）');
assert(result.novaShot.noLock, '无敌机靠近时孢子不应锁定目标（近距武装）');
assert(result.stayedUnarmed && result.armedNearby, '孢子应先漂移，并在敌机进入 150px 后才锁定');
assert(result.speedAfterArm > result.speedBeforeArm, '孢子锁定后应从慢速漂移加速为追踪弹');
assert.equal(result.sporeCap, 10, '孢子存活数必须受独立容量上限约束');
assert.equal(result.novaShot.damage, 0, '孢子生成时不得隔空造成伤害');
assert(result.novaShot.rangeLife > 1, '弹体寿命必须覆盖基础 620px 射程');
assert(result.novaHit.stacks === 1 && result.novaHit.dps > 0 && result.novaHit.time > 0, '孢子命中应写入一层腐蚀快照');
assert.equal(result.regen0.poisonMul, 1, '零恢复不应额外放大毒伤');
assert(Math.abs(result.regen3.poisonMul - 1.36) < 1e-9 && Math.abs(result.regen3.rangeMul - 1.15) < 1e-9, '3/s 恢复应转换为 +36% 毒伤和 +15% 距离');
assert.equal(result.regenCap.poisonMul, 1.6, '恢复转化必须在 5/s 封顶');
assert.equal(result.regenCap.rangeMul, 1.25, '距离转化必须在 +25% 封顶');
assert.equal(result.branchForms.join(','), 'flameblade,mist', 'DOT 树必须拥有焰刃和粒子雾两个真实分支');
assert(result.flame.damage > 0 && result.flame.stacks === 1 && result.flame.angles === 1, '焰刃应沿前向线段持续伤害并叠腐蚀');
assert(result.flame.sporesKept > 0, '进化后前一级攻击方式（孢子）必须保留');
assert(result.flame.bladeKeyed, '焰刃状态必须按攻击分段存储');
assert(result.mist.damage > 0 && result.mist.stacks === 1 && result.mist.motes > 0, '粒子雾应生成驻留粒子并造成范围持续伤害');
assert(result.plague.damage > 0 && result.plague.stacks >= 1 && result.plague.motes > 0 && result.plague.angles === 2, '终极形态应同时拥有双焰刃、毒雾和腐蚀');
assert.equal(result.swordBefore.phase, 'windup', '相位刃应先给出方向前摇');
assert.equal(result.swordBefore.damage, 0, '相位刃前摇不得提前命中');
assert(result.swordAfter.damage > 0 && result.swordAfter.marks === 1, '刀口经过目标后应只产生一次伤害和一道裂口');
assert.equal(result.visuals.join(','), '1,2,1,3', 'DOT 四套机体必须拥有可区分的喷口布局');

console.log('archetype-art-smoke:', result);
