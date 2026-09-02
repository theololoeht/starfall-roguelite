// Game 子系统：通过 prototype composition 接入，保持原生脚本零构建运行。
class GameSpawningSystem {
  // ── 出怪：土豆式八方包围（边缘预警标记 → 到期入场）──
  queueSpawn(type, angle, perp, delay, meta = {}) {
    const request = makeSpawnRequest(type, angle, perp || 0, delay, meta);
    if (!canQueueSpawn(this, request)) return false;
    this.spawnQueue.push(request);
    return true;
  }

  spawnFromAngle(type, angle, perp) {
    if (this.enemies.length >= ENEMY_HARD_CAP) return false;   // 场上敌机硬上限，防止堆积卡死
    const rule = enemySpawnRule(type);
    if (rule && this.enemies.filter(x => x.type === type && !x.dead).length >= rule.maxAlive) return false;
    const p = this.player;
    const pos = edgeSpawnPos(p.x, p.y, angle);
    const e = new Enemy(type, pos.x - Math.sin(angle) * perp, pos.y + Math.cos(angle) * perp, this.hpScale(), 0.15);
    this.waveSpentHp += e.maxHp;
    this.enemies.push(e);
    return true;
  }

  // ── 刷怪节奏：每波 30s，前 20s 持续出怪，后 10s 休整（对齐 Nova Drift 波次呼吸）──
  updateSpawns(dt) {
    // 预警倒计时 → 到期入场
    for (const s of this.spawnQueue) {
      s.t -= dt;
      if (s.t <= 0) {
        if (this.spawnFromAngle(s.type, s.angle, s.perp)) s.done = true;
        else if (++s.retries > s.maxRetries) s.done = true;
        else s.t = 0.15;
      }
    }
    this.spawnQueue = this.spawnQueue.filter(s => !s.done);

    // Boss 遭遇只处理 Boss 主动排入的召唤请求，暂停自然刷怪与波次预算消费。
    if (this.enemies.some(e => e.def?.boss && !e.dead)) return;

    const waveT = this.time % WAVE_LEN;
    const fieldEmpty = this.enemies.length === 0 && this.spawnQueue.length === 0;
    // 出怪预算：按玩家理论输出上限（DPS 估算）折算每波敌人总血量
    if (this.wave !== this.lastBudgetWave) {
      this.lastBudgetWave = this.wave;
      this.waveBudgetHp = Math.max(1, (this.player.dpsEstimate || 1) * SPAWN_WINDOW * BALANCE.pacing.pressure);
      this.waveSpentHp = 0;
      // 波首大批量方案：随机执行一种，数量按剩余预算缩放
      if (this.time >= BALANCE.pacing.firstMassAt && this.wave > 1) this.runMassSpawn();
    }
    if (waveT >= SPAWN_WINDOW && !fieldEmpty) return;   // 波末休整
    if (this.waveSpentHp >= this.waveBudgetHp && !fieldEmpty) return;   // 预算用尽
    this.spawnT -= dt * (fieldEmpty ? BALANCE.pacing.emptyFieldAcceleration : 1);
    if (this.spawnT > 0) return;
    this.spawnT = Math.max(BALANCE.pacing.spawnMin, BALANCE.pacing.spawnBase - this.time * BALANCE.pacing.spawnAcceleration);
    if (this.enemies.length >= ENEMY_SOFT_CAP) return;
    const eligible = ENEMY_SPAWN_ROSTER.filter(r => this.time >= r.unlockAt &&
      this.enemies.filter(x => x.type === r.type && !x.dead).length < r.maxAlive);
    if (!eligible.length) return;
    // 按权重抽怪
    const totalW = eligible.reduce((a, r) => a + r.weight, 0);
    let roll = Math.random() * totalW, type = eligible[0].type;
    for (const r of eligible) { roll -= r.weight; if (roll <= 0) { type = r.type; break; } }
    const ramp = clamp(this.time / BALANCE.pacing.groupRampSeconds, 0, 1);
    const groupBase = BALANCE.pacing.groupBase || 1;
    const groupMax = Math.max(groupBase, BALANCE.pacing.groupMax || groupBase + 1);
    const n = clamp(groupBase + Math.floor(ramp * (groupMax - groupBase + 1)), groupBase, groupMax);
    const groupId = `natural:${this.wave}:${this.spawnGroupSeq++}`;
    for (let i = 0; i < n; i++) this.queueSpawn(type, pick8Angle(), 0, SPAWN_TELEGRAPH, { source:'natural', groupId });
  }

  // ── 大批量生成方案（不同形式的成群入场，数量随预算缩放）──
  runMassSpawn() {
    const p = this.player;
    const eligible = MASS_SPAWNS.filter(m => this.time >= m.unlockAt * BALANCE.pacing.unlockScale);
    if (!eligible.length) return;
    const scheme = pick(eligible);
    const a0 = pick8Angle();
    const groupId = `mass:${scheme.id}:${this.wave}:${this.spawnGroupSeq++}`;
    const mul = this.hpScale();
    const mix = ['mite', 'mite', 'gunner', 'mite', 'burst', 'mite', 'mite', 'bomber', 'mite', 'gunner', 'mite', 'burst'];
    const referenceTypes = scheme.pattern === 'wedge' ? mix : [scheme.type];
    const unitHp = referenceTypes.reduce((sum, type) => sum + ENEMY_DEFS[type].hp, 0) / referenceTypes.length * mul;
    // 数量缩放：目标占用本波预算的 massShare，限制在 4~30
    const raw = (this.waveBudgetHp * BALANCE.pacing.massShare) / Math.max(1, unitHp);
    const count = clamp(Math.round(scheme.count * clamp(raw / scheme.count, 0.35, 1.3)), 4, 30);
    const place = (type, angle, perp, delay) => {
      if (!isEnemyUnlocked(type, this.time)) return;
      this.queueSpawn(type, angle, perp, SPAWN_TELEGRAPH + (delay || 0), { source:'mass', groupId });
    };
    switch (scheme.pattern) {
      case 'arc':     // 宽弧横排
        for (let i = 0; i < count; i++) place(scheme.type, a0 + (i - (count - 1) / 2) * 0.16, 0, Math.abs(i - (count - 1) / 2) * 0.1);
        break;
      case 'belt':    // 斜向陨石带
        for (let i = 0; i < count; i++) place(scheme.type, a0 + (i % 2 ? 0.25 : -0.25), (i - count / 2) * 46, i * 0.12);
        break;
      case 'spiral':  // 双螺旋
        for (let i = 0; i < count; i++) place(scheme.type, a0 + i * 0.4 + (i % 2) * Math.PI, 0, i * 0.06);
        break;
      case 'vee':     // V 形楔
        for (let i = 0; i < count; i++) {
          const off = i - Math.floor(count / 2);
          place(scheme.type, a0, off * 40, Math.abs(off) * 0.1);
        }
        break;
      case 'wall':    // 纵列横墙
        for (let i = 0; i < count; i++) place(scheme.type, a0, (i - (count - 1) / 2) * 64, i * 0.1);
        break;
      case 'wedge': { // 混编楔形（前排杂兵 + 两翼精锐）
        for (let i = 0; i < count; i++) {
          const row = Math.floor(i / 4), colI = i % 4;
          place(mix[i % mix.length], a0 - row * 0.22, (colI - 1.5) * 52, row * 0.18);
        }
        break;
      }
    }
  }

  // ── 周期性规律编队（八方阵型，靠阵形本身可读，不显示名称）──
  updateFormations(dt) {
    if (this.enemies.some(e => e.def.boss && !e.dead)) return;
    if (this.time % WAVE_LEN >= SPAWN_WINDOW) return;
    if (this.waveSpentHp >= this.waveBudgetHp || pendingSpawnCount(this, null, 'formation') > 0) return;
    this.formT -= dt;
    if (this.formT > 0) return;
    this.formT = FORMATION_INTERVAL;
    const eligible = Object.keys(FORMATIONS).filter(k => this.time >= formationUnlockAt(FORMATIONS[k]));
    const kind = chooseFormation(eligible, this.formationHistory);
    this.formationHistory.push(kind);
    if (this.formationHistory.length > 4) this.formationHistory.shift();
    const f = FORMATIONS[kind];
    const groupId = `formation:${kind}:${this.wave}:${this.spawnGroupSeq++}`;
    for (const u of f.build()) if (isEnemyUnlocked(u.type, this.time)) {
      this.queueSpawn(u.type, u.angle, u.perp, SPAWN_TELEGRAPH + (u.delay || 0), { source:'formation', groupId });
    }
  }
}
