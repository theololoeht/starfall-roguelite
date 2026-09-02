// ===== FX：霓虹荧光特效层 =====
// 所有发光元素在 'lighter' 叠加混合下绘制，营造 Nova Drift 式荧光矢量感。

const FX = {
  _cache: {},
  // 预渲染光晕精灵（每种颜色只画一次，避免每帧 createRadialGradient）
  sprite(color) {
    let s = FX._cache[color];
    if (!s) {
      s = document.createElement('canvas');
      s.width = s.height = 64;
      const g = s.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, hexA(color, 0.55));
      grad.addColorStop(0.35, hexA(color, 0.25));
      grad.addColorStop(1, hexA(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      FX._cache[color] = s;
    }
    return s;
  },
  // 径向光晕 + 白热核心
  glowCircle(ctx, x, y, r, color, alpha = 1) {
    const s = FX.sprite(color);
    ctx.globalAlpha = alpha;
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * alpha).toFixed(3) + ')';
    ctx.fill();
  },
  // 描边光环
  glowRing(ctx, x, y, r, color, alpha, lineW = 3) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.strokeStyle = hexA(color, 0.25 * alpha); ctx.lineWidth = lineW * 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.strokeStyle = hexA(color, 0.9 * alpha); ctx.lineWidth = lineW; ctx.stroke();
  },

  // Canvas 2D 版“域扭曲尾焰”：用多层摆动轮廓模拟 shader 中的噪声火焰。
  energyPlume(ctx, x, y, length, width, color, t, phase = 0) {
    const wobble = Math.sin(t * 27 + phase) * width * 0.28;
    ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = 'lighter';
    const layers = [
      { w: 1.35, l: 1.1, fill: hexA(color, 0.12) },
      { w: 0.82, l: 0.82, fill: hexA(color, 0.42) },
      { w: 0.34, l: 0.58, fill: 'rgba(255,255,255,.78)' },
    ];
    for (let i = 0; i < layers.length; i++) {
      const q = layers[i], ww = width * q.w, ll = length * q.l;
      const drift = wobble * (1 - i * 0.22);
      ctx.beginPath(); ctx.moveTo(-ww / 2, 0);
      ctx.bezierCurveTo(-ww * 0.48, ll * 0.28, drift - ww * 0.2, ll * 0.7, drift, ll);
      ctx.bezierCurveTo(drift + ww * 0.2, ll * 0.7, ww * 0.48, ll * 0.28, ww / 2, 0);
      ctx.closePath(); ctx.fillStyle = q.fill; ctx.fill();
    }
    FX.glowCircle(ctx, 0, 1, width * 1.15, color, 0.55);
    ctx.restore();
  },

  // 分段蓄能环：低亮外圈负责预警，亮段显示蓄力进度和旋转方向。
  telegraphRing(ctx, x, y, r, color, progress, t, segments = 12) {
    const k = clamp(progress, 0, 1), rot = t * 1.8;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < segments; i++) {
      const a0 = i / segments * TAU, a1 = a0 + TAU / segments * 0.58;
      const on = i < Math.ceil(k * segments);
      ctx.beginPath(); ctx.arc(0, 0, r + (on ? Math.sin(t * 8 + i) * 1.5 : 0), a0, a1);
      ctx.strokeStyle = hexA(on ? '#ffffff' : color, on ? 0.72 : 0.18 + k * 0.18);
      ctx.lineWidth = on ? 2.2 : 1.2; ctx.stroke();
    }
    FX.glowRing(ctx, 0, 0, r, color, 0.18 + k * 0.45, 2);
    ctx.restore();
  },

  // 相位刃：只画刀口与能量外晕，不填满整块扇区，保证敌弹仍然可读。
  arcBlade(ctx, x, y, r, a0, a1, color, alpha = 1, width = 7, ccw = false) {
    ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1, ccw);
    ctx.strokeStyle = hexA(color, 0.16 * alpha); ctx.lineWidth = width * 3.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1, ccw);
    ctx.strokeStyle = hexA(color, 0.72 * alpha); ctx.lineWidth = width; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1, ccw);
    ctx.strokeStyle = hexA('#ffffff', 0.92 * alpha); ctx.lineWidth = Math.max(1.2, width * 0.22); ctx.stroke();
    ctx.restore();
  },

  // 连续焰刃：局部 +x 为喷射方向，三层贝塞尔轮廓与判定线段共用 length/width。
  flameBlade(ctx, x, y, angle, length, width, color, t, alpha = 1) {
    const wob = Math.sin(t * 18) * width * 0.09;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalCompositeOperation = 'lighter';
    const layers = [
      { len: 1.0, wid: 1.25, fill: hexA('#8dff5d', 0.12 * alpha), tip: wob },
      { len: 0.92, wid: 0.78, fill: hexA(color, 0.48 * alpha), tip: -wob * 0.65 },
      { len: 0.76, wid: 0.26, fill: hexA('#ffffff', 0.82 * alpha), tip: wob * 0.3 },
    ];
    for (const q of layers) {
      const L = length * q.len, W = width * q.wid;
      ctx.beginPath(); ctx.moveTo(8, -W * 0.5);
      ctx.bezierCurveTo(L * 0.3, -W * 0.62, L * 0.7, -W * 0.2 + q.tip, L, q.tip);
      ctx.bezierCurveTo(L * 0.7, W * 0.2 + q.tip, L * 0.3, W * 0.62, 8, W * 0.5);
      ctx.closePath(); ctx.fillStyle = q.fill; ctx.fill();
    }
    FX.glowCircle(ctx, 9, 0, width * 0.62, color, 0.48 * alpha);
    ctx.restore();
  },

  // 雾粒没有白热弹芯：大软晕表达体积，小色核仅用于显示漂移方向。
  mistMote(ctx, x, y, r, color, alpha, t, phase = 0) {
    const pulse = 0.9 + Math.sin(t * 3.2 + phase) * 0.12;
    const rr = r * pulse, sprite = FX.sprite(color);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.48;
    ctx.drawImage(sprite, x - rr * 2.2, y - rr * 2.2, rr * 4.4, rr * 4.4);
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, rr * 0.22), 0, TAU);
    ctx.fillStyle = hexA(color, 0.42); ctx.fill();
    ctx.restore();
  },

  // 一次性光盾：常驻薄膜负责可读性，分段轨道显示剩余层数。
  shieldField(ctx, r, layers, maxLayers, t, chargePulse = 0) {
    const breathe = 0.5 + 0.5 * Math.sin(t * 2.8);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = hexA('#4fa8ff', 0.035 + breathe * 0.025 + chargePulse * 0.08); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.strokeStyle = hexA('#bfe8ff', 0.18 + breathe * 0.12 + chargePulse * 0.35);
    ctx.lineWidth = 1.1 + chargePulse * 1.6; ctx.stroke();
    for (let i = 0; i < layers; i++) {
      const slots = Math.max(1, maxLayers), a0 = t * 0.75 + i * TAU / slots;
      ctx.beginPath(); ctx.arc(0, 0, r + 3, a0, a0 + TAU / slots * 0.58);
      ctx.strokeStyle = hexA(i === layers - 1 ? '#ffffff' : '#7dcfff', 0.48 + chargePulse * 0.35);
      ctx.lineWidth = 2.2; ctx.stroke();
    }
    ctx.restore();
  },

  // 受击方向出现高亮偏转面与裂纹，明确表达“这一击已被消耗”。
  shieldImpact(ctx, r, angle, progress) {
    const life = clamp(1 - progress, 0, 1), spread = 0.72 + progress * 0.35;
    ctx.save(); ctx.rotate(angle); ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(0, 0, r + 2 + progress * 8, -spread, spread);
    ctx.strokeStyle = hexA('#ffffff', life * 0.9); ctx.lineWidth = 5 * life + 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r + 7 + progress * 15, -spread * 0.8, spread * 0.8);
    ctx.strokeStyle = hexA('#7dcfff', life * 0.52); ctx.lineWidth = 9 * life; ctx.stroke();
    for (const off of [-0.42, 0, 0.42]) {
      ctx.beginPath(); ctx.moveTo(Math.cos(off) * (r - 4), Math.sin(off) * (r - 4));
      ctx.lineTo(Math.cos(off * 1.35) * (r + 12 + progress * 12), Math.sin(off * 1.35) * (r + 12 + progress * 12));
      ctx.strokeStyle = hexA('#dff7ff', life * 0.72); ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.restore();
  },

  // 命中裂口沿刀弧切线出现，用于区分近战斩击与普通圆形爆炸。
  slashMark(ctx, x, y, angle, color, alpha = 1, size = 18) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.moveTo(-size * 0.5, 0); ctx.lineTo(size * 0.5, 0);
    ctx.strokeStyle = hexA(color, 0.32 * alpha); ctx.lineWidth = 7; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-size * 0.5, 0); ctx.lineTo(size * 0.5, 0);
    ctx.strokeStyle = hexA('#ffffff', 0.9 * alpha); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  },
};

// 扩散冲击波环
class Ring {
  constructor(x, y, r0, r1, life, color, lineW = 4) {
    this.x = x; this.y = y; this.r0 = r0; this.r1 = r1;
    this.life = this.maxLife = life; this.color = color; this.lineW = lineW;
    this.dead = false;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(ctx) {
    const k = 1 - this.life / this.maxLife;
    FX.glowRing(ctx, this.x, this.y, this.r0 + (this.r1 - this.r0) * k, this.color, this.life / this.maxLife, this.lineW);
  }
}

// 爆闪
class Flash {
  constructor(x, y, r, life, color) {
    this.x = x; this.y = y; this.r = r;
    this.life = this.maxLife = life; this.color = color;
    this.dead = false;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(ctx) { FX.glowCircle(ctx, this.x, this.y, this.r * (0.6 + 0.4 * this.life / this.maxLife), this.color, this.life / this.maxLife); }
}
