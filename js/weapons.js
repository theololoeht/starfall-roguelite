// ===== 武器实例与行为分发 =====
// 武器框架：配置表(def) 定义数值，按 def.type 分发到具体攻击行为。
// 新增攻击方式 = config.js 加一条 def + 这里加一个 tick 函数。

function makeWeapon(id) {
  const def = WEAPON_DEFS[id];
  if (!def) throw new Error(`未知武器: ${id}`);
  const tree = SKILL_TREES[id];
  return {
    id, def,
    level: 1,
    max: tree ? null : def.maxLevel,
    stats: tree ? { ...tree.forms.base.fire } : def.levelStats(1),
    t: 0,
    state: {},
  };
}

function updateWeapon(game, w, dt) {
  runAttackHandler(canonicalAttackKind(w.def.type), { game, weapon:w, dt, owner:game.player, spec:w.stats, key:w.id });
}

function playerVisualLevel(p) { return p.treeId ? clamp(1 + p.skills.spent.size, 1, 5) : 1; }

// 有蜂巢树的武器读取攻击组（链上每段形态各一段）；尚未接树的武器继续使用原 levelStats。
function activeAttacks(p, w) {
  if (p.treeId === w.id && p.attacks && p.attacks.length) return p.attacks;
  return [{ formId: 'base', mode: w.stats.mode || canonicalAttackKind(w.def.type), fire: w.stats, color: w.def.color }];
}
// 兼容：单段攻击读取
function activeWeaponStats(p, w) { return activeAttacks(p, w)[0].fire; }

function playerMuzzleWorld(p, index = 0, count = 1) {
  const visualFormId = p.treeId === 'nova' && p.formId === 'base' ? 'nova' : (p.formId || 'base');
  const points = Sprites.playerMuzzles(visualFormId, count, playerVisualLevel(p));
  const m = points[Math.min(index, points.length - 1)] || points[0];
  const forward = -m.y, sideA = p.aim + Math.PI / 2;
  return {
    x: p.x + Math.cos(p.aim) * forward + Math.cos(sideA) * m.x,
    y: p.y + Math.sin(p.aim) * forward + Math.sin(sideA) * m.x,
  };
}

// ── 传统射击：遍历攻击组（进化保留前一级攻击方式，同轮齐发）──
function gunTick(game, w, dt) {
  const p = game.player;
  const attacks = p.attacks && p.attacks.length ? p.attacks : null;
  if (!attacks) { fallbackGunTick(game, w, dt); return; }
  // 电磁脉冲（磁轨 r3）：自动周期清除敌弹（任意一段带 emp 即生效）
  if (attacks.some(a => a.fire.emp)) {
    p.empT -= dt;
    if (p.empT <= 0) { p.empT = 4; game.empPulse(); }
  }
  w.t -= dt;
  if (w.t > 0) return;
  p.shotN++;
  let maxInterval = 0;
  for (const atk of attacks) {
    const f = atk.fire;
    // 蓄能狙击（磁轨 r2）：静止 0.5s 后该段攻击的下一发强化
    let mult = 1, rMul = 1;
    if (f.charge && p.stillT > 0.5) { mult = 2.5; rMul = 1.8; }
    const heavy = f.heavyEvery && p.shotN % f.heavyEvery === 0;
    const explosive = f.explosiveEvery && p.shotN % f.explosiveEvery === 0;
    p.stillConsume = p.stillConsume || 0;
    const col = atk.color;
    const visBase = atk.formId === 'shotgun' ? 'shard' : atk.formId === 'rail' ? 'lance' : atk.formId === 'ultimate' ? 'nova' : 'comet';
    const spawn = (a, mul, extraR, muzzleIndex = 0, muzzleCount = 1) => {
      const muzzle = playerMuzzleWorld(p, muzzleIndex, muzzleCount);
      game.pBullets.push(new Bullet(
        muzzle.x, muzzle.y,
        Math.cos(a) * f.bulletSpeed * (heavy ? 1.25 : 1), Math.sin(a) * f.bulletSpeed * (heavy ? 1.25 : 1),
        f.damage * p.dmgMul * mult * mul * (heavy ? 2 : 1),
        f.bulletR * rMul * extraR * (heavy ? 1.6 : 1),
        (f.pierce || 1) + (heavy ? 1 : 0),
        col,
        {
          splashR: f.splash, splashMul: f.splashMul,
          ricochet: f.ricochet, ricochetMul: f.ricochetMul,
          frag: f.frag, homing: f.homing, homingProximity: f.homingProximity,
          explosiveR: explosive ? (f.explosiveR || 70) : 0,
          knockback: heavy ? 26 : 0,
          chain: f.chain,
          kind: heavy ? 'heavy' : explosive ? 'explosive' : 'normal',
          vis: heavy ? 'dart' : explosive ? 'explosive' : visBase,
        }
      ));
    };
    const n = f.projectiles;
    for (let i = 0; i < n; i++) {
      spawn(p.aim + (n > 1 ? (i - (n - 1) / 2) * (f.spread || 0.11) : 0) + rand(-0.015, 0.015), 1, 1, i, n);
    }
    if (f.sideShots) { spawn(p.aim - 0.42, 0.5, 0.85, 0, 2); spawn(p.aim + 0.42, 0.5, 0.85, 1, 2); }
    maxInterval = Math.max(maxInterval, f.interval);
  }
  if (attacks.some(a => a.fire.charge) && p.stillT > 0.5) p.stillT = 0;
  w.t = Math.min(...attacks.map(a => a.fire.interval)) / p.atkSpdMul;
  p.muzzleFlashT = 0.075;
  game.burst(p.x + Math.cos(p.aim) * 20, p.y + Math.sin(p.aim) * 20, attacks[0].color, 2, 90);
}

// 无技能树武器的兜底射击（自动索敌）
function fallbackGunTick(game, w, dt) {
  const p = game.player, st = w.stats;
  w.t -= dt;
  if (w.t > 0) return;
  if (!game.nearestEnemy) return;   // 桩环境无索敌能力
  const tgt = game.nearestEnemy(p.x, p.y, 900);
  if (!tgt) return;
  w.t = st.interval / p.atkSpdMul;
  const base = angleTo(p.x, p.y, tgt.x, tgt.y);
  const n = st.projectiles || 1;
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i - (n - 1) / 2) * 0.13 : 0);
    const muzzle = playerMuzzleWorld(p, i, n);
    game.pBullets.push(new Bullet(
      muzzle.x, muzzle.y,
      Math.cos(a) * st.bulletSpeed, Math.sin(a) * st.bulletSpeed,
      st.damage * p.dmgMul, st.bulletR, st.pierce || 1, w.def.color
    ));
  }
  p.muzzleFlashT = 0.075;
}

// ── 激光：持续聚焦光束 ─────────────────────
function laserTick(game, w, dt) {
  const p = game.player, st = w.stats, s = w.state;
  s.active = false;
  const main = game.nearestEnemy(p.x, p.y, st.range);
  if (!main) return;
  s.active = true;

  fireLaserBeam(game, w, p, main, 1, dt);
  // Lv4+ 双束分光
  if (st.beams >= 2) {
    const t2 = game.nearestEnemy(p.x, p.y, st.range, main);
    if (t2) fireLaserBeam(game, w, p, t2, 0.8, dt);
  }
  // Lv5 贯穿：光束延长线上的敌人受半额灼烧
  if (st.pierce) {
    const a = angleTo(p.x, p.y, main.x, main.y);
    const ex = p.x + Math.cos(a) * st.range, ey = p.y + Math.sin(a) * st.range;
    for (const e of game.enemies) {
      if (e.dead || e.spawning || e === main) continue;
      const zone = e.segmentHit(p.x, p.y, ex, ey, st.width);
      if (zone) e.hurt(st.dps * p.dmgMul * 0.5 * dt * zone.damageMul, game, false);
    }
  }
}

function fireLaserBeam(game, w, p, tgt, mul, dt) {
  const st = w.stats;
  const muzzle = playerMuzzleWorld(p, 0, 1);
  game.beams.push({ x1: muzzle.x, y1: muzzle.y, x2: tgt.x, y2: tgt.y, color: w.def.color, width: st.width });
  p.muzzleFlashT = 0.045;
  tgt.hurt(st.dps * p.dmgMul * mul * dt, game, false);
  if (Math.random() < dt * 25) game.burst(tgt.x + rand(-6, 6), tgt.y + rand(-6, 6), w.def.color, 1, 150);
}

// ── 撞击（带拖尾）：突进由 Player.dashT 驱动 ──
function ramTick(game, w, dt) {
  const p = game.player, st = w.stats;
  if (p.dashT > 0) return;
  w.t -= dt;
  if (w.t > 0) return;
  const tgt = game.nearestEnemy(p.x, p.y, 520);
  if (!tgt) return;
  w.t = st.interval / p.atkSpdMul;
  const a = angleTo(p.x, p.y, tgt.x, tgt.y);
  p.dashT = st.dashTime;
  p.dashVx = Math.cos(a) * st.dashSpeed;
  p.dashVy = Math.sin(a) * st.dashSpeed;
  p.dashDamage = st.damage * p.dmgMul;
  p.dashHits.clear();
  p.iframes = Math.max(p.iframes, st.dashTime + 0.1);
  game.rings.push(new Ring(p.x, p.y, 8, 30, 0.25, w.def.color, 2));
}

// ── 腐蚀叠层 ─────────────────────────────
function dotRegenScaling(p) {
  const recovery = clamp(p.regen || 0, 0, 5);
  return { recovery, poisonMul: 1 + recovery * 0.12, rangeMul: 1 + recovery * 0.05 };
}

function applyCorrosion(game, e, st, p) {
  if (e.dead) return;
  const dot = e.dot;
  const layerDps = st.stackDps * (st.dotMul || 1) * dotRegenScaling(p).poisonMul * p.dmgMul;
  if (dot.stacks === 0) dot.dps = layerDps;
  else dot.dps = Math.max(dot.dps, layerDps);
  dot.stacks = Math.min(st.maxStacks, dot.stacks + 1);
  dot.time = st.stackDuration;
}

function corrosionSporeTick(game, w, dt, p, st, key = 'spore') {
  const rt = attackRuntime(w, key);
  rt.cooldown = (rt.cooldown || 0) - dt;
  if (rt.cooldown > 0) return;
  const cap = st.capacity?.maxAlive ?? 10;
  const alive = game.pBullets.reduce((n, b) => n + (!b.dead && b.ownerAttackId === key ? 1 : 0), 0);
  if (alive >= cap) { rt.cooldown = 0.08; return; }
  rt.cooldown = st.interval / p.atkSpdMul;
  const regen = dotRegenScaling(p);
  const range = st.range * (st.rangeMul || 1) * regen.rangeMul;
  const layerDps = st.stackDps * (st.dotMul || 1) * regen.poisonMul * p.dmgMul;
  const origin = resolveAttackOrigin(st.origin, { game, owner:p, weapon:w, muzzle:(i,c)=>playerMuzzleWorld(p,i,c) });
  const da = origin.angle + rand(-0.65, 0.65);
  const lo = st.launch?.driftSpeedMinMul ?? 0.18, hi = st.launch?.driftSpeedMaxMul ?? 0.28;
  const sp = st.bulletSpeed * rand(lo, hi);
  const b = new Bullet(
    origin.x, origin.y, Math.cos(da) * sp, Math.sin(da) * sp,
    st.damage * p.dmgMul, st.bulletR, st.pierce || 1, p.form?.color || w.def.color,
    { homing: true, homingRange: range, homingProximity:st.targeting?.acquireRadius || 150,
      homingTurn:st.targeting?.turnSpeed || 4.2, homingSpeed:st.bulletSpeed,
      homingAccel:st.launch?.chaseAccel || 420, ownerAttackId:key, vis: 'spore',
      corrosion: { stacks:st.stacks, layerDps, maxStacks:st.maxStacks, duration:st.stackDuration },
      sporeCloud: {
        radius:st.cloudRadius * (st.rangeMul || 1), duration:st.cloudDuration,
        dps:st.cloudDps * p.dmgMul, maxAlive:st.cloudMaxAlive,
      } }
  );
  b.life = st.life || 5.5;
  game.pBullets.push(b);
  game.burst(origin.x, origin.y, p.form?.color || w.def.color, 1, 45);
}

function novaPulseTick(game, w, dt, p, st, s) {
  const radius = st.radius * (st.rangeMul || 1);
  if (s.phase === 'windup') {
    s.windupT -= dt;
    if (s.windupT > 0) return;
    s.phase = 'cooldown';
    s.cooldown = st.interval / p.atkSpdMul;
    game.rings.push(new Ring(p.x, p.y, 16, radius, 0.5, w.def.color, 5));
    if (st.doubleRing) game.rings.push(new Ring(p.x, p.y, radius * 0.34, radius * 0.9, 0.72, '#d7ff8d', 2.4));
    game.flashes.push(new Flash(p.x, p.y, 24, 0.16, '#eaffc7'));
    game.shake(2);
    let hit = false;
    for (const e of game.enemies) {
      if (e.dead || e.spawning) continue;
      const zone = e.circleHit(p.x, p.y, radius);
      if (zone) {
        hit = true;
        e.hurt(st.pulseDmg * p.dmgMul * zone.damageMul, game, true);
        for (let k = 0; k < st.stacks; k++) applyCorrosion(game, e, st, p);
      }
    }
    if (hit) game.burst(p.x, p.y, w.def.color, 8, radius * 1.2);
    return;
  }
  s.cooldown = (s.cooldown || 0) - dt;
  if (s.cooldown > 0) return;
  s.phase = 'windup';
  s.windupMax = st.windup || 0.42;
  s.windupT = s.windupMax;
}

function updateCorrosionMotes(p, s, st, dt, radius) {
  s.motes = (s.motes || []).filter(m => {
    m.life -= dt; m.x += m.vx * dt; m.y += m.vy * dt;
    m.vx *= Math.pow(0.88, dt * 10); m.vy *= Math.pow(0.88, dt * 10);
    return m.life > 0;
  });
  s.emitT = (s.emitT || 0) - dt;
  const limit = Math.round(st.maxMotes * (st.moteMul || 1));
  if (s.emitT <= 0 && s.motes.length < limit) {
    s.emitT = st.emitInterval;
    const a = rand(0, TAU), rr = rand(12, radius * 0.72), life = st.moteLife * rand(0.78, 1.08);
    s.motes.push({
      x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr,
      vx: Math.cos(a) * rand(8, 24) + rand(-12, 12), vy: Math.sin(a) * rand(8, 24) + rand(-12, 12),
      r: rand(9, 16), life, maxLife: life, phase: rand(0, TAU),
    });
  }
}

function corrosionBladeDamage(game, p, st, s, angles, tick) {
  // 每道焰刃独立判定：同一敌人可以被多道焰刃同时命中（各自结算）
  const pulse = s.bladePulse || 1;                       // 0.9~1.0 喷射脉动，判定与视觉同源
  const range = st.range * (st.rangeMul || 1) * (st.bladeRangeMul || 1) * dotRegenScaling(p).rangeMul * pulse;
  const width = st.width * (st.bladeWidthMul || 1);
  const hitBy = new Map();                              // enemy -> 命中该敌的焰刃数量
  angles.forEach((a, bi) => {
    const ex = p.x + Math.cos(a) * range, ey = p.y + Math.sin(a) * range;
    for (const e of game.enemies) {
      if (e.dead || e.spawning) continue;
      const zone = e.segmentHit(p.x, p.y, ex, ey, width * 0.5);
      if (zone) hitBy.set(e, (hitBy.get(e) || 0) + 1);
    }
  });
  for (const [e, hits] of hitBy) {
    e.hurt(st.dps * (st.bladeDmgMul || 1) * p.dmgMul * tick * hits, game, false);
    if (s.stackT <= 0) applyCorrosion(game, e, st, p);
  }
  if (s.stackT <= 0 && hitBy.size) s.stackT = st.stackEvery;
  s.bladeAngles = angles; s.bladeRange = range; s.bladeWidth = width;
}

function corrosionMistDamage(game, p, st, s, radius, tick) {
  let stacked = false;
  for (const e of game.enemies) {
    if (e.dead || e.spawning) continue;
    const zone = e.circleHit(p.x, p.y, radius);
    if (!zone) continue;
    e.hurt(st.dps * (st.mistDmgMul || 1) * p.dmgMul * tick * zone.damageMul, game, false);
    if (s.stackT <= 0) { applyCorrosion(game, e, st, p); stacked = true; }
  }
  if (stacked) s.stackT = st.stackEvery;
}

function advanceBladeRuntime(game, p, st, rt, dt, behavior = 'followAim') {
  let targets;
  if (behavior === 'orbit') {
    rt.spin = (rt.spin ?? p.aim) + dt * (st.orbitSpeed || 1.65);
    targets = [rt.spin, rt.spin + Math.PI];
  } else if (behavior === 'targetLock') {
    const target = game.nearestEnemy(p.x, p.y, st.targetRange || 560);
    const wanted = target ? angleTo(p.x, p.y, target.x, target.y) : p.aim;
    rt.lockAngle = rt.lockAngle ?? p.aim;
    rt.lockAngle += clamp(angDiff(wanted, rt.lockAngle), -(st.targetTurnSpeed || 6.5) * dt, (st.targetTurnSpeed || 6.5) * dt);
    const spread = st.bladeSpread || 0.13;
    targets = [rt.lockAngle - spread, rt.lockAngle + spread];
    rt.lockTarget = target || null;
  } else {
    targets = st.twinBlade ? [p.aim - 0.13, p.aim + 0.13] : [p.aim];
  }
  rt.bladeA = rt.bladeA || targets.slice();
  while (rt.bladeA.length < targets.length) rt.bladeA.push(targets[rt.bladeA.length]);
  for (let i = 0; i < targets.length; i++) {
    const maxTurn = behavior === 'orbit' ? Infinity : 9 * dt;
    rt.bladeA[i] += clamp(angDiff(targets[i], rt.bladeA[i]), -maxTurn, maxTurn);
  }
  rt.bladeAngles = rt.bladeA.slice();
  rt.bladeBehavior = behavior;
  rt.bladePulse = 0.95 + 0.05 * Math.sin(p.t * 13);
}

function updateFlamebladeAttack({ game, weapon:w, dt, owner:p, spec:st, key }) {
  const rt = attackRuntime(w, key);
  rt.stackT = (rt.stackT || 0) - dt; rt.tickT = (rt.tickT || 0) - dt;
  advanceBladeRuntime(game, p, st, rt, dt, 'followAim');
  if (rt.tickT <= 0) {
    rt.tickT = st.tick;
    corrosionBladeDamage(game, p, st, rt, rt.bladeAngles, st.tick);
  }
}

function updateMistAttack({ game, weapon:w, dt, owner:p, spec:st, key }) {
  const rt = attackRuntime(w, key);
  rt.stackT = (rt.stackT || 0) - dt; rt.tickT = (rt.tickT || 0) - dt;
  const radius = st.radius * (st.rangeMul || 1) * (st.mistRadiusMul || 1) * dotRegenScaling(p).rangeMul;
  rt.mistRadius = radius;
  updateCorrosionMotes(p, rt, st, dt, radius);
  if (rt.tickT <= 0) { rt.tickT = st.tick; corrosionMistDamage(game, p, st, rt, radius, st.tick); }
  if (st.mistCollapse) {
    rt.collapseT = (rt.collapseT || 3) - dt;
    if (rt.collapseT <= 0) {
      rt.collapseT = 3;
      game.rings.push(new Ring(p.x, p.y, radius, 18, 0.48, '#5dffd2', 3));
      game.explosion(p.x, p.y, radius * 0.72, 30 * p.dmgMul, '#5dffd2');
    }
  }
}

function updatePlagueAttack({ game, weapon:w, dt, owner:p, spec:st, key, attack }) {
  const rt = attackRuntime(w, key);
  rt.stackT = (rt.stackT || 0) - dt; rt.tickT = (rt.tickT || 0) - dt;
  const behavior = st.bladeBehaviorByParent?.[attack?.parentFormId] || 'orbit';
  advanceBladeRuntime(game, p, st, rt, dt, behavior);
  const radius = st.radius * (st.rangeMul || 1) * dotRegenScaling(p).rangeMul;
  rt.mistRadius = radius;
  updateCorrosionMotes(p, rt, st, dt, radius);
  if (rt.tickT <= 0) {
    rt.tickT = st.tick;
    corrosionBladeDamage(game, p, st, rt, rt.bladeAngles, st.tick);
    corrosionMistDamage(game, p, st, rt, radius, st.tick);
  }
  rt.collapseT = (rt.collapseT || st.collapseInterval) - dt;
  if (rt.collapseT <= 0) {
    rt.collapseT = st.collapseInterval;
    game.rings.push(new Ring(p.x, p.y, radius, 20, 0.62, '#eaffc7', 4));
    game.explosion(p.x, p.y, radius * 0.82, st.collapseDmg * p.dmgMul, '#8dff5d');
  }
}

// ── DoT 完整流派：每段形态拥有独立 AttackRuntime ──
function novaTick(game, w, dt) {
  const p = game.player;
  const attacks = p.attacks && p.attacks.length
    ? p.attacks
    : [{ formId: 'base', mode: (activeWeaponStats(p, w).mode || 'pulse'), fire: activeWeaponStats(p, w) }];
  for (let ai = 0; ai < attacks.length; ai++) {
    const atk = attacks[ai], st = atk.fire, mode = st.mode || 'pulse';
    runAttackHandler(mode, { game, weapon:w, dt, owner:p, spec:st, attack:atk, key:`nova:${atk.formId}:${ai}` });
  }
}

// ── 剑系攻击组：基础斩击保留，进化新增独立攻击 ──
function swordAttackEntries(p, w) {
  return p.attacks && p.attacks.length
    ? p.attacks
    : [{ formId:'base', mode:'sword_slash', fire:activeWeaponStats(p, w), color:w.def.color }];
}

function swordTick(game, w, dt) {
  const p = game.player;
  const attacks = swordAttackEntries(p, w);
  for (let i = 0; i < attacks.length; i++) {
    const attack = attacks[i], mode = attack.mode || attack.fire.mode || 'sword_slash';
    runAttackHandler(mode, { game, weapon:w, dt, owner:p, spec:attack.fire, attack, key:`sword:${attack.formId}:${i}` });
  }
}

function updateSwordSlashAttack({ game, weapon:w, dt, owner:p, spec:st, key }) {
  const s = attackRuntime(w, key);
  s.marks = (s.marks || []).filter(m => (m.life -= dt) > 0);
  if (s.phase === 'windup') {
    s.windupT -= dt;
    if (s.windupT > 0) return;
    s.phase = 'swing'; s.swinging = true; s.anim = 0; s.hits = new Set();
  }
  if (s.swinging) {
    s.anim += dt / st.sweepTime;
    const swept = st.arc * Math.min(1, s.anim);
    for (const e of game.enemies) {
      if (e.dead || e.spawning || s.hits.has(e)) continue;
      const zone = e.circleHit(p.x, p.y, st.radius);
      if (!zone) continue;
      const ang = angleTo(p.x, p.y, zone.x, zone.y);
      const prog = s.dir > 0 ? angDiff(ang, s.start) : angDiff(s.start, ang);
      if (prog >= -0.05 && prog <= swept + 0.05) {
        s.hits.add(e);
        e.hurt(st.damage * p.dmgMul * zone.damageMul, game, true);
        if (!e.def?.boss) { e.x += Math.cos(ang) * 10; e.y += Math.sin(ang) * 10; }
        s.marks.push({ x: zone.x, y: zone.y, angle: ang + Math.PI / 2, life: 0.18, maxLife: 0.18 });
        game.burst(e.x, e.y, w.def.color, 2, 120);
      }
    }
    if (s.anim >= 1) { s.swinging = false; s.phase = 'cooldown'; w.t = st.interval / p.atkSpdMul; }
  } else {
    w.t -= dt;
    if (w.t > 0) return;
    const tgt = game.nearestEnemy(p.x, p.y, st.radius + 40);
    if (!tgt) { w.t = 0.1; return; }
    s.dir = -(s.dir || 1);
    s.start = angleTo(p.x, p.y, tgt.x, tgt.y) - s.dir * st.arc / 2;
    s.phase = 'windup'; s.windupMax = st.windup || 0.14; s.windupT = s.windupMax;
  }
}

// ── 轨迹：等离子尾迹 ─────────────────────
function trailTick(game, w, dt) {
  const p = game.player, st = w.stats;
  w.t -= dt;
  if (w.t > 0) return;
  const moving = Math.hypot(p.vx, p.vy) > 60 || p.dashT > 0;
  if (!moving) return;
  w.t = st.dropInterval;
  game.trails.push(new TrailSeg(p.x, p.y, st.width / 2, st.segLife, st.dps * p.dmgMul, w.def.color));
}

function drawFlamebladeAttack({ ctx, owner:p, weapon:w, spec:st, key, attack }) {
  const rt = attackRuntime(w, key), col = attack?.color || w.def.color;
  const pulse = rt.bladePulse || 1;
  const range = (rt.bladeRange || st.range * (st.rangeMul || 1) * (st.bladeRangeMul || 1)) * pulse;
  const width = rt.bladeWidth || st.width * (st.bladeWidthMul || 1);
  for (let i = 0; i < (rt.bladeAngles || []).length; i++) {
    FX.flameBlade(ctx, p.x, p.y, rt.bladeAngles[i], range, width, col, p.t, i ? 0.72 : 0.9);
  }
}

function updateOrbitBladeAttack({ game, weapon:w, dt, owner:p, spec:st, key }) {
  const rt = attackRuntime(w, key);
  rt.angle = (rt.angle || 0) + dt * st.spinSpeed;
  rt.tickT = (rt.tickT || 0) - dt;
  const points = Array.from({ length:st.blades }, (_, i) => {
    const a = rt.angle + i / st.blades * TAU;
    return { x:p.x + Math.cos(a) * st.radius, y:p.y + Math.sin(a) * st.radius, a };
  });
  rt.points = points;
  if (st.clearBullets) {
    for (const b of game.eBullets || []) {
      if (!b.dead && points.some(q => dist2(q.x, q.y, b.x, b.y) <= (st.bladeRadius + b.r) ** 2)) b.dead = true;
    }
  }
  if (rt.tickT > 0) return;
  rt.tickT = st.tick;
  for (const e of game.enemies) {
    if (e.dead || e.spawning) continue;
    const point = points.find(q => e.circleHit(q.x, q.y, st.bladeRadius));
    if (!point) continue;
    const zone = e.circleHit(point.x, point.y, st.bladeRadius);
    if (zone) e.hurt(st.damage * p.dmgMul * zone.damageMul, game, false);
  }
}

function firePhaseWave(game, w, p, st, angle, index, count, color, key) {
  const side = (index - (count - 1) / 2) * 10;
  const sideA = angle + Math.PI / 2;
  game.pBullets.push(new Bullet(
    p.x + Math.cos(sideA) * side, p.y + Math.sin(sideA) * side,
    Math.cos(angle) * st.bulletSpeed, Math.sin(angle) * st.bulletSpeed,
    st.damage * p.dmgMul, st.bulletR, st.pierce, color,
    { homing:!!st.homing, homingRange:st.range, homingTurn:2.8, kind:'phase', vis:'lance', ownerAttackId:key },
  ));
}

function updatePhaseWaveAttack({ game, weapon:w, dt, owner:p, spec:st, key, attack }) {
  const rt = attackRuntime(w, key);
  rt.t = (rt.t || 0) - dt;
  rt.flashT = Math.max(0, (rt.flashT || 0) - dt);
  if (rt.t > 0) return;
  const target = game.nearestEnemy(p.x, p.y, st.range);
  if (!target) { rt.t = 0.1; return; }
  const angle = angleTo(p.x, p.y, target.x, target.y);
  const count = st.projectiles || 1;
  for (let i = 0; i < count; i++) firePhaseWave(game, w, p, st, angle + (i - (count - 1) / 2) * 0.08, i, count, attack?.color || w.def.color, key);
  rt.t = st.interval / p.atkSpdMul;
  rt.flashT = 0.14;
  p.muzzleFlashT = Math.max(p.muzzleFlashT, 0.07);
}

function updateBladeCrownAttack({ game, weapon:w, dt, owner:p, spec:st, key, attack }) {
  const rt = attackRuntime(w, key);
  rt.t = (rt.t || 0) - dt;
  rt.flashT = Math.max(0, (rt.flashT || 0) - dt);
  if (rt.t > 0) return;
  const base = p.aim;
  for (let i = 0; i < st.projectiles; i++) {
    const angle = base + i / st.projectiles * TAU;
    firePhaseWave(game, w, p, { ...st, homing:true }, angle, i, st.projectiles, attack?.color || w.def.color, key);
  }
  rt.t = st.interval / p.atkSpdMul;
  rt.flashT = 0.28;
  game.rings.push(new Ring(p.x, p.y, 18, 72, 0.32, attack?.color || w.def.color, 3));
}

function drawMistAttack({ ctx, owner:p, weapon:w, spec:st, key, attack }) {
  const rt = attackRuntime(w, key), col = attack?.color || w.def.color;
  const radius = rt.mistRadius || st.radius;
  FX.glowRing(ctx, p.x, p.y, radius, col, 0.13 + Math.sin(p.t * 2.4) * 0.035, 1.4);
  for (const m of (rt.motes || [])) {
    const alpha = clamp(m.life / m.maxLife, 0, 1);
    FX.mistMote(ctx, m.x, m.y, m.r, col, 0.18 + alpha * 0.42, p.t, m.phase);
  }
}

function drawPlagueAttack(ctx) {
  drawFlamebladeAttack(ctx);
  drawMistAttack(ctx);
}

function drawSwordSlashAttack({ ctx, owner:p, weapon:w, spec:st, key, attack }) {
  const s = attackRuntime(w, key), color = attack?.color || w.def.color;
  if (s.phase === 'windup') {
    const k = 1 - s.windupT / s.windupMax;
    const mid = s.start + s.dir * st.arc * 0.5;
    FX.telegraphRing(ctx, p.x, p.y, 26 + k * 6, color, k, p.t, 8);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.moveTo(p.x + Math.cos(mid) * 24, p.y + Math.sin(mid) * 24);
    ctx.lineTo(p.x + Math.cos(mid) * st.radius, p.y + Math.sin(mid) * st.radius);
    ctx.strokeStyle = hexA(color, 0.18 + k * 0.5); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  if (s.swinging) {
    const swept = st.arc * Math.min(1, s.anim);
    const cur = s.dir > 0 ? s.start + swept : s.start - swept;
    const alpha = Math.max(0.18, 1 - Math.abs(s.anim - 0.55) * 0.9);
    FX.arcBlade(ctx, p.x, p.y, st.radius, s.start, cur, color, alpha, 7, s.dir < 0);
    if (st.echo) FX.arcBlade(ctx, p.x, p.y, st.radius - 9, s.start, cur, '#ff8de8', alpha * 0.42, 4, s.dir < 0);
  }
  for (const m of (s.marks || [])) FX.slashMark(ctx, m.x, m.y, m.angle, color, m.life / m.maxLife, 20);
}

function drawOrbitBladeAttack({ ctx, owner:p, weapon:w, spec:st, key, attack }) {
  const rt = attackRuntime(w, key), color = attack?.color || w.def.color;
  FX.glowRing(ctx, p.x, p.y, st.radius, color, 0.12, 1.2);
  for (const q of (rt.points || [])) {
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -st.bladeRadius); ctx.lineTo(st.bladeRadius * 0.55, 5); ctx.lineTo(0, st.bladeRadius * 0.5); ctx.lineTo(-st.bladeRadius * 0.55, 5); ctx.closePath();
    ctx.fillStyle = hexA(color, 0.5); ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
    FX.glowCircle(ctx, q.x, q.y, st.bladeRadius * 1.4, color, 0.45);
  }
}

function drawPhaseWaveAttack({ ctx, owner:p, weapon:w, spec:st, key, attack }) {
  const rt = attackRuntime(w, key);
  if (rt.flashT > 0) FX.glowRing(ctx, p.x, p.y, 28 + (0.14 - rt.flashT) * 120, attack?.color || w.def.color, rt.flashT / 0.14, 2);
}

function drawBladeCrownAttack({ ctx, owner:p, weapon:w, key, attack }) {
  const rt = attackRuntime(w, key);
  if (rt.flashT > 0) {
    const k = rt.flashT / 0.28;
    FX.glowRing(ctx, p.x, p.y, 42 + (1 - k) * 48, attack?.color || w.def.color, k, 5);
  }
}

// ===== 武器特效绘制（攻击 handler 负责自己的视觉）=====
function drawWeaponFx(game, ctx, w) {
  const p = game.player;
  const attacks = p.attacks && p.attacks.length ? p.attacks : [{ formId: 'base', fire: activeWeaponStats(p, w) }];
  // 腐蚀流派：每段攻击各自的焰刃（带脉动）与雾域
  if (w.def.type === 'nova') {
    for (let ai = 0; ai < attacks.length; ai++) {
      const atk = attacks[ai], st = atk.fire, mode = st.mode || 'pulse';
      drawAttackHandler(mode, { game, ctx, weapon:w, owner:p, spec:st, attack:atk, key:`nova:${atk.formId}:${ai}` });
    }
  }
  if (w.def.type === 'sword') {
    for (let i = 0; i < attacks.length; i++) {
      const attack = attacks[i], mode = attack.mode || attack.fire.mode || 'sword_slash';
      drawAttackHandler(mode, { game, ctx, weapon:w, owner:p, spec:attack.fire, attack, key:`sword:${attack.formId}:${i}` });
    }
  }
}

const attackDamageMul = p => p?.dmgMul ?? 1;
const attackSpeedMul = p => p?.atkSpdMul ?? 1;
const fullCorrosionDps = (st, p) =>
  (st.stackDps || 0) * (st.dotMul || 1) * (st.maxStacks || 0) *
  dotRegenScaling(p || {}).poisonMul * attackDamageMul(p);

registerAttackHandler('gun', {
  required: ['damage', 'interval', 'projectiles', 'bulletSpeed', 'bulletR'],
  update: ({ game, weapon, dt }) => gunTick(game, weapon, dt),
  estimateDps: (st, p) => st.damage * st.projectiles / st.interval * attackDamageMul(p) * attackSpeedMul(p),
});
registerAttackHandler('laser', {
  required: ['dps', 'width', 'range'],
  update: ({ game, weapon, dt }) => laserTick(game, weapon, dt),
  estimateDps: (st, p) => st.dps * (st.beams || 1) * attackDamageMul(p),
});
registerAttackHandler('ram', {
  required: ['damage', 'interval', 'dashSpeed', 'dashTime'],
  update: ({ game, weapon, dt }) => ramTick(game, weapon, dt),
  estimateDps: (st, p) => st.damage / st.interval * attackDamageMul(p) * attackSpeedMul(p),
});
registerAttackHandler('nova', {
  required: ['pulseDmg', 'radius', 'interval', 'stacks', 'stackDps', 'maxStacks', 'stackDuration'],
  update: ({ game, weapon, dt }) => novaTick(game, weapon, dt),
  estimateDps: (st, p) => st.pulseDmg / st.interval * attackDamageMul(p) * attackSpeedMul(p) + fullCorrosionDps(st, p),
});
registerAttackHandler('pulse', {
  required: ['pulseDmg', 'radius', 'interval', 'stacks', 'stackDps', 'maxStacks', 'stackDuration'],
  update: ({ game, weapon, dt, owner, spec, key }) => novaPulseTick(game, weapon, dt, owner, spec, attackRuntime(weapon, key)),
  draw: ({ ctx, owner:p, weapon:w, spec:st, key }) => {
    const rt = attackRuntime(w, key);
    if (rt.phase !== 'windup') return;
    const k = 1 - rt.windupT / rt.windupMax;
    const radius = st.radius * (st.rangeMul || 1);
    FX.telegraphRing(ctx, p.x, p.y, radius * (0.38 + k * 0.1), w.def.color, k, p.t, 14);
    FX.glowCircle(ctx, p.x, p.y, 12 + k * 10, '#dfffb7', 0.2 + k * 0.42);
  },
  estimateDps: (st, p) => st.pulseDmg / st.interval * attackDamageMul(p) * attackSpeedMul(p) + fullCorrosionDps(st, p),
});
registerAttackHandler('spore', {
  required: ['damage', 'range', 'interval', 'bulletSpeed', 'bulletR', 'stacks', 'stackDps', 'maxStacks', 'stackDuration', 'cloudRadius', 'cloudDuration', 'cloudDps', 'cloudMaxAlive', 'life'],
  validate(st, path) {
    if (st.origin?.type !== 'bodyScatter') throw new Error(`${path}: spore 必须使用 bodyScatter origin`);
    if (st.targeting?.type !== 'proximityArm' || !Number.isFinite(st.targeting.acquireRadius)) {
      throw new Error(`${path}: spore 必须配置 proximityArm.acquireRadius`);
    }
    if (!Number.isFinite(st.capacity?.maxAlive) || st.capacity.maxAlive < 1) throw new Error(`${path}: spore 必须配置 capacity.maxAlive`);
  },
  update: ({ game, weapon, dt, owner, spec, key }) => corrosionSporeTick(game, weapon, dt, owner, spec, key),
  estimateDps: (st, p) => (st.damage + st.cloudDps * st.cloudDuration) / st.interval * attackDamageMul(p) * attackSpeedMul(p) + fullCorrosionDps(st, p),
});
registerAttackHandler('flameblade', {
  required: ['dps', 'range', 'width', 'tick', 'stackEvery', 'stackDps', 'maxStacks', 'stackDuration'],
  update: updateFlamebladeAttack,
  draw: drawFlamebladeAttack,
  estimateDps: (st, p) => st.dps * (st.twinBlade ? 2 : 1) * (st.bladeDmgMul || 1) * attackDamageMul(p) + fullCorrosionDps(st, p),
});
registerAttackHandler('mist', {
  required: ['dps', 'radius', 'tick', 'emitInterval', 'moteLife', 'maxMotes', 'stackEvery', 'stackDps', 'maxStacks', 'stackDuration'],
  update: updateMistAttack,
  draw: drawMistAttack,
  estimateDps: (st, p) => st.dps * (st.mistDmgMul || 1) * attackDamageMul(p) + fullCorrosionDps(st, p) + (st.mistCollapse ? 10 * attackDamageMul(p) : 0),
});
registerAttackHandler('plague', {
  required: ['dps', 'range', 'width', 'radius', 'tick', 'emitInterval', 'moteLife', 'maxMotes', 'stackEvery', 'stackDps', 'maxStacks', 'stackDuration', 'collapseInterval', 'collapseDmg'],
  validate(st, path) {
    const modes = Object.values(st.bladeBehaviorByParent || {});
    if (!modes.includes('orbit') || !modes.includes('targetLock')) throw new Error(`${path}: plague 必须声明 orbit 与 targetLock 两种分支行为`);
  },
  update: updatePlagueAttack,
  draw: drawPlagueAttack,
  estimateDps: (st, p) => st.dps * ((st.bladeDmgMul || 1) * 2 + (st.mistDmgMul || 1)) * attackDamageMul(p) + fullCorrosionDps(st, p) + st.collapseDmg / st.collapseInterval * attackDamageMul(p),
});
registerAttackHandler('sword', {
  required: [],
  update: ({ game, weapon, dt }) => swordTick(game, weapon, dt),
  estimateDps: () => 0,
});
registerAttackHandler('sword_slash', {
  required: ['damage', 'interval', 'arc', 'radius', 'sweepTime'],
  update: updateSwordSlashAttack,
  draw: drawSwordSlashAttack,
  estimateDps: (st, p) => st.damage / st.interval * attackDamageMul(p) * attackSpeedMul(p),
});
registerAttackHandler('orbit_blade', {
  required: ['damage', 'tick', 'radius', 'bladeRadius', 'blades', 'spinSpeed'],
  update: updateOrbitBladeAttack,
  draw: drawOrbitBladeAttack,
  estimateDps: (st, p) => st.damage * st.blades / st.tick * attackDamageMul(p),
});
registerAttackHandler('phase_wave', {
  required: ['damage', 'interval', 'bulletSpeed', 'bulletR', 'pierce', 'range'],
  update: updatePhaseWaveAttack,
  draw: drawPhaseWaveAttack,
  estimateDps: (st, p) => st.damage * (st.projectiles || 1) / st.interval * attackDamageMul(p) * attackSpeedMul(p),
});
registerAttackHandler('blade_crown', {
  required: ['damage', 'interval', 'bulletSpeed', 'bulletR', 'projectiles', 'pierce', 'range'],
  update: updateBladeCrownAttack,
  draw: drawBladeCrownAttack,
  estimateDps: (st, p) => st.damage * st.projectiles / st.interval * attackDamageMul(p) * attackSpeedMul(p),
});
registerAttackHandler('trail', {
  required: ['dps', 'segLife', 'width', 'dropInterval'],
  update: ({ game, weapon, dt }) => trailTick(game, weapon, dt),
  estimateDps: (st, p) => st.dps * attackDamageMul(p),
});
