// Game 子系统：通过 prototype composition 接入，保持原生脚本零构建运行。
class GameCollisionSystem {
  collide() {
    const p = this.player;
    // 玩家子弹 → 敌机（含技能树特殊效果结算）
    for (const b of this.pBullets) {
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || e.spawning || b.hits.has(e)) continue;
        const zone = e.circleHit(b.x, b.y, b.r);
        if (!zone) continue;
        b.hits.add(e);
        e.hurt(b.dmg * zone.damageMul, this, true);
        b.applyCorrosionTo(e, this);
        if (b.sporeCloud) {
          const cloud = b.sporeCloud;
          spawnSporeCloud(this, b.x, b.y, cloud, b.color);
          this.rings.push(new Ring(b.x, b.y, 5, cloud.radius, 0.32, b.color, 2));
          this.burst(b.x, b.y, b.color, 9, 150);
          b.dead = true;
          break;
        }
        // 裂孢弹头只传播腐蚀层，不复制直伤；防止密集敌群中伤害指数膨胀。
        if (b.corrosionRadius) {
          for (const e2 of this.enemies) {
            if (e2 === e || e2.dead || e2.spawning) continue;
            if (e2.circleHit(b.x, b.y, b.corrosionRadius)) b.applyCorrosionTo(e2, this);
          }
          this.rings.push(new Ring(b.x, b.y, 4, b.corrosionRadius, 0.2, b.color, 1.5));
        }
        if (b.knockback && !e.def?.boss) {
          const ka = Math.atan2(b.vy, b.vx);
          e.x += Math.cos(ka) * b.knockback; e.y += Math.sin(ka) * b.knockback;
        }
        this.burst(b.x, b.y, b.color, 2, 110);
        // 溅射（过载弹芯）
        if (b.splash) {
          for (const e2 of this.enemies) {
            if (e2 === e || e2.dead || e2.spawning) continue;
            const splashZone = e2.circleHit(b.x, b.y, b.splash);
            if (splashZone) e2.hurt(b.dmg * b.splashMul * splashZone.damageMul, this, false);
          }
          this.rings.push(new Ring(b.x, b.y, 4, b.splash, 0.22, b.color, 2));
        }
        // 爆裂弹（烈性爆裂）
        if (b.explosiveR) {
          this.explosion(b.x, b.y, b.explosiveR, b.dmg * 1.5, b.color);
          b.dead = true; break;
        }
        // 碎裂（碎裂弹幕）：碎成 2 枚追踪碎片
        if (b.frag && !b.fragDone) {
          b.fragDone = true;
          const base = Math.atan2(b.vy, b.vx);
          for (let k = 0; k < b.frag; k++) {
            const a = base + Math.PI / 2 + (k === 0 ? -1 : 1) * rand(0.3, 0.9);
            this.pBullets.push(new Bullet(b.x, b.y, Math.cos(a) * 300, Math.sin(a) * 300, b.dmg * 0.25, 2.5, 1, b.color, { homing: true }));
          }
        }
        // 链式闪电（湮灭磁轨）
        if (b.chain) {
          let jumps = 0;
          const near = this.enemies
            .filter(e2 => e2 !== e && !e2.dead && !e2.spawning && dist(e.x, e.y, e2.x, e2.y) < 150)
            .sort((a, c) => dist(e.x, e.y, a.x, a.y) - dist(e.x, e.y, c.x, c.y));
          for (const e2 of near) {
            if (jumps >= b.chain) break;
            jumps++;
            e2.hurt(b.dmg * 0.4, this, false);
            this.zaps.push({ x1: e.x, y1: e.y, x2: e2.x, y2: e2.y, life: 0.12, color: b.color });
          }
        }
        b.pierce--;
        if (b.pierce <= 0) {
          // 弹射（弹射机制/弹幕风暴）：转向最近的未命中敌机
          if (b.ricochet > 0) {
            let t2 = null, bd = 240 * 240;
            for (const e2 of this.enemies) {
              if (e2.dead || e2.spawning || b.hits.has(e2)) continue;
              const dd = dist2(b.x, b.y, e2.x, e2.y);
              if (dd < bd) { bd = dd; t2 = e2; }
            }
            if (t2) {
              b.ricochet--;
              b.dmg *= b.ricochetMul;
              const sp = Math.hypot(b.vx, b.vy);
              const a = angleTo(b.x, b.y, t2.x, t2.y);
              b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
              b.pierce = 1;
              this.rings.push(new Ring(b.x, b.y, 2, 14, 0.2, b.color, 2));
              continue;
            }
          }
          b.dead = true; break;
        }
      }
    }
    // 敌机接触 → 玩家受伤，同时玩家机体撞击也对敌机造成碰撞伤害并互相推开
    if (p.iframes <= 0 && p.dashT <= 0) {
      for (const e of this.enemies) {
        if (e.dead || e.spawning) continue;
        const zone = e.circleHit(p.x, p.y, p.radius);
        if (zone) {
          const a = angleTo(p.x, p.y, zone.x, zone.y);
          e.hurt(Math.round((10 + zone.r) * p.dmgMul) * zone.damageMul, this, true);
          e.x += Math.cos(a) * 20; e.y += Math.sin(a) * 20;            // 敌机被撞开
          p.x -= Math.cos(a) * 7; p.y -= Math.sin(a) * 7;              // 玩家反冲
          this.burst((p.x + zone.x) / 2, (p.y + zone.y) / 2, '#ffffff', 5, 130);
          p.hurt(scaledEnemyDamage(e.def.dmg), this, e);
          break;
        }
      }
    }
    // 敌机子弹 → 玩家
    for (const b of this.eBullets) {
      if (b.dead) continue;
      const rr = b.r + p.radius;
      if (dist2(b.x, b.y, p.x, p.y) < rr * rr) { b.dead = true; p.hurt(b.dmg, this, b); }
    }
  }

  nearestEnemy(x, y, range = Infinity, exclude = null) {
    let best = null, bd = range * range;
    for (const e of this.enemies) {
      if (e.dead || e.spawning || e === exclude) continue;
      if (!e.def?.boss && (e.x < -12 || e.x > this.W + 12 || e.y < -12 || e.y > this.H + 12)) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
}
