// Game 子系统：通过 prototype composition 接入，保持原生脚本零构建运行。
class GameEncounterSystem {
  updateBossSchedule() {
    if (this.enemies.some(enemy => enemy.def?.boss && !enemy.dead)) return;
    if (this.time < (this.bossCooldownUntil || 0)) return;
    for (const event of BOSS_SCHEDULE) {
      const key = `${event.type}@${event.at}`;
      if (this.time < event.at || this.triggeredBosses.has(key)) continue;
      const normalAlive = this.enemies.filter(enemy => !enemy.dead && !enemy.def?.boss).length;
      if (normalAlive > BALANCE.pacing.bossEntryEnemyCap) continue;
      this.triggeredBosses.add(key);
      this.spawnQueue.length = 0;
      const boss = event.type === 'prism'
        ? new PrismBoss(this.W / 2, -70, this.hpScale())
        : event.type === 'dragon'
          ? new DragonBoss(-90, this.H * 0.28, this.hpScale())
          : null;
      if (!boss) throw new Error(`Boss 缺少实体工厂: ${event.type}`);
      const tuning = BALANCE.combat.bossTuning?.[event.type];
      if (tuning) {
        const baseHp = boss.maxHp;
        const outputHp = Math.max(1, this.player.dpsEstimate || 1) * tuning.targetSeconds * tuning.dpsShare;
        boss.maxHp = clamp(outputHp, baseHp * tuning.minMul, baseHp * tuning.maxMul);
      }
      boss.hp = boss.maxHp;
      this.enemies.push(boss);
      if (typeof RunMonitor !== 'undefined') RunMonitor.event('boss_spawned', { boss:event.type }, this);
      this.announce = { text: event.announce, t: 3.2 };
      // Boss 自身出生无敌负责入场预警；保持 PLAYING，避免整帧世界冻结造成“卡一下”。
    }
  }

  updateBossIntro(dt) {
    this.bossIntroT -= dt;
    this.bgScroll += dt * 7;
    if (this.announce) { this.announce.t -= dt; if (this.announce.t <= 0) this.announce = null; }
    if (this.bossIntroT <= 0) transitionRunState(this, RUN_STATES.PLAYING, 'boss-intro-complete');
  }

  // ── 击杀：特效 + 掉落 + 特殊死亡行为 ──
  onEnemyKilled(e) {
    this.kills++;
    this.score += Math.round(e.def.score * BALANCE.combat.scoreMul);
    this.flashes.push(new Flash(e.x, e.y, e.r * 3, 0.3, e.def.color));
    this.rings.push(new Ring(e.x, e.y, e.r, e.r * 3.2, 0.4, e.def.color, 3));
    this.burst(e.x, e.y, e.def.color, 8 + Math.floor(e.r / 3), e.r * 7);
    this.shake(e.r / 8);
    if (typeof RunMonitor !== 'undefined') {
      const offscreen = e.x < 0 || e.x > this.W || e.y < 0 || e.y > this.H;
      RunMonitor.event('enemy_defeated', { enemy:e.type, boss:!!e.def?.boss, offscreen }, this);
      if (e.def?.boss) RunMonitor.bossDefeated(this, e);
    }
    const bossEvent = e.def?.boss ? BOSS_SCHEDULE.find(event => event.type === e.type) : null;
    if (bossEvent?.final) {
      transitionRunState(this, RUN_STATES.VICTORY, `boss-defeated:${e.type}`);
      UI.showVictory({ time:this.time, wave:this.wave, level:this.level, kills:this.kills, score:this.score });
    } else if (e.def?.boss) {
      this.bossCooldownUntil = this.time + BALANCE.pacing.bossRecovery;
      this.announce = { text:`✓ ${e.def.name} 已摧毁 · ${BALANCE.pacing.bossRecovery}秒整备`, t:3.2 };
    }
    // 自爆虫：死亡时殉爆（对玩家造成范围伤害）
    if (e.def.bomb) this.explosionHostile(e.x, e.y, e.def.bomb.r, scaledEnemyDamage(e.def.bomb.dmg), e.def.color);
    // 蜂巢母体：死亡释放一批蜂群（受硬上限约束）
    if (e.def.hiveDeath) {
      for (let i = 0; i < e.def.hiveDeath && this.enemies.length < ENEMY_HARD_CAP; i++) {
        const a = rand(0, TAU);
        this.enemies.push(new Enemy('mite', e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, this.hpScale(), 0.2));
      }
    }
    // 陨石：死亡分裂成两块小陨石（受硬上限约束）
    if (e.def.splitRock) {
      for (let i = 0; i < e.def.splitRock && this.enemies.length < ENEMY_HARD_CAP; i++) {
        const a = rand(0, TAU);
        this.enemies.push(new Enemy('rock_s', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, this.hpScale(), 0.2));
      }
    }
    // 堡垒：死亡环形弹幕
    if (e.def.deathBurst) {
      const db = e.def.deathBurst;
      for (let i = 0; i < db.n; i++) {
        const a = i / db.n * TAU + rand(-0.1, 0.1);
        this.eBullets.push(new EnemyBullet(e.x, e.y, Math.cos(a) * db.speed, Math.sin(a) * db.speed, scaledEnemyDamage(db.dmg), e.def.color));
      }
    }
    const n = e.def.xp > 2 ? 2 : 1;
    const dropX = clamp(e.x, 18, this.W - 18);
    const dropY = clamp(e.y, 18, this.H - 18);
    for (let i = 0; i < n; i++) this.gems.push(new Gem(dropX + rand(-8, 8), dropY + rand(-8, 8), Math.ceil(e.def.xp / n)));
  }
}
