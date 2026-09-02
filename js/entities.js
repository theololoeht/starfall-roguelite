// ===== 玩家 =====
class Player {
  constructor() {
    Object.assign(this, PLAYER_BASE);
    this.hp = this.maxHp;
    this.x = CANVAS_W / 2; this.y = CANVAS_H / 2;
    this.vx = 0; this.vy = 0;
    this.iframes = 0;
    this.dashT = 0; this.dashVx = 0; this.dashVy = 0;
    this.dashDamage = 0; this.dashHits = new Set();
    this.weapons = [];
    this.thrustT = 0;
    this.t = 0;
    // 蜂巢技能树
    this.treeId = null;
    this.skills = { points: 0, spent: new Set() };
    this.formId = 'base';
    this.formChain = ['base'];   // 进化链：原体 → 历次进化
    this.attacks = [];           // 链上每段形态各自的攻击（前一级攻击方式保留）
    this.fire = null; this.form = null;
    this.aim = -Math.PI / 2;
    this.swordCd = 0;   // 右键挥刀冷却
    this.muzzleFlashT = 0;
    // 护盾：一次性吸收，最多 3 层；持续不受击回充
    this.shield = 1;
    this.shieldMax = 3;
    this.shieldRegenT = 8;
    this.shieldIframes = 0;
    this.shieldFx = { hitT:0, hitMax:0.34, impactAngle:0, chargeT:0, chargeMax:0.62 };
    // 技能树特殊效果状态
    this.stillT = 0;    // 蓄能狙击：静止计时
    this.shotN = 0;     // 射击计数（重型轮射/烈性爆裂）
    this.empT = 0;      // 电磁脉冲计时
  }
  addWeapon(id) { const w = makeWeapon(id); this.weapons.push(w); return w; }
  get mainWeapon() { return this.weapons[0] || null; }

  // 重建攻击组：进化链上每段形态的攻击方式全部保留，同时生效
  // 效果继承：链上任一形态点亮的节点，作用于链上每一段攻击（全局增益语义）
  // 自身独立特性 = 本形态 fire 基准；升级来源与最初升级的攻击方式继续存在
  rebuildAttacks() {
    const tree = SKILL_TREES[this.treeId];
    if (!tree) { this.attacks = []; this.form = null; this.fire = null; return; }
    const lineage = this.formChain.filter(fid => tree.forms[fid]);
    const policy = tree.progression || { attacks:'replace', upgrades:'current' };
    const chain = policy.attacks === 'retain' ? lineage : [this.formId];
    this.attacks = chain.map(fid => {
      const fm = tree.forms[fid];
      const f = { ...fm.fire };
      const lineageIndex = lineage.indexOf(fid);
      const parentFormId = lineageIndex > 0 ? lineage[lineageIndex - 1] : null;
      const upgradeSources = policy.upgrades === 'chain' ? lineage : [fid];
      for (const cid of upgradeSources) {
        const cm = tree.forms[cid];
        for (const n of cm.nodes) if (this.skills.spent.has(n.id)) n.apply(f);
        if (cm.capstone && this.skills.spent.has(cm.capstone.id)) cm.capstone.apply(f);
      }
      return {
        formId: fid, parentFormId, evolutionPath: lineage.slice(0, lineageIndex + 1),
        mode: f.mode || 'gun', fire: f, color: fm.color || '#4fd2ff',
      };
    });
    this.form = tree.forms[this.formId];
    this.fire = this.attacks[this.attacks.length - 1].fire;   // 兼容旧引用（主攻击）
    refreshPlayerAttackMetrics(this);
  }
  recomputeFire() { this.rebuildAttacks(); }

  update(dt, game) {
    this.t += dt;
    this.swordCd = Math.max(0, this.swordCd - dt);
    this.muzzleFlashT = Math.max(0, this.muzzleFlashT - dt);
    // 双操作模式：鼠标=位置跟随+自动索敌；WASD=手动朝向（射击沿机头）
    if (input.mouseActive) {
      const tgt = game.nearestEnemy(this.x, this.y, 900);
      if (tgt) this.aim = angleTo(this.x, this.y, tgt.x, tgt.y);
    }
    if (this.dashT > 0) {
      // ── 冲撞：位移 + 炽热拖尾 + 撞击判定 ──
      this.dashT -= dt;
      this.x += this.dashVx * dt; this.y += this.dashVy * dt;
      for (let i = 0; i < 3; i++) {
        game.particles.push(new Particle(
          this.x - this.dashVx * 0.02 + rand(-6, 6), this.y - this.dashVy * 0.02 + rand(-6, 6),
          -this.dashVx * 0.15 + rand(-40, 40), -this.dashVy * 0.15 + rand(-40, 40),
          0.4, '#ff9d5d', rand(3, 6)
        ));
      }
      for (const e of game.enemies) {
        if (e.dead || this.dashHits.has(e) || e.spawning) continue;
        const zone = e.circleHit(this.x, this.y, this.radius + 4);
        if (zone) {
          this.dashHits.add(e);
          e.hurt(this.dashDamage * zone.damageMul, game, true);
          const a = angleTo(this.x, this.y, zone.x, zone.y);
          if (!e.def?.boss) { e.x += Math.cos(a) * 26; e.y += Math.sin(a) * 26; }
        }
      }
      if (this.dashT <= 0) this.dashHits.clear();
    } else {
      let dx = 0, dy = 0;
      const K = input.keys;
      if (K.KeyA || K.ArrowLeft) dx -= 1;
      if (K.KeyD || K.ArrowRight) dx += 1;
      if (K.KeyW || K.ArrowUp) dy -= 1;
      if (K.KeyS || K.ArrowDown) dy += 1;
      if (dx || dy) { const l = Math.hypot(dx, dy); dx /= l; dy /= l; input.mouseActive = false; this.aim = Math.atan2(dy, dx); }
      else if (input.mouseActive) {
        const ddx = input.mx - this.x, ddy = input.my - this.y;
        const d = Math.hypot(ddx, ddy);
        if (d > 6) { dx = ddx / d; dy = ddy / d; }
      }
      const sp = PLAYER_BASE.speed * this.moveMul;
      this.vx = dx * sp; this.vy = dy * sp;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.thrustT -= dt;
      if ((dx || dy) && this.thrustT <= 0) {
        this.thrustT = 0.03;
        game.particles.push(new Particle(this.x + rand(-4, 4), this.y + 15, rand(-20, 20), rand(70, 140), 0.3, '#4fd2ff', rand(1.5, 3)));
      }
    }
    this.x = clamp(this.x, this.radius + 4, CANVAS_W - this.radius - 4);
    this.y = clamp(this.y, this.radius + 4, CANVAS_H - this.radius - 4);
    // 蓄能狙击：静止计时
    if (Math.hypot(this.vx, this.vy) < 20) this.stillT += dt; else this.stillT = 0;

    this.iframes -= dt;
    this.shieldIframes = Math.max(0, this.shieldIframes - dt);
    this.shieldFx.hitT = Math.max(0, this.shieldFx.hitT - dt);
    this.shieldFx.chargeT = Math.max(0, this.shieldFx.chargeT - dt);
    if (this.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
    // 护盾回充：持续不受击 8 秒 +1 层
    this.hitIdleT += dt;
    if (this.hitIdleT >= this.shieldRegenT && this.shield < this.shieldMax) {
      this.shield++;
      this.hitIdleT = 0;
      this.shieldFx.chargeT = this.shieldFx.chargeMax;
      if (game) game.rings.push(new Ring(this.x, this.y, 14, 34, 0.4, '#7dcfff', 2));
    }

    for (const w of this.weapons) updateWeapon(game, w, dt);
  }

  hurt(dmg, game, source = null) {
    if (this.iframes > 0 || this.shieldIframes > 0) return;
    // 护盾：一次性完全抵挡
    if (this.shield > 0) {
      this.shield--;
      this.shieldIframes = 0.16;
      this.hitIdleT = 0;
      const worldImpact = source && Number.isFinite(source.x) && Number.isFinite(source.y)
        ? angleTo(this.x, this.y, source.x, source.y) : this.aim;
      this.shieldFx.impactAngle = worldImpact - (this.aim + Math.PI / 2);
      this.shieldFx.hitT = this.shieldFx.hitMax;
      game.rings.push(new Ring(this.x, this.y, 16, 44, 0.35, '#7dcfff', 3));
      game.flashes.push(new Flash(this.x, this.y, 26, 0.2, '#7dcfff'));
      game.addFloat(this.x, this.y - 24, '护盾抵消', '#7dcfff', 13);
      return;
    }
    dmg = Math.max(1, Math.round(dmg - this.armor));
    this.hp -= dmg;
    this.iframes = 0.8;
    game.shake(4);
    this.hitIdleT = 0;
    game.burst(this.x, this.y, '#ff3d6e', 8, 120);
    game.addFloat(this.x, this.y - 22, '-' + dmg, '#ff3d6e', 15);
  }

  // ── 飞机外观随主武器及其等级进化 ──
  draw(ctx, game) {
    const lv = this.treeId ? clamp(1 + this.skills.spent.size, 1, 5) : 1;   // 外观随树成长
    const col = this.form ? this.form.color : '#4fd2ff';
    const visualId = this.treeId === 'cannon' ? this.formId
      : this.treeId === 'nova' ? (this.formId === 'base' ? 'nova' : this.formId)
      : (this.treeId || 'base');
    const blink = this.iframes > 0 && Math.floor(this.iframes * 16) % 2 === 0;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim + Math.PI / 2);   // 机头朝向瞄准方向
    if (blink) ctx.globalAlpha = 0.35;

    // 引擎尾焰：叠加发光 + 抖动焰舌（比单光晕更有推力感）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flame = (this.dashT > 0 ? 24 : 13) + lv;
    const exhausts = Sprites.playerExhausts(visualId);
    for (let i = 0; i < exhausts.length; i++) {
      const ex = exhausts[i];
      FX.energyPlume(ctx, ex.x, ex.y, flame * ex.scale, (5.5 + lv * 0.35) * ex.scale, col, this.t, i * 2.1);
    }
    ctx.restore();

    // 机体（按进化形态整机变化：脉冲机炮 / 散裂弹幕 / 贯穿磁轨）
    Sprites.player(ctx, visualId, lv, col, this.t);

    // 枪口闪光与实际子弹生成共用硬点，避免“炮弹从机身里钻出来”。
    if (this.muzzleFlashT > 0) {
      const count = this.fire?.projectiles || 1;
      const flashes = Sprites.playerMuzzles(visualId, count, lv);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const m of flashes) {
        FX.glowCircle(ctx, m.x, m.y, 7 + this.muzzleFlashT * 45, col, 0.65);
        FX.glowRing(ctx, m.x, m.y, 3 + this.muzzleFlashT * 30, '#ffffff', 0.65, 1.2);
      }
      ctx.restore();
    }

    // 一次性光盾：薄膜/剩余层轨道/方向受击裂纹分别表达状态。
    if (this.shield > 0 || this.shieldFx.hitT > 0 || this.shieldFx.chargeT > 0) {
      const charge = this.shieldFx.chargeT / this.shieldFx.chargeMax;
      FX.shieldField(ctx, 28, this.shield, this.shieldMax, this.t, charge);
      if (this.shieldFx.hitT > 0) {
        const progress = 1 - this.shieldFx.hitT / this.shieldFx.hitMax;
        FX.shieldImpact(ctx, 28, this.shieldFx.impactAngle, progress);
      }
    }

    ctx.restore();
  }
}

// ===== 敌机（Nova Drift 式霓虹几何体）=====
class Enemy {
  constructor(type, x, y, hpMul, spawnT = 0.45) {
    const d = ENEMY_DEFS[type];
    this.type = type; this.def = d;
    this.x = x; this.y = y;
    this.hp = this.maxHp = d.hp * hpMul * BALANCE.combat.enemyHpMul;
    this.r = d.r;
    this.speed = d.speed * rand(0.9, 1.1);
    this.dead = false;
    this.age = 0;
    this.hitT = 0;
    this.dot = { stacks: 0, dps: 0, time: 0 };
    // 出生传送门：淡入期间无敌不接触
    this.spawning = true; this.spawnT = spawnT;
    // 行为状态机
    this.state = 'seek'; this.stateT = 0;
    this.dashVx = 0; this.dashVy = 0; this.cool = 0;
    this.fireT = d.fireInterval ? rand(0.8, d.fireInterval) : 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.wob = rand(0, TAU);
    this.aim = 0;
    // 陨石：漂移方向（首次更新时朝玩家方向附近取）与不规则外形
    if (d.drift) {
      this.driftA = null;
      this.rot = rand(0, TAU);
      this.crag = Array.from({ length: 8 }, () => rand(0.72, 1.18));
    }
    // 弹幕家族（炮手/连射兵/散射兵）
    this.burstLeft = 0;
    this.burstT = 0;
  }

  update(dt, game) {
    const p = game.player;
    this.age += dt;
    this.hitT -= dt; this.cool -= dt;
    if (this.spawning) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) this.spawning = false;
      return;
    }

    switch (this.type) {
      case 'mite': case 'bomber': {
        const a = angleTo(this.x, this.y, p.x, p.y);
        this.x += Math.cos(a) * this.speed * dt;
        this.y += Math.sin(a) * this.speed * dt;
        break;
      }
      case 'rock': case 'rock_s': {
        // 陨石：不追踪，只沿固定方向缓慢漂移
        if (this.driftA === null) this.driftA = angleTo(this.x, this.y, p.x, p.y) + rand(-0.35, 0.35);
        this.x += Math.cos(this.driftA) * this.speed * dt;
        this.y += Math.sin(this.driftA) * this.speed * dt;
        this.rot += dt * 0.4;
        break;
      }
      case 'dasher': {
        // seek → charge(前摇发光+瞄准线) → dash(突刺) → recover
        if (this.state === 'seek') {
          const a = angleTo(this.x, this.y, p.x, p.y);
          this.x += Math.cos(a) * this.speed * dt;
          this.y += Math.sin(a) * this.speed * dt;
          this.aim = a;
          if (dist(this.x, this.y, p.x, p.y) < 280 && this.cool <= 0) { this.state = 'charge'; this.stateT = 0.65; }
        } else if (this.state === 'charge') {
          this.stateT -= dt;
          this.aim = angleTo(this.x, this.y, p.x, p.y);
          if (this.stateT <= 0) {
            this.state = 'dash'; this.stateT = 0.45;
            this.dashVx = Math.cos(this.aim) * 720; this.dashVy = Math.sin(this.aim) * 720;
          }
        } else if (this.state === 'dash') {
          this.stateT -= dt;
          this.x += this.dashVx * dt; this.y += this.dashVy * dt;
          game.particles.push(new Particle(this.x, this.y, rand(-30, 30), rand(-30, 30), 0.3, this.def.color, rand(2, 4)));
          if (this.stateT <= 0) { this.state = 'recover'; this.stateT = 0.7; this.cool = 1.4; }
        } else {
          this.stateT -= dt;
          this.x += Math.cos(this.aim) * 30 * dt; this.y += Math.sin(this.aim) * 30 * dt;
          if (this.stateT <= 0) this.state = 'seek';
        }
        break;
      }
      case 'sniper': {
        // 超远距离保距；fireT 到 0 进入 0.6s 瞄准（缓慢锁定），结束时发射高速弹
        const d = dist(this.x, this.y, p.x, p.y);
        const a = angleTo(this.x, this.y, p.x, p.y);
        let mv = 0;
        if (d > this.def.keepMax) mv = 1; else if (d < this.def.keepMin) mv = -1;
        this.x += Math.cos(a) * mv * this.speed * dt;
        this.y += Math.sin(a) * mv * this.speed * dt;
        this.x = clamp(this.x, 30, CANVAS_W - 30);
        this.y = clamp(this.y, 30, CANVAS_H - 30);
        if (this.snipeT > 0) {
          this.snipeT -= dt;
          const lock = angleTo(this.x, this.y, p.x, p.y);
          this.snipeAim += clamp(angDiff(lock, this.snipeAim), -1.6 * dt, 1.6 * dt);
          if (this.snipeT <= 0) {
            game.eBullets.push(new EnemyBullet(this.x, this.y, Math.cos(this.snipeAim) * this.def.bulletSpeed, Math.sin(this.snipeAim) * this.def.bulletSpeed, scaledEnemyDamage(this.def.bulletDmg), this.def.color));
            this.fireT = this.def.fireInterval;
          }
        } else {
          this.fireT -= dt;
          if (this.fireT <= 0) { this.snipeT = this.def.snipeTime; this.snipeAim = a; }
        }
        break;
      }
      case 'miner': {
        // 缓慢逼近玩家，周期性在身后投掷感应地雷
        const a = angleTo(this.x, this.y, p.x, p.y);
        this.x += Math.cos(a) * this.speed * dt;
        this.y += Math.sin(a) * this.speed * dt;
        this.dropT = (this.dropT === undefined ? rand(1.2, 2.4) : this.dropT) - dt;
        if (this.dropT <= 0) {
          this.dropT = this.def.dropEvery;
          game.mines.push(new Mine(this.x - Math.cos(a) * 20, this.y - Math.sin(a) * 20, this.def));
        }
        break;
      }
      case 'hive': {
        // 缓慢逼近 + 周期孵化蜂群
        const a = angleTo(this.x, this.y, p.x, p.y);
        this.x += Math.cos(a) * this.speed * dt;
        this.y += Math.sin(a) * this.speed * dt;
        this.hiveT = (this.hiveT === undefined ? rand(2, 4) : this.hiveT) - dt;
        if (this.hiveT <= 0) {
          this.hiveT = this.def.hiveEvery;
          for (let i = 0; i < this.def.hiveChildren && game.enemies.length < ENEMY_HARD_CAP; i++) {
            const sa = rand(0, TAU);
            game.enemies.push(new Enemy('mite', this.x + Math.cos(sa) * 26, this.y + Math.sin(sa) * 26, game.hpScale(), 0.2));
          }
          game.rings.push(new Ring(this.x, this.y, this.r, this.r + 40, 0.4, this.def.color, 2));
        }
        break;
      }
      case 'gunner': case 'burst': case 'scatter': {
        // 弹幕家族：保持距离环走；单发 / 串射 / 散射
        const d = dist(this.x, this.y, p.x, p.y);
        const a = angleTo(this.x, this.y, p.x, p.y);
        let mv = 0;
        if (d > 330) mv = 1; else if (d < 240) mv = -1;
        this.x += (Math.cos(a) * mv + Math.cos(a + Math.PI / 2) * this.strafeDir * 0.7) * this.speed * dt;
        this.y += (Math.sin(a) * mv + Math.sin(a + Math.PI / 2) * this.strafeDir * 0.7) * this.speed * dt;
        if (this.x < 30 || this.x > CANVAS_W - 30) this.strafeDir *= -1;
        if (this.burstLeft > 0) {
          // 串射：逐发间隔击发
          this.burstT -= dt;
          if (this.burstT <= 0) {
            this.burstT = this.def.burstGap || 0.13;
            this.burstLeft--;
            this.fireAimed(game, 0);
          }
        } else {
          this.fireT -= dt;
          if (this.fireT <= 0) {
            const n = this.def.shots;
            if (n > 1 && this.def.fan) {
              // 散射：一次扇形五连
              for (let i = 0; i < n; i++) this.fireAimed(game, (i - (n - 1) / 2) * (this.def.fan / n) * 2);
              this.fireT = this.def.fireInterval;
              game.rings.push(new Ring(this.x, this.y, this.r, this.r + 26, 0.3, this.def.color, 2));
            } else if (n > 1) {
              this.burstLeft = n; this.burstT = 0;   // 串射启动
              this.fireT = this.def.fireInterval;    // 立即重置冷却（修复连成一条线的 bug）
            } else {
              this.fireAimed(game, 0);               // 单发
              this.fireT = this.def.fireInterval;
            }
          }
        }
        break;
      }
      default: { // bastion：缓慢逼近
        const a = angleTo(this.x, this.y, p.x, p.y);
        this.x += Math.cos(a) * this.speed * dt;
        this.y += Math.sin(a) * this.speed * dt;
      }
    }

    // 腐蚀 DoT
    if (this.dot.stacks > 0) {
      this.dot.time -= dt;
      this.hurt(this.dot.dps * this.dot.stacks * dt, game, false);
      if (this.dot.time <= 0) this.dot = { stacks: 0, dps: 0, time: 0 };
    }

    // 飞出屏幕清理
    if (this.age > 3 && (this.y > CANVAS_H + 90 || this.y < -180 || this.x < -90 || this.x > CANVAS_W + 90)) this.dead = true;
  }

  fireAimed(game, offset) {
    const a = angleTo(this.x, this.y, game.player.x, game.player.y) + (offset || 0);
    game.eBullets.push(new EnemyBullet(this.x, this.y, Math.cos(a) * this.def.bulletSpeed, Math.sin(a) * this.def.bulletSpeed, scaledEnemyDamage(this.def.bulletDmg), this.def.color));
  }

  // 统一命中区接口：普通敌机只有核心区，长条 Boss 可覆写为多个区域。
  getHitZones() { return [{ x: this.x, y: this.y, r: this.r, damageMul: 1, kind: 'core' }]; }

  circleHit(x, y, r = 0) {
    let best = null, bestD = Infinity;
    for (const zone of this.getHitZones()) {
      const d = dist2(x, y, zone.x, zone.y), rr = r + zone.r;
      if (d < rr * rr && d < bestD) { best = zone; bestD = d; }
    }
    return best;
  }

  segmentHit(x1, y1, x2, y2, padding = 0) {
    let best = null, bestD = Infinity;
    for (const zone of this.getHitZones()) {
      const d = distToSeg(zone.x, zone.y, x1, y1, x2, y2);
      if (d < padding + zone.r && d < bestD) { best = zone; bestD = d; }
    }
    return best;
  }

  hurt(dmg, game, showNum) {
    if (this.dead || this.spawning) return;
    this.hp -= dmg;
    this.hitT = 0.08;
    if (showNum && dmg >= 1) game.addFloat(this.x + rand(-6, 6), this.y - this.r - 4, Math.round(dmg), '#fff', 11);
    if (this.hp <= 0) { this.dead = true; game.onEnemyKilled(this); }
  }

  draw(ctx, game) {
    const k = this.spawning ? clamp(1 - this.spawnT / 0.45, 0.15, 1) : 1;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = k;
    // 掠袭者蓄力前摇：瞄准线（不随身体旋转）
    if (this.type === 'dasher' && this.state === 'charge') {
      const prog = 1 - this.stateT / 0.65;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(this.aim) * 300, Math.sin(this.aim) * 300);
      ctx.strokeStyle = hexA(this.def.color, 0.15 + 0.45 * prog);
      ctx.lineWidth = 1 + prog * 2; ctx.stroke();
    }
    // 朝向玩家旋转（陨石只自转）
    if (this.type === 'rock' || this.type === 'rock_s') ctx.rotate(this.rot || 0);
    else if (this.type === 'dasher' && (this.state === 'charge' || this.state === 'dash')) ctx.rotate(this.aim - Math.PI / 2);
    else if (game) ctx.rotate(angleTo(this.x, this.y, game.player.x, game.player.y) - Math.PI / 2);
    const charge = this.type === 'dasher' && this.state === 'charge' && Math.floor(this.stateT * 12) % 2 === 0;
    Sprites.enemy(ctx, this.type, this.r, this.hitT > 0 ? '#ffffff' : this.def.color, performance.now() / 1000,
      { crag: this.crag, charge });
    ctx.restore();
    // 腐蚀层数指示
    if (this.dot.stacks > 0) {
      const shown = Math.min(8, this.dot.stacks), rr = this.r + 4;
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.age * 0.7);
      for (let i = 0; i < shown; i++) {
        const a0 = i / shown * TAU, a1 = a0 + TAU / shown * 0.55;
        ctx.beginPath(); ctx.arc(0, 0, rr, a0, a1);
        ctx.strokeStyle = hexA('#8dff5d', 0.45 + 0.45 * Math.min(1, this.dot.stacks / 8));
        ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
    }
    // 出生传送门环
    if (this.spawning) {
      const kk = clamp(1 - this.spawnT / 0.45, 0, 1);
      FX.glowRing(ctx, this.x, this.y, this.r + 18 * (1 - kk), this.def.color, kk, 2);
    }
  }

}

// ===== 星蚀龙 Boss =====
// 龙头使用受限转向追逐环绕目标；身体按头部历史轨迹的弧长等距采样。
// 因此运动与帧率无关，也不会出现“每节独立追踪”造成的橡皮筋抖动。
class DragonBoss extends Enemy {
  constructor(x, y, hpMul = 1) {
    super('dragon', x, y, hpMul, 1.1);
    this.heading = 0;
    this.cruiseSpeed = this.def.speed;
    this.turnRate = 1.15;
    this.orbitPhase = rand(0, TAU);
    this.trail = Array.from({ length: 100 }, (_, i) => ({ x: x - i * 4, y }));
    this.bodyPoints = [];
    this.segmentCount = 11;
    this.segmentSpacing = 27;
    this.fireT = 2.2;
    this.bodyFireT = 1.0;
    this.bodyGunIndex = 0;
    this.bodyShotsFired = 0;
    this.phase = 'orbit';
    this.phaseStage = 'active';
    this.phaseT = this.def.orbitDuration;
    this.attackAim = 0;
    this.breathClock = 0;
    this.breathHitT = 0;
  }

  update(dt, game) {
    this.age += dt;
    this.hitT -= dt;
    this.breathHitT -= dt;
    if (this.spawning) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) this.spawning = false;
    }

    const p = game.player;
    if (!this.spawning) this.phaseT -= dt;

    if (this.phase === 'orbit') {
      this.orbitPhase += dt * 0.34;
      const targetX = clamp(p.x + Math.cos(this.orbitPhase) * 330, 90, CANVAS_W - 90);
      const targetY = clamp(p.y + Math.sin(this.orbitPhase * 1.35) * 220, 85, CANVAS_H - 85);
      this.steerTo(targetX, targetY, this.turnRate, dt);
      this.moveAlong(this.cruiseSpeed * (0.92 + Math.sin(this.age * 1.4) * 0.08), dt);
      if (this.phaseT <= 0) {
        this.phase = 'assault'; this.phaseStage = 'telegraph';
        this.phaseT = this.def.assaultTelegraph;
        this.attackAim = angleTo(this.x, this.y, p.x, p.y);
      }
    } else if (this.phase === 'assault') {
      if (this.phaseStage === 'telegraph') {
        this.attackAim = angleTo(this.x, this.y, p.x, p.y);
        this.heading += clamp(angDiff(this.attackAim, this.heading), -2.7 * dt, 2.7 * dt);
        this.moveAlong(24, dt);
        if (this.phaseT <= 0) {
          this.phaseStage = 'dash'; this.phaseT = this.def.assaultDuration; this.heading = this.attackAim;
          game.rings.push(new Ring(this.x, this.y, 18, 58, 0.28, '#ffcf63', 3));
        }
      } else {
        this.moveAlong(this.def.assaultSpeed, dt);
        if (Math.random() < 0.7) game.particles.push(new Particle(this.x, this.y, rand(-60, 60), rand(-60, 60), 0.28, this.def.color, rand(2, 5)));
        if (this.phaseT <= 0) {
          this.phase = 'breath'; this.phaseStage = 'windup';
          this.phaseT = this.def.breathWindup; this.attackAim = angleTo(this.x, this.y, p.x, p.y);
        }
      }
    } else if (this.phaseStage === 'windup') {
      this.attackAim = angleTo(this.x, this.y, p.x, p.y);
      this.heading += clamp(angDiff(this.attackAim, this.heading), -1.8 * dt, 1.8 * dt);
      this.moveAlong(20, dt);
      if (this.phaseT <= 0) {
        this.phaseStage = 'active'; this.phaseT = this.def.breathDuration; this.breathClock = 0;
        game.shake(7);
      }
    } else {
      this.breathClock += dt;
      const a = this.attackAim + Math.sin(this.breathClock * 2.4) * 0.16;
      this.heading += clamp(angDiff(a, this.heading), -0.75 * dt, 0.75 * dt);
      this.moveAlong(14, dt);
      this.emitBreath(game, a);
      if (this.phaseT <= 0) {
        this.phase = 'orbit'; this.phaseStage = 'active'; this.phaseT = this.def.orbitDuration;
        this.orbitPhase = Math.atan2(this.y - p.y, this.x - p.x);
      }
    }

    this.recordTrail();
    this.bodyPoints = [];
    for (let i = 1; i <= this.segmentCount; i++) this.bodyPoints.push(this.sampleTrail(i * this.segmentSpacing));

    if (!this.spawning && this.phase === 'orbit') {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.def.fireInterval;
        const aim = angleTo(this.x, this.y, p.x, p.y);
        for (const off of [-0.16, 0, 0.16]) {
          const a = aim + off;
          game.eBullets.push(new EnemyBullet(this.x, this.y, Math.cos(a) * this.def.bulletSpeed, Math.sin(a) * this.def.bulletSpeed, scaledEnemyDamage(this.def.bulletDmg), this.def.color));
        }
        game.rings.push(new Ring(this.x, this.y, 8, 42, 0.3, this.def.color, 2));
      }
      this.bodyFireT -= dt;
      if (this.bodyFireT <= 0 && this.bodyPoints.length) {
        this.bodyFireT = this.def.bodyFireInterval;
        const indices = [1, 4, 7, 10];
        const point = this.bodyPoints[indices[this.bodyGunIndex++ % indices.length]];
        const aim = angleTo(point.x, point.y, p.x, p.y);
        for (const off of [-0.11, 0.11]) {
          const a = aim + off;
          game.eBullets.push(new EnemyBullet(point.x, point.y, Math.cos(a) * 210, Math.sin(a) * 210, scaledEnemyDamage(7), '#ff7691'));
          this.bodyShotsFired++;
        }
        game.rings.push(new Ring(point.x, point.y, 5, 25, 0.25, '#ff7691', 2));
      }
    }

    if (this.dot.stacks > 0) {
      this.dot.time -= dt;
      this.hurt(this.dot.dps * this.dot.stacks * dt, game, false);
      if (this.dot.time <= 0) this.dot = { stacks: 0, dps: 0, time: 0 };
    }
  }

  steerTo(x, y, rate, dt) {
    const desired = angleTo(this.x, this.y, x, y);
    this.heading += clamp(angDiff(desired, this.heading), -rate * dt, rate * dt);
  }

  moveAlong(speed, dt) {
    this.x += Math.cos(this.heading) * speed * dt;
    this.y += Math.sin(this.heading) * speed * dt;
  }

  emitBreath(game, angle) {
    const mouthX = this.x + Math.cos(angle) * 30, mouthY = this.y + Math.sin(angle) * 30;
    const endX = mouthX + Math.cos(angle) * this.def.breathRange;
    const endY = mouthY + Math.sin(angle) * this.def.breathRange;
    game.dragonBreaths.push({ x1: mouthX, y1: mouthY, x2: endX, y2: endY, width: this.def.breathWidth, t: this.breathClock, color: this.def.color });
    if (this.breathHitT <= 0 && distToSeg(game.player.x, game.player.y, mouthX, mouthY, endX, endY) < this.def.breathWidth + game.player.radius) {
      this.breathHitT = 0.65;
      game.player.hurt(scaledEnemyDamage(this.def.breathDmg), game, this);
    }
    if (Math.floor(this.breathClock * 20) % 3 === 0) game.shake(1.2);
  }

  getHitZones() {
    const zones = [{ x: this.x, y: this.y, r: this.r, damageMul: 1, kind: 'head' }];
    for (let i = 0; i < this.bodyPoints.length; i++) {
      const point = this.bodyPoints[i];
      zones.push({ x: point.x, y: point.y, r: Math.max(10, 18 - i * 0.55), damageMul: this.def.bodyDamageMul, kind: 'body' });
    }
    return zones;
  }

  recordTrail() {
    const previousHead = this.trail[0];
    this.trail[0] = { x: this.x, y: this.y };
    // 第 0 点永远是实时头部；历史锚点与头部相距 4px 时，把上一帧头部插入轨迹。
    // 不能只比较“当前帧与上一帧”，否则 60FPS 下单帧位移不足 4px，轨迹将永远不增长。
    const firstAnchor = this.trail[1];
    if (!firstAnchor || dist(firstAnchor.x, firstAnchor.y, this.x, this.y) >= 4) {
      this.trail.splice(1, 0, previousHead);
    }
    if (this.trail.length > 520) this.trail.length = 520;
  }

  sampleTrail(wanted) {
    let walked = 0;
    for (let i = 1; i < this.trail.length; i++) {
      const near = this.trail[i - 1], far = this.trail[i];
      const len = dist(near.x, near.y, far.x, far.y);
      if (len <= 0.001) continue;
      if (walked + len >= wanted) {
        const k = (wanted - walked) / len;
        return {
          x: near.x + (far.x - near.x) * k,
          y: near.y + (far.y - near.y) * k,
          angle: Math.atan2(near.y - far.y, near.x - far.x),
        };
      }
      walked += len;
    }
    const tail = this.trail[this.trail.length - 1];
    return { x: tail.x, y: tail.y, angle: this.heading };
  }

  draw(ctx) {
    Sprites.dragon(ctx, this, performance.now() / 1000);
    if (this.spawning) {
      const k = clamp(1 - this.spawnT / 1.1, 0, 1);
      FX.glowRing(ctx, this.x, this.y, 70 - k * 34, this.def.color, k, 3);
    }
  }
}

// ===== 玩家子弹（荧光弹：光晕 + 拖尾流光）=====
class Bullet {
  constructor(x, y, vx, vy, dmg, r, pierce, color, opts = {}) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.r = r; this.pierce = pierce;
    this.color = color; this.hits = new Set(); this.dead = false;
    this.life = 2;
    // 特殊效果（蜂巢技能树）
    this.splash = opts.splashR || 0; this.splashMul = opts.splashMul ?? 0.35;
    this.ricochet = opts.ricochet || 0; this.ricochetMul = opts.ricochetMul ?? 0.6;
    this.frag = opts.frag || 0; this.fragDone = false;
    this.homing = !!opts.homing;
    this.homingRange = opts.homingRange || 320;
    this.homingTurn = opts.homingTurn || 3;
    this.homingProximity = opts.homingProximity || 0;   // >0 时：敌机进入此半径才武装追踪
    this.homingSpeed = opts.homingSpeed || 0;
    this.homingAccel = opts.homingAccel || 0;
    this.ownerAttackId = opts.ownerAttackId || null;
    this.homeTarget = null;
    this.explosiveR = opts.explosiveR || 0;
    this.knockback = opts.knockback || 0;
    this.chain = opts.chain || 0;
    this.kind = opts.kind || 'normal';
    this.vis = opts.vis || 'comet';
    // DOT 弹在发射时冻结层数与倍率，避免命中前切形态或回血导致结果漂移。
    this.corrosion = opts.corrosion || null;
    this.corrosionRadius = opts.corrosionRadius || 0;
  }
  applyCorrosionTo(enemy) {
    if (!this.corrosion || !enemy || enemy.dead || !enemy.dot) return false;
    const c = this.corrosion, dot = enemy.dot;
    dot.dps = dot.stacks === 0 ? c.layerDps : Math.max(dot.dps, c.layerDps);
    dot.stacks = Math.min(c.maxStacks, dot.stacks + c.stacks);
    dot.time = c.duration;
    return true;
  }
  update(dt, game) {
    // 蜂群制导：轻微转向最近敌机
    if (this.homing && game && game.nearestEnemy) {
      // 近距武装：敌机靠近子弹时才锁定并追踪；锁定后跟到目标死亡为止
      if (!this.homeTarget || this.homeTarget.dead) {
        this.homeTarget = game.nearestEnemy(this.x, this.y, this.homingProximity || this.homingRange);
      }
      if (this.homeTarget && !this.homeTarget.dead) {
        const t = this.homeTarget;
        const want = angleTo(this.x, this.y, t.x, t.y);
        const cur = Math.atan2(this.vy, this.vx);
        const turn = clamp(angDiff(want, cur), -this.homingTurn * dt, this.homingTurn * dt);
        let sp = Math.hypot(this.vx, this.vy);
        if (this.homingSpeed && this.homingAccel) sp = Math.min(this.homingSpeed, sp + this.homingAccel * dt);
        const na = cur + turn;
        this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
      }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 || this.y < -30 || this.y > CANVAS_H + 30 || this.x < -30 || this.x > CANVAS_W + 30) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const ang = Math.atan2(this.vy, this.vx);
    Sprites.bullet(ctx, this.vis || this.kind, this.r, this.color, ang, performance.now() / 1000);
    ctx.restore();
  }
}

// ===== 敌机荧光弹 =====
class EnemyBullet {
  constructor(x, y, vx, vy, dmg, color = '#ff5d7e') {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = 5; this.dmg = dmg; this.color = color;
    this.dead = false; this.life = 6; this.t = rand(0, TAU);
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.t += dt * 10;
    this.life -= dt;
    if (this.life <= 0 || this.y < -30 || this.y > CANVAS_H + 30 || this.x < -30 || this.x > CANVAS_W + 30) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    Sprites.enemyBullet(ctx, this.r, this.color, this.t);
    ctx.restore();
  }
}

// ===== 经验晶体 =====
class Gem {
  constructor(x, y, v) {
    this.x = x; this.y = y; this.v = v;
    const a = rand(0, TAU), s = rand(40, 120);
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
    this.dead = false; this.t = 0;
  }
  update(dt, game) {
    this.t += dt;
    const p = game.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (d < p.pickupRange) {
      const sp = 320 + (p.pickupRange - d) * 4;
      this.x += (p.x - this.x) / d * sp * dt;
      this.y += (p.y - this.y) / d * sp * dt;
      if (d < 16) { this.dead = true; game.gainXP(this.v); }
    } else {
      this.vx *= 0.92; this.vy *= 0.92;
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
  }
  draw(ctx) {
    const s = this.v > 1 ? 6 : 4;
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.t * 3);
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath();
    ctx.fillStyle = this.v > 1 ? '#ffb35d' : '#4fd2ff'; ctx.fill();
    ctx.restore();
    FX.glowCircle(ctx, this.x, this.y, s * 2.5, this.v > 1 ? '#ffb35d' : '#4fd2ff', 0.5);
  }
}

// ===== 等离子尾迹段 =====
class TrailSeg {
  constructor(x, y, r, life, dps, color) {
    this.x = x; this.y = y; this.r = r;
    this.life = this.maxLife = life;
    this.dps = dps; this.color = color;
    this.dead = false;
  }
  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    for (const e of game.enemies) {
      if (e.dead || e.spawning) continue;
      const zone = e.circleHit(this.x, this.y, this.r);
      if (zone) e.hurt(this.dps * dt * zone.damageMul, game, false);
    }
  }
  draw(ctx) {
    const k = this.life / this.maxLife;
    FX.glowCircle(ctx, this.x, this.y, this.r * (0.9 + 0.5 * k), this.color, 0.16 * k);
  }
}

// ===== 粒子 =====
class Particle {
  constructor(x, y, vx, vy, life, color, r) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = this.maxLife = life; this.color = color; this.r = r;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 0.94; this.vy *= 0.94;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.beginPath(); ctx.arc(this.x, this.y, Math.max(0.5, this.r * this.life / this.maxLife), 0, TAU);
    ctx.fillStyle = hexA(this.color, 0.85 * this.life / this.maxLife); ctx.fill();
  }
}

// ===== 飘字 =====
class FloatText {
  constructor(x, y, text, color, size) {
    this.x = x; this.y = y; this.text = text; this.color = color; this.size = size || 12;
    this.life = 0.7; this.dead = false;
  }
  update(dt) { this.y -= 42 * dt; this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(ctx) {
    ctx.font = `bold ${this.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = hexA(this.color, Math.min(1, this.life / 0.5));
    ctx.fillText(this.text, this.x, this.y);
  }
}

// ===== 感应地雷（布雷者投放）=====
class Mine {
  constructor(x, y, def) {
    this.x = x; this.y = y;
    this.armT = def.mineArm; this.life = def.mineLife;
    this.r = 9; this.triggerR = def.mineR; this.dmg = def.mineDmg;
    this.t = rand(0, TAU); this.dead = false;
  }
  update(dt, game) {
    this.t += dt; this.armT -= dt; this.life -= dt;
    if (this.life <= 0) return this.detonate(game);
    if (this.armT <= 0) {
      const p = game.player;
      if (dist2(this.x, this.y, p.x, p.y) < (this.triggerR + p.radius) ** 2) this.detonate(game);
    }
  }
  detonate(game) {
    if (this.dead) return;
    this.dead = true;
    game.explosionHostile(this.x, this.y, 70, this.dmg, '#ff6b4d');
  }
  draw(ctx) {
    const blink = this.armT > 0 ? 0.4 : (Math.floor(this.t * 6) % 2 ? 0.95 : 0.45);
    ctx.save(); ctx.translate(this.x, this.y);
    FX.glowCircle(ctx, 0, 0, this.r * (this.armT > 0 ? 1.4 : 1.9), '#ff6b4d', 0.5 * blink);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      const px = Math.cos(a) * this.r * 0.85, py = Math.sin(a) * this.r * 0.85;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#241012'; ctx.fill();
    ctx.strokeStyle = hexA('#ff6b4d', blink); ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, this.r * 0.25, 0, TAU);
    ctx.fillStyle = hexA('#ff6b4d', blink); ctx.fill();
    ctx.restore();
  }
}
