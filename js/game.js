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
    this.debugBoss = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && DEBUG_SCENARIO === 'boss';
    if (this.debugBoss) { this.player.maxHp = DEBUG_SETTINGS.playerHp; this.player.hp = DEBUG_SETTINGS.playerHp; }
    this.time = this.debugBoss ? BOSS_SCHEDULE[0].at - DEBUG_SETTINGS.bossLeadSeconds : 0;
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

  // ── 蜂巢大树：三个蜂窝簇严丝合缝拼成一块 19 格大蜂窝 ──
  // 基础簇 7 格（中心+6邻），进化簇各 6 格（缺口恰好被基础簇的精华格占据）
  treeLayout() {
    const tree = SKILL_TREES[this.player.treeId];
    const p = this.player;
    const r = 26;
    const d = Math.sqrt(3) * r;
    // 六方向邻格偏移（画布 y 向下）
    const HX = Math.sqrt(3) / 2;   // 精确密铺系数
    const O = {
      up: [0, -d],
      upright: [HX * d, -0.5 * d],
      downright: [HX * d, 0.5 * d],
      down: [0, d],
      downleft: [-HX * d, 0.5 * d],
      upleft: [-HX * d, -0.5 * d],
    };
    const cB = { x: this.W / 2, y: this.H - 230 };   // 基础簇中心
    const cS = { x: Math.round(cB.x + 2 * O.upleft[0]), y: Math.round(cB.y + 2 * O.upleft[1]) };   // 左上两步
    const cR = { x: Math.round(cB.x + 2 * O.upright[0]), y: Math.round(cB.y + 2 * O.upright[1]) }; // 右上两步
    const cU = { x: this.W / 2, y: Math.round(cB.y - 3 * d) };     // 终极簇：顶部王冠位（3d=精确密铺）
    const nodes = [];
    const add = (formId, kind, ref, c, o, active) =>
      nodes.push({ kind, formId, ref, active, x: c.x + o[0], y: c.y + o[1] });
    const cur = p.formId;
    const branchIds = tree.branchForms || ['shotgun', 'rail'];
    const leftId = branchIds[0], rightId = branchIds[1];
    const finalId = tree.finalForm || 'ultimate';
    const bForm = tree.forms.base;
    add('base', 'center', bForm, cB, [0, 0], cur === 'base');
    bForm.nodes.forEach((n, i) => add('base', 'node', n, cB, [O.downleft, O.down, O.downright][i], cur === 'base'));
    add('base', 'capstone', bForm.capstone, cB, O.up, cur === 'base');
    if (tree.forms[leftId] && bForm.evolutions?.[0]) add('base', 'evolution', bForm.evolutions[0], cB, O.upleft, cur === 'base');
    if (tree.forms[rightId] && bForm.evolutions?.[1]) add('base', 'evolution', bForm.evolutions[1], cB, O.upright, cur === 'base');
    // 散裂弹幕簇（左上，缺口在 downright——那里是基础簇的精华格）
    const sForm = tree.forms[leftId];
    if (sForm) {
      add(leftId, 'center', sForm, cS, [0, 0], cur === leftId);
      sForm.nodes.forEach((n, i) => add(leftId, 'node', n, cS, [O.down, O.downleft, O.upright][i], cur === leftId));
      add(leftId, 'capstone', sForm.capstone, cS, O.up, cur === leftId);
    }
    // 贯穿磁轨簇（右上，缺口在 downleft）
    const rForm = tree.forms[rightId];
    if (rForm) {
      add(rightId, 'center', rForm, cR, [0, 0], cur === rightId);
      rForm.nodes.forEach((n, i) => add(rightId, 'node', n, cR, [O.down, O.downright, O.upleft][i], cur === rightId));
      add(rightId, 'capstone', rForm.capstone, cR, O.up, cur === rightId);
      // 终极进化位：占据原"未来格"
      if (rForm.evolutions[0]) add(rightId, 'evolution', rForm.evolutions[0], cR, O.upright, cur === rightId);
    }
    // 散裂簇的终极进化位（原未来格）
    if (sForm && sForm.evolutions[0]) add(leftId, 'evolution', sForm.evolutions[0], cS, O.upleft, cur === leftId);
    // 终极簇（顶部王冠位：中心 + 6 个完整升级子项 = 满花）
    const uForm = tree.forms[finalId];
    if (uForm) {
      add(finalId, 'center', uForm, cU, [0, 0], cur === finalId);
      const uDirs = [O.upleft, O.up, O.upright, O.downright, O.down, O.downleft];
      uForm.nodes.slice(0, 6).forEach((n, i) => add(finalId, 'node', n, cU, uDirs[i], cur === finalId));
    }
    const centers = { base: cB };
    if (sForm) centers[leftId] = cS;
    if (rForm) centers[rightId] = cR;
    if (uForm) centers[finalId] = cU;
    return { nodes, centers };
  }

  treeClick(x, y) {
    const p = this.player, sk = p.skills, form = p.form;
    // 小六边形用"最近节点"命中（含未激活集群：点上去是无操作，不误关树）
    let best = null, bd = 26 * 26, any = false, bdAny = 26 * 26;
    for (const n of this.treeLayout().nodes) {
      const dd = dist2(x, y, n.x, n.y);
      if (dd < bdAny) { bdAny = dd; any = n; }
      if (n.kind === 'center' || !n.active) continue;   // 只能操作当前形态的蜂窝
      if (dd < bd) { bd = dd; best = n; }
    }
    if (!any) { this.treeSel = null; this.closeTree(); return; }   // 点真正的空处 = 返回战斗
    if (!best) return;                                             // 点在未激活集群上：无操作
    const n = best;
    if (sk.spent.has(n.ref.id)) { this.treeSel = null; return; }
    // 两段式：第一次点击 = 选中查看；再点同一格 = 确认升级
    const sel = this.treeSel;
    if (!(sel && sel.ref === n.ref && sel.kind === n.kind)) {
      this.treeSel = { kind: n.kind, ref: n.ref, x: n.x, y: n.y };
      return;
    }
    this.treeSel = null;
    if (n.kind === 'evolution') {
      if (!sk.spent.has(form.capstone.id) || sk.points <= 0) return;
      sk.points--;
      p.formId = n.ref.id;
      if (!p.formChain.includes(n.ref.id)) p.formChain.push(n.ref.id);
      p.recomputeFire();
      this.flashes.push(new Flash(p.x, p.y, 80, 0.5, n.ref.color));
      this.rings.push(new Ring(p.x, p.y, 12, 110, 0.6, n.ref.color, 4));
      this.shake(5);
      return;
    }
    if (n.kind === 'capstone' && !form.nodes.every(m => sk.spent.has(m.id))) return;
    if (sk.points <= 0) return;
    sk.points--;
    sk.spent.add(n.ref.id);
    p.recomputeFire();
    this.rings.push(new Ring(n.x, n.y, 8, 40, 0.4, SKILL_TREES[p.treeId].color, 3));
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

  // ── 表现层辅助 ──
  burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(speed * 0.3, speed);
      this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.6), color, rand(2, 4)));
    }
  }
  explosion(x, y, r, dmg, color) {
    this.flashes.push(new Flash(x, y, r, 0.35, color));
    this.rings.push(new Ring(x, y, 10, r, 0.45, color, 4));
    this.burst(x, y, color, 18, r * 1.4);
    this.shake(5);
    for (const e of this.enemies) {
      if (e.dead || e.spawning) continue;
      const zone = e.circleHit(x, y, r);
      if (zone) e.hurt(dmg * zone.damageMul, this, true);
    }
  }
  // 敌方来源爆炸：只对玩家生效
  explosionHostile(x, y, r, dmg, color) {
    this.flashes.push(new Flash(x, y, r * 0.7, 0.3, color));
    this.rings.push(new Ring(x, y, 10, r, 0.4, color, 3));
    this.burst(x, y, color, 12, r);
    this.shake(3);
    const p = this.player;
    if (dist(x, y, p.x, p.y) < r + p.radius) p.hurt(dmg, this);
  }

  addFloat(x, y, text, color, size) { this.floats.push(new FloatText(x, y, text, color, size)); }
  shake(m) { this.shakeMag = Math.max(this.shakeMag, m); }
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
      const phaseText = boss.type === 'dragon' ? ` · ${phaseNames[boss.phase]}` : '';
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

  // ── 蜂巢技能树渲染 ──
  hexPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  // 蜂巢大树：多集群一张图，由最低级（底部）逐步向上进化
  drawTree(ctx) {
    const p = this.player, sk = p.skills, tree = SKILL_TREES[p.treeId], form = p.form;
    ctx.fillStyle = 'rgba(2,4,10,.92)';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf7ff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${WEAPON_DEFS[p.treeId].name} · 蜂巢进化树`, this.W / 2, 40);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = sk.points > 0 ? '#ffd25d' : '#7d94bb';
    ctx.fillText(`技能点 ⬢ ${sk.points} · 由最低级逐步向上进化`, this.W / 2, 64);

    const { nodes, centers } = this.treeLayout();
    const t = performance.now() / 1000;
    this.treeHover = null;
    const R = 26;   // 全部同尺寸 → 三簇拼成一块无缝大蜂窝

    // 每个集群内部：中心到 6 邻格的细连接线
    for (const n of nodes) {
      if (n.kind === 'center') continue;
      const c = nodes.find(m => m.kind === 'center' && m.formId === n.formId);
      ctx.strokeStyle = 'rgba(28,39,64,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(n.x, n.y); ctx.stroke();
    }

    for (const n of nodes) {
      const curForm = tree.forms[n.formId];
      const col = n.formId === 'base' ? tree.color : n.ref.color || curForm.color;
      const spent = sk.spent.has(n.ref.id);
      const isEvoTarget = n.formId === p.formId;
      const hovered = input.mouseActive && dist2(input.mx, input.my, n.x, n.y) < 28 * 28;
      if (hovered && n.kind !== 'center') this.treeHover = n;

      let avail = false, lockText = null;
      if (n.active) {
        if (n.kind === 'capstone') {
          const done = curForm.nodes.every(m => sk.spent.has(m.id));
          avail = done && !spent && sk.points > 0;
          if (!done && !spent) lockText = `${curForm.nodes.filter(m => sk.spent.has(m.id)).length}/3`;
        } else if (n.kind === 'evolution') {
          const capDone = !curForm.capstone || sk.spent.has(curForm.capstone.id);
          avail = capDone && !spent && sk.points > 0;
          if (!capDone && !spent) lockText = '需终极';
        } else if (n.kind === 'node') {
          avail = !spent && sk.points > 0;
        }
      }
      this.hexPath(ctx, n.x, n.y, R);
      if (n.kind === 'center' && isEvoTarget) {
        ctx.fillStyle = hexA(col, 0.32); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); this.hexPath(ctx, n.x, n.y, R - 4.5);
        ctx.strokeStyle = hexA('#ffffff', 0.45); ctx.lineWidth = 1; ctx.stroke();
      }
      else if (spent) { ctx.fillStyle = hexA(col, 0.28); ctx.fill(); ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 2; }
      else if (avail) { ctx.fillStyle = hexA(col, 0.1 + 0.06 * Math.sin(t * 6)); ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8 + Math.sin(t * 6) * 0.7; }
      else if (!n.active) { ctx.fillStyle = 'rgba(8,12,24,.55)'; ctx.fill(); ctx.strokeStyle = '#1a2742'; ctx.lineWidth = 1.5; }
      else { ctx.fillStyle = 'rgba(10,16,32,.6)'; ctx.fill(); ctx.strokeStyle = '#243654'; ctx.lineWidth = 1.5; }
      if (hovered) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; }
      ctx.stroke();
      ctx.font = '14px sans-serif';
      ctx.fillStyle = spent || avail || n.kind === 'center' ? '#ffffff' : '#4a5f82';
      const icon = n.kind === 'center' ? curForm.icon : (n.ref.icon || '⬢');
      ctx.fillText(icon, n.x, n.y + 5);
      if (n.kind === 'capstone' && lockText) {
        ctx.font = '9px sans-serif'; ctx.fillStyle = '#7d94bb';
        ctx.fillText(lockText, n.x, n.y + 18);
      }
      if (n.kind === 'evolution' && !spent && n.active) {
        ctx.font = '9px sans-serif'; ctx.fillStyle = hexA(col, 0.9);
        ctx.fillText('◈', n.x, n.y + 17);
      }
    }
    // 集群名称：画在各自集群最下缘下方
    ctx.font = 'bold 11px sans-serif';
    for (const [fid, c] of Object.entries(centers)) {
      const curForm = tree.forms[fid];
      const isCur = p.formId === fid;
      ctx.fillStyle = isCur ? curForm.color : '#4a5f82';
      const suffix = isCur ? ' ◀ 当前' : (curForm.capstone && sk.spent.has(curForm.capstone.id)) ? ' ✓' : '';
      ctx.fillText(curForm.name + suffix, c.x, c.y + Math.sqrt(3) * R + R + 14);
    }
    // 两段式：选中格金色虚线高亮
    if (this.treeSel) {
      const n = this.treeSel;
      this.hexPath(ctx, n.x, n.y, R + 3);
      ctx.strokeStyle = '#ffd25d'; ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    const info = this.treeSel || this.treeHover;
    if (info) {
      const n = info;
      const confirm = info === this.treeSel ? '　▶ 再点一次确认升级' : '';
      ctx.font = '13px sans-serif';
      ctx.fillStyle = info === this.treeSel ? '#ffd25d' : '#cfe3ff';
      ctx.fillText(`${n.ref.name} — ${n.ref.desc}${confirm}`, this.W / 2, this.H - 34);
    }
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#7d94bb';
    ctx.fillText('点亮当前形态蜂窝 · 经由 ◈ 精华方向进化上方形态 · 点空处或 Esc 返回战斗', this.W / 2, this.H - 12);
  }
}

for (const system of [GameSpawningSystem, GameCollisionSystem, GameEncounterSystem, GameProgressionSystem]) {
  for (const name of Object.getOwnPropertyNames(system.prototype)) {
    if (name !== 'constructor') Object.defineProperty(Game.prototype, name, Object.getOwnPropertyDescriptor(system.prototype, name));
  }
}
