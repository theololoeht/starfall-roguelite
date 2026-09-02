// ===== 出怪框架 v2：配置描述阵型，Director 统一校验、排队与容量边界 =====

const SPAWN_SOURCE_POLICIES = {
  natural:   { priority:1, maxQueued:12, budgeted:true },
  mass:      { priority:2, maxQueued:36, budgeted:true },
  formation: { priority:2, maxQueued:32, budgeted:true },
  scripted:  { priority:3, maxQueued:48, budgeted:false },
};

function makeSpawnRequest(type, angle, perp = 0, delay = SPAWN_TELEGRAPH, meta = {}) {
  const source = meta.source || 'natural', policy = SPAWN_SOURCE_POLICIES[source];
  if (!ENEMY_DEFS[type]) throw new Error(`未知敌机类型: ${type}`);
  if (!policy) throw new Error(`未知出怪来源: ${source}`);
  if (![angle, perp, delay].every(Number.isFinite) || delay < 0) throw new Error(`非法出怪请求: ${type}`);
  return {
    type, angle, perp, t:delay, t0:Math.max(delay, 0.001), source,
    groupId:meta.groupId || `${source}:single`, priority:policy.priority,
    retries:0, maxRetries:meta.maxRetries ?? 8, done:false,
  };
}

function pendingSpawnCount(game, type = null, source = null) {
  return game.spawnQueue.reduce((count, req) => count + (!req.done && (!type || req.type === type) && (!source || req.source === source) ? 1 : 0), 0);
}

function canQueueSpawn(game, request) {
  const policy = SPAWN_SOURCE_POLICIES[request.source];
  if (pendingSpawnCount(game, null, request.source) >= policy.maxQueued) return false;
  if (game.enemies.length + pendingSpawnCount(game) >= ENEMY_HARD_CAP) return false;
  const rule = enemySpawnRule(request.type);
  if (rule) {
    const alive = game.enemies.filter(e => e.type === request.type && !e.dead).length;
    if (alive + pendingSpawnCount(game, request.type) >= rule.maxAlive) return false;
  }
  return true;
}

function chooseFormation(eligibleIds, recentIds = []) {
  const recent = new Set(recentIds.slice(-2));
  const fresh = eligibleIds.filter(id => !recent.has(id));
  const pool = fresh.length ? fresh : eligibleIds;
  const total = pool.reduce((sum, id) => sum + (FORMATIONS[id].weight || 1), 0);
  let roll = Math.random() * total;
  for (const id of pool) {
    roll -= FORMATIONS[id].weight || 1;
    if (roll <= 0) return id;
  }
  return pool[pool.length - 1];
}

function validateSpawnDefinitions() {
  for (const [id, formation] of Object.entries(FORMATIONS)) {
    if (formation.id !== id || !formation.role || !formation.category || typeof formation.build !== 'function') {
      throw new Error(`FORMATION.${id}: 缺少 id/role/category/build`);
    }
    const units = formation.build();
    if (!units.length) throw new Error(`FORMATION.${id}: 空阵型`);
    for (const unit of units) makeSpawnRequest(unit.type, unit.angle, unit.perp || 0, unit.delay || 0, { source:'formation', groupId:id });
  }
  for (const scheme of MASS_SPAWNS) {
    if (!scheme.id || !scheme.role || !scheme.pattern || !Number.isFinite(scheme.count)) throw new Error(`MASS_SPAWNS: 非法方案`);
    if (scheme.type !== 'mixed' && !ENEMY_DEFS[scheme.type]) throw new Error(`MASS_SPAWNS.${scheme.id}: 未知敌机 ${scheme.type}`);
  }
  return true;
}
