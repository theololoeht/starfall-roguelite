// ===== 攻击框架 v2：统一契约、策略注册、运行状态与强度估算 =====
// 特殊攻击保留独立 handler；公共层只负责生命周期、来源策略、校验和指标。

const ATTACK_HANDLERS = Object.create(null);

const ATTACK_ORIGINS = {
  muzzle(ctx, spec = {}) {
    if (typeof ctx.muzzle !== 'function') throw new Error('muzzle origin 缺少硬点解析器');
    return ctx.muzzle(spec.index || 0, spec.count || 1);
  },
  bodyScatter(ctx, spec = {}) {
    const minR = spec.minRadius ?? 8, maxR = spec.maxRadius ?? 26;
    const a = rand(0, TAU), r = rand(minR, maxR);
    return { x: ctx.owner.x + Math.cos(a) * r, y: ctx.owner.y + Math.sin(a) * r, angle: a };
  },
  center(ctx) { return { x: ctx.owner.x, y: ctx.owner.y, angle: ctx.owner.aim }; },
};

const ATTACK_TARGETING = {
  nearest(ctx, spec = {}) {
    return ctx.game.nearestEnemy(ctx.owner.x, ctx.owner.y, spec.range ?? Infinity);
  },
  none() { return null; },
};

function registerAttackHandler(kind, handler) {
  if (!kind || !handler || typeof handler.update !== 'function') throw new Error(`无效攻击 handler: ${kind}`);
  if (ATTACK_HANDLERS[kind]) throw new Error(`重复攻击 handler: ${kind}`);
  ATTACK_HANDLERS[kind] = handler;
}

function canonicalAttackKind(type) {
  return type;
}

function inferAttackKind(treeId, fire, fallback = null) {
  if (fire?.mode) return fire.mode;
  if (treeId === 'cannon') return 'gun';
  return canonicalAttackKind(treeId || fallback || 'gun');
}

function attackRuntime(weapon, key) {
  weapon.attackStates = weapon.attackStates || Object.create(null);
  return weapon.attackStates[key] || (weapon.attackStates[key] = Object.create(null));
}

function validateEvolutionPath(tree, path) {
  if (!tree || !Array.isArray(path) || !path.length || path[0] !== 'base') return false;
  for (let i = 0; i < path.length; i++) {
    const form = tree.forms[path[i]];
    if (!form) return false;
    if (i > 0 && !(tree.forms[path[i - 1]].evolutions || []).some(e => e.id === path[i])) return false;
  }
  return new Set(path).size === path.length;
}

function runAttackHandler(kind, ctx) {
  const handler = ATTACK_HANDLERS[kind];
  if (!handler) throw new Error(`未注册攻击类型: ${kind}`);
  return handler.update(ctx);
}

function drawAttackHandler(kind, ctx) {
  const handler = ATTACK_HANDLERS[kind];
  if (handler?.draw) return handler.draw(ctx);
}

function resolveAttackOrigin(origin, ctx) {
  const spec = origin || { type: 'muzzle' };
  const fn = ATTACK_ORIGINS[spec.type];
  if (!fn) throw new Error(`未知攻击生成方式: ${spec.type}`);
  return fn(ctx, spec);
}

function resolveAttackTarget(targeting, ctx) {
  const spec = targeting || { type: 'nearest' };
  const fn = ATTACK_TARGETING[spec.type];
  if (!fn) throw new Error(`未知索敌方式: ${spec.type}`);
  return fn(ctx, spec);
}

function validateAttackSpec(kind, spec, path = kind) {
  const handler = ATTACK_HANDLERS[kind];
  if (!handler) throw new Error(`${path}: 未注册攻击类型 ${kind}`);
  for (const field of (handler.required || [])) {
    if (!Number.isFinite(spec[field])) throw new Error(`${path}: ${kind} 缺少数值字段 ${field}`);
  }
  if (spec.origin && !ATTACK_ORIGINS[spec.origin.type]) throw new Error(`${path}: 未知 origin ${spec.origin.type}`);
  if (spec.targeting && !ATTACK_TARGETING[spec.targeting.type] && spec.targeting.type !== 'proximityArm') {
    throw new Error(`${path}: 未知 targeting ${spec.targeting.type}`);
  }
  if (handler.validate) handler.validate(spec, path);
  return true;
}

function estimateAttackDps(kind, spec, player) {
  const handler = ATTACK_HANDLERS[kind];
  if (!handler?.estimateDps) return 0;
  const value = handler.estimateDps(spec, player);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function estimateAttackSharedDotDps(kind, spec, player) {
  const handler = ATTACK_HANDLERS[kind];
  if (!handler?.estimateSharedDotDps) return 0;
  const value = handler.estimateSharedDotDps(spec, player);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function estimatePlayerAttackDps(player, weapon = player?.mainWeapon) {
  if (!player || !weapon) return 0;
  const attacks = player.attacks?.length
    ? player.attacks
    : [{ formId: 'base', mode: canonicalAttackKind(weapon.def.type), fire: weapon.stats }];
  let directDps = 0;
  let sharedDotDps = 0;
  for (const attack of attacks) {
    const kind = inferAttackKind(player.treeId, attack.fire, attack.mode || weapon.def.type);
    directDps += estimateAttackDps(kind, attack.fire, player);
    // 腐蚀层挂在敌人身上并由所有攻击共享，只取最高层伤，不能按攻击段重复相加。
    sharedDotDps = Math.max(sharedDotDps, estimateAttackSharedDotDps(kind, attack.fire, player));
  }
  return directDps + sharedDotDps;
}

function refreshPlayerAttackMetrics(player) {
  player.dpsEstimate = estimatePlayerAttackDps(player, player.mainWeapon);
  return player.dpsEstimate;
}

function validateAllAttackDefinitions() {
  for (const [treeId, tree] of Object.entries(SKILL_TREES)) {
    for (const [formId, form] of Object.entries(tree.forms)) {
      validateAttackSpec(inferAttackKind(treeId, form.fire), form.fire, `SKILL_TREES.${treeId}.${formId}`);
    }
  }
  for (const [id, def] of Object.entries(WEAPON_DEFS)) {
    if (SKILL_TREES[id]) continue; // 技能树是这些武器的唯一权威运行配置。
    for (const level of [1, def.maxLevel]) {
      const spec = def.levelStats(level);
      validateAttackSpec(canonicalAttackKind(def.type), spec, `WEAPON_DEFS.${id}.Lv${level}`);
    }
  }
  return true;
}

function validatePlayableWeaponDefinitions() {
  if (!Array.isArray(PLAYABLE_WEAPON_IDS) || PLAYABLE_WEAPON_IDS.length === 0) {
    throw new Error('PLAYABLE_WEAPON_IDS: 正式武器列表不能为空');
  }
  if (new Set(PLAYABLE_WEAPON_IDS).size !== PLAYABLE_WEAPON_IDS.length) {
    throw new Error('PLAYABLE_WEAPON_IDS: 存在重复武器 id');
  }

  for (const id of PLAYABLE_WEAPON_IDS) {
    const def = WEAPON_DEFS[id];
    const tree = SKILL_TREES[id];
    if (!def) throw new Error(`PLAYABLE_WEAPON_IDS.${id}: 缺少 WEAPON_DEFS`);
    if (!tree) throw new Error(`PLAYABLE_WEAPON_IDS.${id}: 缺少 SKILL_TREES`);
    if (!tree.forms?.base) throw new Error(`SKILL_TREES.${id}: 缺少 base 形态`);

    for (const [formId, form] of Object.entries(tree.forms)) {
      const kind = inferAttackKind(id, form.fire, def.type);
      if (!ATTACK_HANDLERS[kind]) {
        throw new Error(`SKILL_TREES.${id}.${formId}: 未注册攻击类型 ${kind}`);
      }
      for (const evolution of (form.evolutions || [])) {
        if (!tree.forms[evolution.id]) {
          throw new Error(`SKILL_TREES.${id}.${formId}: 进化目标 ${evolution.id} 不存在`);
        }
      }
    }
  }
  return true;
}
