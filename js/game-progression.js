// Game 子系统：通过 prototype composition 接入，保持原生脚本零构建运行。
class GameProgressionSystem {
  // ── 双轨成长：每级 = 数值三选一（自选）+ 1 蜂巢技能点（特效树，T 打开）──
  gainXP(v) {
    this.xp += v * BALANCE.combat.xpMul;
    let need = xpNeed(this.level);
    while (this.xp >= need) {
      this.xp -= need; this.level++;
      this.statPending++; this.player.skills.points++;
      need = xpNeed(this.level);
    }
    // 弹出时进入 levelup 暂停态，避免游戏继续跑、卡片反复刷新
    if (this.statPending > 0 && this.state === 'playing') this.openChoice();
  }

  openChoice() {
    transitionRunState(this, RUN_STATES.LEVELUP, 'stat-choice');
    UI.showStatChoice(this.buildStatCards(), c => this.pickStat(c));
  }

  buildStatCards() {
    return shuffle([...STAT_CHOICES]).slice(0, 3);
  }

  pickStat(c) {
    c.apply(this.player);
    if (typeof RunMonitor !== 'undefined') RunMonitor.event('stat_selected', { choice:c.id }, this);
    refreshPlayerAttackMetrics(this.player);
    this.statPending--;
    this.addFloat(this.player.x, this.player.y - 28, c.name, '#4fd2ff', 14);
    if (this.statPending > 0) {
      UI.showStatChoice(this.buildStatCards(), c => this.pickStat(c));   // 连升多级：只重建一次
    } else {
      UI.hideStatChoice();
      transitionRunState(this, RUN_STATES.PLAYING, 'stat-choice-complete');
    }
  }

  hpScale() { return 1 + this.time * BALANCE.growth.hpPerSecond + (this.wave - 1) * BALANCE.growth.hpPerWave; }

  // ── 蜂巢技能树 ──
  openTree(returnState = RUN_STATES.PLAYING) {
    if (!this.player?.treeId) return false;
    if (![RUN_STATES.PLAYING, RUN_STATES.LEVELUP].includes(this.state)) return false;
    this.treeReturnState = returnState === RUN_STATES.LEVELUP ? RUN_STATES.LEVELUP : RUN_STATES.PLAYING;
    transitionRunState(this, RUN_STATES.TREE, 'open-skill-tree');
    this.treeHover = null; this.treeSel = null;
    return true;
  }
  closeTree() {
    if (this.state !== RUN_STATES.TREE) return;
    const target = this.treeReturnState === RUN_STATES.LEVELUP && this.statPending > 0 ? RUN_STATES.LEVELUP : RUN_STATES.PLAYING;
    transitionRunState(this, target, 'close-skill-tree');
    if (target === RUN_STATES.LEVELUP) UI.showStatChoice(this.buildStatCards(), c => this.pickStat(c));
  }
  toggleTree() {
    if (this.state === RUN_STATES.TREE) this.closeTree();
    else if (this.state === RUN_STATES.PLAYING) this.openTree(RUN_STATES.PLAYING);
  }
}
