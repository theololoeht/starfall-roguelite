// Game 子系统：技能树/表现辅助通过 prototype composition 接入。
class GameEffectsSystem {
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
}
