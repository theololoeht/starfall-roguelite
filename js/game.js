// ===== 游戏主控 =====
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width; this.H = canvas.height;
    this.stars = [];
    for (let i = 0; i < 90; i++) this.stars.push({ x: rand(0, this.W), y: rand(0, this.H), r: rand(0.4, 1.6), s: rand(12, 60), tw: rand(0, TAU) });
    this.bgScroll = 0;
    this.nebulaCv = this.buildNebula();
    this.state = RUN_STATES.MENU;
    this.beams = []; this.dragonBreaths = []; this.rings = []; this.flashes = []; this.zaps = []; this.mines = [];
    this.shakeMag = 0;
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  reset(initialWeapon, archetypeId) {
    this.initialWeapon = initialWeapon;
    this.archetypeDef = ARCHETYPES.find(a => a.id === archetypeId) || null;
    this.player = new Player();
    this.player.addWeapon(initialWeapon);   // 初始武器：开局自选，强化走蜂巢技能树
    if (SKILL_TREES[initialWeapon]) {
      this.player.treeId = initialWeapon;
      this.player.formChain = ['base'];
    }
    // 本地验收：debugPath 运行真实增量攻击链；debugForm 仅隔离单一形态美术。
    const localDebug = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    const debugParams = localDebug ? new URLSearchParams(location.search) : null;
    const debugPath = debugParams?.get('debugPath')?.split(',').map(x => x.trim()).filter(Boolean) || null;
    const debugForm = debugParams?.get('debugForm') || null;
    if (debugPath && validateEvolutionPath(SKILL_TREES[initialWeapon], debugPath)) {
      this.player.formChain = debugPath;
      this.player.formId = debugPath[debugPath.length - 1];
    }
    if (debugForm && SKILL_TREES[initialWeapon]?.forms[debugForm]) {
      this.player.formId = debugForm;
      this.player.formChain = [debugForm]; // 美术验收只展示指定形态，避免继承攻击干扰观察。
    }
    if (SKILL_TREES[initialWeapon]) this.player.recomputeFire();
    if (this.archetypeDef) this.archetypeDef.apply(this.player);
    this.player.maxHp = Math.round(this.player.maxHp * BALANCE.combat.playerHpMul);
    this.player.hp = this.player.maxHp;
    this.player.dmgMul *= BALANCE.combat.playerDamageMul;
    refreshPlayerAttackMetrics(this.player);
    this.enemies = []; this.pBullets = []; this.eBullets = [];
    this.gems = []; this.trails = []; this.particles = []; this.floats = [];
    this.beams = []; this.dragonBreaths = []; this.rings = []; this.flashes = []; this.zaps = []; this.mines = [];
    const localBossDebug = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && DEBUG_SETTINGS?.bossType;
    const debugBossEvent = localBossDebug ? BOSS_SCHEDULE.find(event => event.type === DEBUG_SETTINGS.bossType) : null;
    this.debugBoss = !!debugBossEvent;
    if (this.debugBoss) { this.player.maxHp = DEBUG_SETTINGS.playerHp; this.player.hp = DEBUG_SETTINGS.playerHp; }
    this.time = debugBossEvent ? debugBossEvent.at - DEBUG_SETTINGS.bossLeadSeconds : 0;
    this.wave = 1 + Math.floor(this.time / WAVE_LEN); this.kills = 0; this.score = 0;
    this.level = 1; this.xp = 0; this.statPending = 0;
    this.spawnT = Math.min(0.5, BALANCE.pacing.spawnMin);
    this.lastBudgetWave = 0;
    this.waveBudgetHp = 0;
    this.waveSpentHp = 0;
    this.lastMassWave = 0;
    this.formT = FIRST_FORMATION_AT;   // 周期性规律编队
    this.spawnQueue = [];              // 八方出怪预警队列 {type,angle,perp,t,t0}
    this.spawnGroupSeq = 0;
    this.formationHistory = [];
    this.triggeredBosses = new Set();  // 本局已触发的首领时间点
    if (debugBossEvent) {
      for (const event of BOSS_SCHEDULE) if (event.at < debugBossEvent.at) this.triggeredBosses.add(`${event.type}@${event.at}`);
    }
    this.announce = null;
    this.shakeMag = 0;
    this.pickHandler = null;
    this.treeHover = null;
    this.treeReturnState = RUN_STATES.PLAYING;
    this.bossIntroT = 0;
    transitionRunState(this, RUN_STATES.PLAYING, 'reset', true);
    // 同步隐藏 DOM 浮层（防止程序化重开时残留）
    if (typeof UI !== 'undefined' && UI.els) {
      if (UI.els.gameover) UI.els.gameover.classList.add('hidden');
      if (UI.els.menu) UI.els.menu.classList.add('hidden');
      if (UI.els.choices) UI.els.choices.classList.add('hidden');
      if (UI.els.victory) UI.els.victory.classList.add('hidden');
    }
  }

  loop(now) {
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    try {
      if (this.state === RUN_STATES.PLAYING) this.update(dt);
      else if (this.state === RUN_STATES.BOSS_INTRO) this.updateBossIntro(dt);
      this.draw();
      UI.syncHUD(this);
      if (this.errMsg) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(40,5,15,.85)';
        ctx.fillRect(0, this.H - 60, this.W, 60);
        ctx.fillStyle = '#ff8fa8';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('⚠ 运行错误（已拦截，游戏继续）: ' + this.errMsg, 10, this.H - 38);
        ctx.fillText('（请把这条信息反馈给开发者）', 10, this.H - 20);
      }
    } catch (e) {
      // 单帧异常不再杀掉整个 rAF 循环
      this.errMsg = e.message + ' @' + (e.stack || '').split('\n')[1];
      console.error('[Starfall]', e);
    } finally {
      requestAnimationFrame(this.loop);
    }
  }

  update(dt) {
    this.time += dt;
    this.wave = 1 + Math.floor(this.time / WAVE_LEN);
    this.bgScroll += dt * 14;   // 星河流速
    for (const s of this.stars) { s.y += s.s * dt; s.tw += dt * 3; if (s.y > this.H) { s.y = -2; s.x = rand(0, this.W); } }

    // 每帧先清空光束缓存，武器 tick 时重新写入
    this.beams = [];
    this.dragonBreaths = [];

    this.updateBossSchedule();
    this.updateSpawns(dt);
    this.updateFormations(dt);
    this.player.update(dt, this);
    for (const e of this.enemies) e.update(dt, this);
    for (const b of this.pBullets) b.update(dt, this);
    for (const b of this.eBullets) b.update(dt);
    for (const g of this.gems) g.update(dt, this);
    for (const t of this.trails) t.update(dt, this);

    this.collide();

    this.enemies = this.enemies.filter(e => !e.dead);
    this.pBullets = this.pBullets.filter(b => !b.dead);
    this.eBullets = this.eBullets.filter(b => !b.dead);
    this.gems = this.gems.filter(g => !g.dead);
    this.trails = this.trails.filter(t => !t.dead);
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter(p => !p.dead);
    for (const r of this.rings) r.update(dt);
    this.rings = this.rings.filter(r => !r.dead);
    for (const f of this.flashes) f.update(dt);
    this.flashes = this.flashes.filter(f => !f.dead);
    for (const f of this.floats) f.update(dt);
    this.floats = this.floats.filter(f => !f.dead);
    for (const z of this.zaps) z.life -= dt;
    this.zaps = this.zaps.filter(z => z.life > 0);
    for (const m of this.mines) m.update(dt, this);
    this.mines = this.mines.filter(m => !m.dead);
    if (this.announce) { this.announce.t -= dt; if (this.announce.t <= 0) this.announce = null; }

    this.shakeMag = Math.max(0, this.shakeMag - dt * 14);

    if (this.player.hp <= 0) {
      transitionRunState(this, RUN_STATES.GAMEOVER, 'player-defeated');
      UI.showGameOver({ time: this.time, wave: this.wave, level: this.level, kills: this.kills, score: this.score });
    }
  }

  // 标准蜂窝：平顶六边形密铺，中心紧贴环绕 6 格
  // 方位：正上=终极，左上/右上=精华方向，左下/正下/右下=强化
  // 星河背景：离屏星云（可纵向无缝循环）
  buildNebula() {
    const cv = document.createElement('canvas');
    cv.width = this.W; cv.height = this.H;
    const g = cv.getContext('2d');
    const hues = ['#16224d', '#2b1250', '#0d3346', '#3d1030', '#101c3f'];
    for (let i = 0; i < 14; i++) {
      const x = rand(0, this.W), y = rand(0, this.H);
      const r = rand(130, 300);
      const col = pick(hues);
      for (const dy of [0, -this.H, this.H]) {   // 上下各画一份 → 纵向无缝
        const grad = g.createRadialGradient(x, y + dy, 0, x, y + dy, r);
        grad.addColorStop(0, hexA(col, rand(0.25, 0.5)));
        grad.addColorStop(1, hexA(col, 0));
        g.fillStyle = grad;
        g.fillRect(x - r, y + dy - r, r * 2, r * 2);
      }
    }
    // 银河尘带：斜向亮带
    g.globalAlpha = 0.12;
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = '#8fb4ff';
      g.lineWidth = rand(30, 70);
      g.beginPath();
      const y = rand(0, this.H);
      g.moveTo(-50, y);
      g.lineTo(this.W + 50, y + rand(-160, 160));
      g.stroke();
    }
    g.globalAlpha = 1;
    return cv;
  }

  // ── 电磁脉冲（磁轨技能 r3）：清弹 + 小伤害 ──
  empPulse() {
    const p = this.player;
    if (!p) return;
    const R = 160;
    this.rings.push(new Ring(p.x, p.y, 20, R, 0.4, '#ffe25d', 4));
    let cleared = 0;
    for (const b of this.eBullets) {
      if (dist(b.x, b.y, p.x, p.y) < R) { b.dead = true; cleared++; }
    }
    for (const e of this.enemies) {
      if (e.dead || e.spawning) continue;
      const zone = e.circleHit(p.x, p.y, R);
      if (zone) e.hurt(15 * p.dmgMul * zone.damageMul, this, false);
    }
    if (cleared) this.addFloat(p.x, p.y - 30, 'EMP ×' + cleared, '#ffe25d', 13);
  }

  // ── 右键挥刀：清除弹幕 + 范围伤害 ──
  trySword() {
    if (this.state !== 'playing' || !this.player) return;
    const p = this.player;
    if (p.swordCd > 0) return;
    p.swordCd = 4;
    const R = 175;
    this.rings.push(new Ring(p.x, p.y, 20, R, 0.45, '#ff5de3', 5));
    this.flashes.push(new Flash(p.x, p.y, R * 0.7, 0.25, '#ff5de3'));
    this.shake(3);
    let cleared = 0;
    for (const b of this.eBullets) {
      if (dist(b.x, b.y, p.x, p.y) < R) { b.dead = true; cleared++; this.burst(b.x, b.y, '#ff5de3', 2, 90); }
    }
    for (const e of this.enemies) {
      if (e.dead || e.spawning) continue;
      const zone = e.circleHit(p.x, p.y, R);
      if (zone) {
        e.hurt(25 * p.dmgMul * zone.damageMul, this, true);
        const a = angleTo(p.x, p.y, zone.x, zone.y);
        e.x += Math.cos(a) * 22; e.y += Math.sin(a) * 22;
      }
    }
    if (cleared) this.addFloat(p.x, p.y - 40, '斩灭弹幕 ×' + cleared, '#ff5de3', 15);
  }

  togglePause() {
    if (this.state === RUN_STATES.PLAYING) transitionRunState(this, RUN_STATES.PAUSED, 'pause');
    else if (this.state === RUN_STATES.PAUSED) transitionRunState(this, RUN_STATES.PLAYING, 'resume');
  }

  enterMenu() { transitionRunState(this, RUN_STATES.MENU, 'return-menu'); }

  // ── 绘制（霓虹发光渲染管线）──
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    // 流动星河：星云缓慢下移（无缝循环）
    if (this.nebulaCv) {
      const sc = this.bgScroll % this.H;
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.nebulaCv, 0, sc);
      ctx.drawImage(this.nebulaCv, 0, sc - this.H);
      ctx.globalAlpha = 1;
    }
    // 星空
    for (const s of this.stars) {
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(s.tw);
      ctx.fillStyle = '#9fc7ff';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    if (this.state === 'menu' || !this.player) return;

    ctx.save();
    if (this.shakeMag > 0) ctx.translate(rand(-1, 1) * this.shakeMag, rand(-1, 1) * this.shakeMag);

    // ── 叠加发光层（底层）：尾迹缎带 / 晶体 / 敌机光晕 ──
    ctx.globalCompositeOperation = 'lighter';
    // 尾迹缎带：相邻尾迹段用粗线相连，形成连续光带（而非一串圆点）
    ctx.lineCap = 'round';
    for (let i = 1; i < this.trails.length; i++) {
      const a = this.trails[i - 1], b = this.trails[i];
      if (a.color !== b.color) continue;
      if (dist2(a.x, a.y, b.x, b.y) > 42 * 42) continue;
      const al = Math.min(a.life / a.maxLife, b.life / b.maxLife);
      ctx.strokeStyle = hexA(b.color, 0.28 * al);
      ctx.lineWidth = (a.r + b.r) * 0.95 * (0.4 + 0.6 * al);   // 尾端收细
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      // 内芯亮线
      ctx.strokeStyle = hexA('#ffffff', 0.12 * al);
      ctx.lineWidth = (a.r + b.r) * 0.35;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const t of this.trails) t.draw(ctx);
    for (const m of this.mines) m.draw(ctx);
    for (const g of this.gems) g.draw(ctx);
    for (const e of this.enemies) {
      if (e.spawning) continue;
      FX.glowCircle(ctx, e.x, e.y, e.r * 2.4, e.def.color, 0.45);
    }
    ctx.globalCompositeOperation = 'source-over';

    // ── 实体本体 ──
    for (const e of this.enemies) e.draw(ctx, this);
    this.player.draw(ctx, this);

    // ── 叠加发光层（顶层）：子弹 / 光束 / 粒子 / 冲击环 ──
    ctx.globalCompositeOperation = 'lighter';
    // 光束：宽晕 → 主束 → 白热芯，宽度脉动
    const pulse = 1 + Math.sin(performance.now() * 0.04) * 0.15;
    const dragon = this.enemies.find(e => e.type === 'dragon' && !e.dead);
    // 突击与吐息前摇：明确告诉玩家危险方向，亮度随蓄力增长。
    if (dragon && dragon.phase === 'assault' && dragon.phaseStage === 'telegraph') {
      const k = clamp(1 - dragon.phaseT / dragon.def.assaultTelegraph, 0, 1);
      const len = 720, ex = dragon.x + Math.cos(dragon.attackAim) * len, ey = dragon.y + Math.sin(dragon.attackAim) * len;
      ctx.setLineDash([18, 12]); ctx.lineDashOffset = -performance.now() * 0.06;
      ctx.beginPath(); ctx.moveTo(dragon.x, dragon.y); ctx.lineTo(ex, ey);
      ctx.strokeStyle = hexA('#ffcf63', 0.18 + k * 0.5); ctx.lineWidth = 2 + k * 3; ctx.stroke();
      ctx.setLineDash([]);
      FX.glowRing(ctx, dragon.x, dragon.y, 28 + k * 18, '#ffcf63', 0.5 + k * 0.4, 3);
    }
    if (dragon && dragon.phase === 'breath' && dragon.phaseStage === 'windup') {
      const k = clamp(1 - dragon.phaseT / dragon.def.breathWindup, 0, 1);
      const mx = dragon.x + Math.cos(dragon.attackAim) * 30, my = dragon.y + Math.sin(dragon.attackAim) * 30;
      for (let i = 0; i < 3; i++) FX.glowRing(ctx, mx, my, 12 + i * 9 - k * 6, i === 1 ? '#ffcf63' : dragon.def.color, 0.35 + k * 0.45, 2);
      FX.glowCircle(ctx, mx, my, 18 + k * 18, '#fff4c7', 0.35 + k * 0.55);
    }
    // 龙息：外层能量雾、锯齿边焰、主束和白热核心分层绘制。
    for (const bm of this.dragonBreaths) {
      const w = bm.width * (0.92 + Math.sin(bm.t * 18) * 0.08);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2);
      ctx.strokeStyle = hexA('#ff174f', 0.12); ctx.lineWidth = w * 3.6; ctx.stroke();
      ctx.strokeStyle = hexA('#b82cff', 0.28); ctx.lineWidth = w * 2.1; ctx.stroke();
      ctx.strokeStyle = hexA(bm.color, 0.82); ctx.lineWidth = w * 1.2; ctx.stroke();
      ctx.strokeStyle = hexA('#fff1c7', 0.95); ctx.lineWidth = Math.max(5, w * 0.34); ctx.stroke();
      const dx = bm.x2 - bm.x1, dy = bm.y2 - bm.y1;
      for (let i = 0; i < 8; i++) {
        const q = ((i / 8 + bm.t * 0.85) % 1);
        FX.glowRing(ctx, bm.x1 + dx * q, bm.y1 + dy * q, w * (0.38 + q * 0.35), i % 2 ? '#ffcf63' : '#ff4d9d', 0.45, 2);
      }
      FX.glowCircle(ctx, bm.x1, bm.y1, w * 1.45, '#fff4c7', 0.9);
      FX.glowCircle(ctx, bm.x2, bm.y2, w * 1.8, '#ff4d6d', 0.65);
    }
    for (const bm of this.beams) {
      const w = bm.width * pulse;
      ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2);
      ctx.strokeStyle = hexA(bm.color, 0.18); ctx.lineWidth = w * 4; ctx.stroke();
      ctx.strokeStyle = hexA(bm.color, 0.55); ctx.lineWidth = w * 1.8; ctx.stroke();
      ctx.strokeStyle = hexA('#ffffff', 0.9); ctx.lineWidth = Math.max(1, w * 0.5); ctx.stroke();
      FX.glowCircle(ctx, bm.x2, bm.y2, w * 5, bm.color, 0.8);
    }
    for (const b of this.pBullets) b.draw(ctx);
    // 链式闪电（锯齿光路）
    for (const z of this.zaps) {
      const seg = 5;
      ctx.beginPath(); ctx.moveTo(z.x1, z.y1);
      for (let k = 1; k < seg; k++) {
        const t = k / seg;
        const mx = z.x1 + (z.x2 - z.x1) * t + rand(-8, 8);
        const my = z.y1 + (z.y2 - z.y1) * t + rand(-8, 8);
        ctx.lineTo(mx, my);
      }
      ctx.lineTo(z.x2, z.y2);
      ctx.strokeStyle = hexA('#ffffff', 0.9 * z.life / 0.12); ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = hexA(z.color, 0.5 * z.life / 0.12); ctx.lineWidth = 5; ctx.stroke();
    }
    for (const b of this.eBullets) b.draw(ctx);
    // 瞄准光标（鼠标模式）：缓慢旋转的四段弧括弧 + 中心点
    if (input.mouseActive && this.state === 'playing') {
      const cx = input.mx, cy = input.my;
      const rot = performance.now() / 1000 * 1.4;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.strokeStyle = 'rgba(191,232,255,.85)'; ctx.lineWidth = 1.6;
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.arc(0, 0, 9, -0.5, 0.5); ctx.stroke();
      }
      ctx.restore();
      FX.glowCircle(ctx, cx, cy, 3.5, '#bfe8ff', 0.55);
    }
    for (const p of this.particles) p.draw(ctx);
    for (const r of this.rings) r.draw(ctx);
    for (const f of this.flashes) f.draw(ctx);
    for (const w of this.player.weapons) drawWeaponFx(this, ctx, w);
    // 出怪预警按“同一生成组 + 相近入口角度”聚合，避免墙阵/楔阵叠成一团强光。
    const warningGroups = new Map();
    for (const s of this.spawnQueue) {
      const key = `${s.groupId}:${Math.round(s.angle * 16)}`;
      const group = warningGroups.get(key);
      if (group) { group.count++; if (s.t < group.t) group.t = s.t; }
      else warningGroups.set(key, { ...s, count:1 });
    }
    for (const s of warningGroups.values()) {
      const pos = edgeSpawnPos(this.player.x, this.player.y, s.angle);
      const mx = clamp(pos.x, 26, this.W - 26), my = clamp(pos.y, 26, this.H - 26);
      const k = 1 - s.t / s.t0;
      const a = 0.35 + 0.55 * Math.abs(Math.sin(s.t * 12));
      const col = ENEMY_DEFS[s.type].color;
      FX.glowRing(ctx, mx, my, 14 - 6 * k, col, a, 2);
      const ang = angleTo(pos.x, pos.y, this.player.x, this.player.y);
      ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-3, -7); ctx.lineTo(-3, 7); ctx.closePath();
      ctx.fillStyle = hexA(col, a); ctx.fill();
      ctx.restore();
      if (s.count > 1) {
        ctx.fillStyle = hexA('#ffffff', 0.78); ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText(`×${s.count}`, mx, my + 26);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const f of this.floats) f.draw(ctx);
    ctx.restore();

    if (BALANCE_MODE === 'test') {
      ctx.fillStyle = 'rgba(255,207,99,.88)'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`TEST BALANCE${this.debugBoss ? ' · BOSS SCENARIO' : ''}`, 12, this.H - 12);
    }

    const boss = this.enemies.find(e => e.def.boss && !e.dead);
    if (boss) {
      const w = 360, h = 10, x = (this.W - w) / 2, y = 18;
      ctx.fillStyle = 'rgba(12,5,14,.82)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = boss.def.color; ctx.fillRect(x, y, w * clamp(boss.hp / boss.maxHp, 0, 1), h);
      ctx.strokeStyle = hexA(boss.def.color, 0.7); ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#ffdbe2'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      const phaseNames = { orbit: '盘旋弹幕', assault: boss.phaseStage === 'telegraph' ? '突击锁定' : '突击', breath: boss.phaseStage === 'windup' ? '吐息蓄力' : '星焰吐息' };
      const phaseLabel = boss.phaseLabel || (boss.type === 'dragon' ? phaseNames[boss.phase] : '');
      const phaseText = phaseLabel ? ` · ${phaseLabel}` : '';
      ctx.fillText(`${boss.def.name}${phaseText}  ${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`, this.W / 2, y + 23);
    }
    if (this.announce) {
      const a = clamp(this.announce.t, 0, 1);
      ctx.fillStyle = hexA('#ff4d6d', a); ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(this.announce.text, this.W / 2, 88);
    }

    // 编队预警（不放文字，靠边缘标记与阵形可读）

    if (this.state === 'tree') this.drawTree(ctx);
    else if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(3,6,15,.6)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = '#cfe3ff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('已暂停', this.W / 2, this.H / 2 - 10);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#7d94bb';
      ctx.fillText('按 P / Esc 继续 · Q 返回主菜单', this.W / 2, this.H / 2 + 24);
    }
  }


}

for (const system of [GameSpawningSystem, GameCollisionSystem, GameEncounterSystem, GameProgressionSystem, GameSkillTreeSystem, GameEffectsSystem]) {
  for (const name of Object.getOwnPropertyNames(system.prototype)) {
    if (name !== 'constructor') Object.defineProperty(Game.prototype, name, Object.getOwnPropertyDescriptor(system.prototype, name));
  }
}
