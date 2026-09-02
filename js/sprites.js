// ===== 精灵绘制库 v2：美术唯一来源（进化驱动外观）=====
// 玩家机与子弹的外观由【进化形态】决定：
//   base    脉冲机炮 → 青色战斗机 + 泪滴彗星弹 / 尖头重弹
//   shotgun 散裂弹幕 → 岔翼散射机 + 品红菱形 shard
//   rail    贯穿磁轨 → 金色磁轨长针 + 金色长矛弹
// 全部朝上绘制（原点在中心）；子弹以 rotate(velAngle) + 前向 +x 绘制，拖尾恒在 -x（正后方）。

const Sprites = {

  // 战机硬点与喷口是造型和弹道共同使用的单一数据源。
  playerMuzzles(formId, count = 1, lv = 1) {
    const y = formId === 'shotgun' ? -23 : formId === 'rail' ? -29 : formId === 'ultimate' ? -30
      : formId === 'nova' ? -31 : -31 - Math.min(5, lv);
    const span = formId === 'shotgun' ? 22 : formId === 'ultimate' ? 24 : count >= 3 ? 14 : 8;
    if (count <= 1) return [{ x: 0, y }];
    return Array.from({ length: count }, (_, i) => ({ x: (i / (count - 1) - 0.5) * span, y }));
  },

  playerExhausts(formId) {
    if (formId === 'ultimate') return [{ x: -8, y: 19, scale: 0.7 }, { x: 0, y: 20, scale: 0.9 }, { x: 8, y: 19, scale: 0.7 }];
    if (formId === 'plague') return [{ x: -9, y: 18, scale: 0.7 }, { x: 0, y: 21, scale: 1 }, { x: 9, y: 18, scale: 0.7 }];
    if (formId === 'shotgun') return [{ x: -7, y: 15, scale: 0.75 }, { x: 7, y: 15, scale: 0.75 }];
    if (formId === 'flameblade') return [{ x: -5, y: 18, scale: 0.78 }, { x: 5, y: 18, scale: 0.78 }];
    if (formId === 'mist') return [{ x: 0, y: 18, scale: 0.85 }];
    if (['sword', 'orbit', 'hunter'].includes(formId)) return [{ x: -5, y: 16, scale: 0.72 }, { x: 5, y: 16, scale: 0.72 }];
    if (formId === 'ascendant') return [{ x: -9, y: 17, scale: 0.68 }, { x: 0, y: 20, scale: 0.9 }, { x: 9, y: 17, scale: 0.68 }];
    return [{ x: 0, y: 17, scale: 1 }];
  },

  // ── 玩家机（按进化形态换整机）──
  player(ctx, formId, lv, col, t) {
    const dark = '#0e1626';
    if (formId === 'flameblade') {
      // 焰刃分支：前方双喷口与收束刀脊，强调连续前向轨迹。
      ctx.beginPath();
      ctx.moveTo(0, -27); ctx.lineTo(5, -15); ctx.lineTo(13, -8); ctx.lineTo(18, 8);
      ctx.lineTo(9, 6); ctx.lineTo(7, 17); ctx.lineTo(0, 14); ctx.lineTo(-7, 17);
      ctx.lineTo(-9, 6); ctx.lineTo(-18, 8); ctx.lineTo(-13, -8); ctx.lineTo(-5, -15); ctx.closePath();
      ctx.fillStyle = dark; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * 4, -14); ctx.lineTo(side * 10, -25); ctx.lineTo(side * 6, -6);
        ctx.strokeStyle = hexA('#8dff5d', 0.8); ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(side * 8, -20, 2.1, 0, TAU); ctx.fillStyle = '#fff7cf'; ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(3.5, -5); ctx.lineTo(0, 4); ctx.lineTo(-3.5, -5); ctx.closePath();
      ctx.fillStyle = hexA('#ff9d5d', 0.72 + Math.sin(t * 7) * 0.12); ctx.fill();
      ctx.restore();
      return;
    }
    if (formId === 'mist') {
      // 粒子雾分支：宽体扩散器 + 两侧多孔雾化舱。
      ctx.beginPath();
      ctx.moveTo(0, -20); ctx.lineTo(8, -10); ctx.lineTo(22, -4); ctx.lineTo(19, 10);
      ctx.lineTo(8, 13); ctx.lineTo(0, 18); ctx.lineTo(-8, 13); ctx.lineTo(-19, 10);
      ctx.lineTo(-22, -4); ctx.lineTo(-8, -10); ctx.closePath();
      ctx.fillStyle = dark; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const px = side * (11 + i * 3.2), py = -2 + i * 5;
        ctx.beginPath(); ctx.arc(px, py, 2.2, 0, TAU); ctx.fillStyle = hexA(col, 0.48 + i * 0.12); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, -2, 6.5 + Math.sin(t * 3) * 0.7, 0, TAU);
      ctx.strokeStyle = hexA('#8dff5d', 0.78); ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -2, 2.2, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
      return;
    }
    if (formId === 'plague') {
      // 终极疫焰机：反应堆环、双焰刃喷口与粒子舱合并为四翼旗舰。
      ctx.beginPath();
      ctx.moveTo(0, -29); ctx.lineTo(7, -17); ctx.lineTo(18, -12); ctx.lineTo(27, 2);
      ctx.lineTo(22, 14); ctx.lineTo(10, 12); ctx.lineTo(6, 20); ctx.lineTo(-6, 20);
      ctx.lineTo(-10, 12); ctx.lineTo(-22, 14); ctx.lineTo(-27, 2); ctx.lineTo(-18, -12); ctx.lineTo(-7, -17); ctx.closePath();
      ctx.fillStyle = dark; ctx.fill(); ctx.strokeStyle = '#eaffc7'; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.rotate(-t * 0.55);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 10, Math.sin(a) * 10, 2.3, 0, TAU);
        ctx.fillStyle = i % 2 ? '#ff9d5d' : '#5dffd2'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.strokeStyle = hexA('#8dff5d', 0.9); ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
      ctx.strokeStyle = hexA('#ff9d5d', 0.85); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(-18, -25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(18, -25); ctx.stroke();
      return;
    }
    if (formId === 'nova') {
      // 腐蚀孢子：环形培养舱 + 前置孢子发射器，轮廓直接表达远程投射。
      ctx.beginPath();
      ctx.moveTo(0, -31); ctx.lineTo(4, -22); ctx.lineTo(7, -10); ctx.lineTo(18, -4); ctx.lineTo(15, 8);
      ctx.lineTo(7, 14); ctx.lineTo(0, 18); ctx.lineTo(-7, 14); ctx.lineTo(-15, 8);
      ctx.lineTo(-18, -4); ctx.lineTo(-7, -10); ctx.closePath();
      ctx.fillStyle = dark; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.rotate(t * 0.7);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(7, -2); ctx.lineTo(16, 0); ctx.lineTo(7, 2); ctx.closePath();
        ctx.fillStyle = hexA(col, 0.45 + lv * 0.06); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, 7 + Math.sin(t * 4) * 0.8, 0, TAU);
      ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
      return;
    }
    if (['sword', 'orbit', 'hunter', 'ascendant'].includes(formId)) {
      // 相位刃：窄身高速机 + 两侧刀鞘，刀尖朝外避免与普通炮管混淆。
      const ascendant = formId === 'ascendant', orbit = formId === 'orbit', hunter = formId === 'hunter';
      ctx.beginPath();
      ctx.moveTo(0, ascendant ? -30 : hunter ? -28 : -24); ctx.lineTo(6, -10); ctx.lineTo(10, 4); ctx.lineTo(ascendant ? 25 : 20, 15);
      ctx.lineTo(8, 12); ctx.lineTo(4, ascendant ? 20 : 17); ctx.lineTo(-4, ascendant ? 20 : 17); ctx.lineTo(-8, 12);
      ctx.lineTo(ascendant ? -25 : -20, 15); ctx.lineTo(-10, 4); ctx.lineTo(-6, -10); ctx.closePath();
      ctx.fillStyle = dark; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * 8, -6); ctx.lineTo(side * (19 + lv), 5); ctx.lineTo(side * 10, 8);
        ctx.strokeStyle = hexA(col, 0.85); ctx.lineWidth = 2.4; ctx.stroke();
        ctx.beginPath(); ctx.arc(side * 9, 7, 2, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      }
      if (orbit || ascendant) {
        ctx.beginPath(); ctx.arc(0, 1, ascendant ? 11 : 8, 0, TAU);
        ctx.strokeStyle = hexA('#65e7ff', 0.75); ctx.lineWidth = 1.7; ctx.stroke();
      }
      if (hunter || ascendant) {
        ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(4, -11); ctx.lineTo(0, -5); ctx.lineTo(-4, -11); ctx.closePath();
        ctx.fillStyle = hexA('#ff73d1', 0.8); ctx.fill();
      }
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, -6, 2.6, 5.4, 0, 0, TAU);
      ctx.fillStyle = '#f6ddff'; ctx.fill();
      return;
    }
    if (formId === 'shotgun') {
      // 散裂弹幕：岔翼散射机（双前叉发射器 + 宽尾翼）
      ctx.beginPath();
      ctx.moveTo(-7, -14); ctx.lineTo(-11, -22);            // 左前叉
      ctx.lineTo(-4, -10);
      ctx.lineTo(0, -13); ctx.lineTo(4, -10);
      ctx.lineTo(11, -22); ctx.lineTo(7, -14);              // 右前叉
      ctx.lineTo(13, 4); ctx.lineTo(19, 14); ctx.lineTo(8, 12);
      ctx.lineTo(0, 16); ctx.lineTo(-8, 12); ctx.lineTo(-19, 14);
      ctx.lineTo(-13, 4);
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      // 前叉发射器光点
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.arc(-11, -22, 2.6, 0, TAU); ctx.fillStyle = hexA(col, 0.9); ctx.fill();
      ctx.beginPath(); ctx.arc(11, -22, 2.6, 0, TAU); ctx.fillStyle = hexA(col, 0.9); ctx.fill();
      ctx.restore();
      // 中舱
      ctx.beginPath(); ctx.arc(0, -2, 3.4, 0, TAU);
      ctx.fillStyle = '#ffd6f5'; ctx.fill();
      ctx.strokeStyle = hexA(col, 0.7); ctx.lineWidth = 1; ctx.stroke();
      return;
    }
    if (formId === 'ultimate') {
      // 湮灭星舰：宽体旗舰（棱镜舷 + 金轨 + 三喷口 + 皇冠天线）
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(6, -16); ctx.lineTo(15, -8); ctx.lineTo(24, 4); ctx.lineTo(26, 12);
      ctx.lineTo(12, 12); ctx.lineTo(6, 18); ctx.lineTo(-6, 18); ctx.lineTo(-12, 12); ctx.lineTo(-26, 12);
      ctx.lineTo(-24, 4); ctx.lineTo(-15, -8); ctx.lineTo(-6, -16);
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 2.2; ctx.stroke();
      // 品红翼缘
      ctx.strokeStyle = hexA('#ff5de3', 0.85); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(15, -8); ctx.lineTo(24, 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-15, -8); ctx.lineTo(-24, 4); ctx.stroke();
      // 金轨
      ctx.strokeStyle = hexA('#ffd25d', 0.85); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(9, -6); ctx.lineTo(11, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-11, 9); ctx.stroke();
      // 皇冠天线
      ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-3, -18); ctx.lineTo(-5, -26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, -18); ctx.lineTo(5, -26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, -29); ctx.stroke();
      // 棱镜核心（菱形三色）
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(3.4, 0); ctx.lineTo(0, 6); ctx.lineTo(-3.4, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
      ctx.strokeStyle = '#ff5de3'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      // 三喷口
      ctx.fillStyle = hexA('#4fd2ff', 0.8);
      for (const nx of [-8, 0, 8]) ctx.fillRect(nx - 1.6, 17, 3.2, 3);
      return;
    }
    if (formId === 'rail') {
      // 贯穿磁轨：细长磁轨针（双轨 + 长针鼻）
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.lineTo(3, -12); ctx.lineTo(3.5, 8); ctx.lineTo(8, 15); ctx.lineTo(3, 13);
      ctx.lineTo(0, 17); ctx.lineTo(-3, 13); ctx.lineTo(-8, 15); ctx.lineTo(-3.5, 8); ctx.lineTo(-3, -12);
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      // 双侧磁轨
      ctx.strokeStyle = hexA(col, 0.85); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-4.5, -20); ctx.lineTo(-4.5, 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4.5, -20); ctx.lineTo(4.5, 10); ctx.stroke();
      // 轨道能量点（随等级增多）
      for (let i = 0; i < Math.min(3, Math.floor(lv / 2)); i++) {
        ctx.beginPath(); ctx.arc(0, -14 + i * 9, 1.6, 0, TAU);
        ctx.fillStyle = '#fff2c0'; ctx.fill();
      }
      // 针鼻
      ctx.beginPath(); ctx.arc(0, -22, 2.2, 0, TAU);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      return;
    }
    // base 脉冲机炮：经典战斗机（炮管随等级增加）
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.bezierCurveTo(4.5, -16, 6.5, -10, 7, -4);
    ctx.lineTo(17, 5);
    ctx.lineTo(21, 13);
    ctx.lineTo(10, 12);
    ctx.lineTo(5, 17);
    ctx.lineTo(-5, 17);
    ctx.lineTo(-10, 12);
    ctx.lineTo(-21, 13);
    ctx.lineTo(-17, 5);
    ctx.lineTo(-7, -4);
    ctx.bezierCurveTo(-6.5, -10, -4.5, -16, 0, -22);
    ctx.closePath();
    ctx.fillStyle = dark; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    // 内板线
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(-14, 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, -2); ctx.lineTo(14, 9); ctx.stroke();
    // 座舱
    ctx.beginPath(); ctx.ellipse(0, -7, 2.6, 5, 0, 0, TAU);
    ctx.fillStyle = '#bff1ff'; ctx.fill();
    ctx.strokeStyle = hexA(col, 0.8); ctx.lineWidth = 1; ctx.stroke();
    // 翼尖灯
    ctx.fillStyle = hexA(col, 0.9);
    ctx.fillRect(-21, 11, 3, 3); ctx.fillRect(18, 11, 3, 3);
    // 炮管（升级增加）
    const nBar = lv >= 5 ? 3 : lv >= 3 ? 2 : 1;
    ctx.fillStyle = hexA(col, 0.95);
    for (let i = 0; i < nBar; i++) {
      const bx = (i - (nBar - 1) / 2) * 7;
      ctx.fillRect(bx - 1.5, -30 - lv, 3, 12 + lv * 0.8);
    }
  },

  // ── 敌机（红色阵营）──
  enemy(ctx, type, r, color, t, ex = {}) {
    const dark = '#1c0d12';
    if (type === 'rock' || type === 'rock_s') {
      const crag = ex.crag || [1, 0.85, 1.1, 0.9, 1.05, 0.8, 1.12, 0.9];
      const n = crag.length;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU;
        const cr = r * crag[i];
        i === 0 ? ctx.moveTo(Math.cos(a) * cr, Math.sin(a) * cr) : ctx.lineTo(Math.cos(a) * cr, Math.sin(a) * cr);
      }
      ctx.closePath();
      ctx.fillStyle = '#241812'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.15, r * 0.22, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.3, r * 0.25, r * 0.16, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.05, -r * 0.45, r * 0.12, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.82, Math.PI * 1.1, Math.PI * 1.7);
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.5; ctx.stroke();
      return;
    }
    if (type === 'mite') {
      ctx.beginPath();
      ctx.moveTo(0, r * 1.15);
      ctx.lineTo(r * 0.85, -r * 0.4);
      ctx.lineTo(r * 0.4, -r * 0.85);
      ctx.lineTo(-r * 0.4, -r * 0.85);
      ctx.lineTo(-r * 0.85, -r * 0.4);
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.lineTo(0, r * 0.3);
      ctx.strokeStyle = hexA(color, 0.5); ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.24, 0, TAU);
      ctx.fillStyle = color; ctx.fill();
      return;
    }
    if (type === 'dasher') {
      ctx.beginPath();
      ctx.moveTo(0, r * 1.45);
      ctx.lineTo(r * 0.5, r * 0.1);
      ctx.lineTo(r * 1.05, -r * 0.95);
      ctx.lineTo(r * 0.28, -r * 0.5);
      ctx.lineTo(0, -r * 0.9);
      ctx.lineTo(-r * 0.28, -r * 0.5);
      ctx.lineTo(-r * 1.05, -r * 0.95);
      ctx.lineTo(-r * 0.5, r * 0.1);
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.3, 0, TAU);
      ctx.fillStyle = ex.charge ? '#ffffff' : hexA(color, 0.9); ctx.fill();
      return;
    }
    if (type === 'gunner') {
      ctx.fillStyle = hexA(color, 0.85);
      ctx.fillRect(-r * 0.18, r * 0.5, r * 0.36, r * 0.9);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + Math.PI / 6;
        i === 0 ? ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95) : ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
      }
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU);
      ctx.strokeStyle = hexA(color, 0.7); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, TAU);
      ctx.fillStyle = color; ctx.fill();
      return;
    }
    if (type === 'burst') {
      ctx.beginPath();
      ctx.moveTo(0, r * 1.2);
      ctx.lineTo(r, -r * 0.7);
      ctx.lineTo(-r, -r * 0.7);
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
      for (const bx of [-r * 0.5, 0, r * 0.5]) {
        ctx.fillStyle = hexA(color, 0.9);
        ctx.fillRect(bx - r * 0.09, r * 0.45, r * 0.18, r * 0.5);
      }
      ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 0.22, 0, TAU);
      ctx.fillStyle = color; ctx.fill();
      return;
    }
    if (type === 'scatter') {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i / 5 * TAU;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i / 5 * TAU;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.14, 0, TAU);
        ctx.fillStyle = hexA(color, 0.95); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      return;
    }
    if (type === 'bomber') {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, TAU);
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.strokeStyle = hexA('#ffd25d', 0.9); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.7); ctx.quadraticCurveTo(r * 0.3, -r * 1.15, r * 0.1, -r * 1.4); ctx.stroke();
      const spark = 1 + Math.sin(t * 14) * 0.4;
      ctx.beginPath(); ctx.arc(r * 0.1, -r * 1.45, 1.6 * spark, 0, TAU);
      ctx.fillStyle = '#ffd25d'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.3, 0, TAU);
      ctx.fillStyle = hexA(color, 0.9); ctx.fill();
      return;
    }
    if (type === 'sniper') {
      ctx.fillStyle = hexA(color, 0.85);
      ctx.fillRect(-r * 0.14, -r * 1.5, r * 0.28, r * 1.6);
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, r * 0.65); ctx.lineTo(0, -r * 0.35); ctx.lineTo(r * 0.75, r * 0.65);
      ctx.lineTo(r * 0.45, r * 0.75); ctx.lineTo(0, r * 0.15); ctx.lineTo(-r * 0.45, r * 0.75);
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.2, 0, TAU);
      ctx.fillStyle = ex.locking ? '#ffffff' : color; ctx.fill();
      return;
    }
    if (type === 'miner') {
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, -r * 0.35); ctx.lineTo(r * 0.95, -r * 0.35); ctx.lineTo(r * 0.7, r * 0.6);
      ctx.lineTo(-r * 0.7, r * 0.6);
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
      for (const mx of [-r * 0.45, 0, r * 0.45]) {
        ctx.beginPath(); ctx.arc(mx, -r * 0.05, r * 0.16, 0, TAU);
        ctx.fillStyle = hexA('#ff9d5d', 0.85); ctx.fill();
      }
      ctx.fillRect(-r * 0.22, r * 0.45, r * 0.44, r * 0.3);
      return;
    }
    if (type === 'hive') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + TAU / 12;
        const pr = r * (0.3 + 0.05 * Math.sin(t * 3 + i));
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, pr * 0.42, 0, TAU);
        ctx.strokeStyle = hexA(color, 0.8); ctx.lineWidth = 1.2; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, TAU);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      return;
    }
    if (type === 'bastion') {
      const oct = (rr) => {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * TAU + Math.PI / 8;
          i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
      };
      oct(r); ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.stroke();
      oct(r * 0.62); ctx.strokeStyle = hexA(color, 0.6); ctx.lineWidth = 1.4; ctx.stroke();
      const a0 = (t || 0) * 1.2;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.42, a0, a0 + Math.PI * 1.2);
      ctx.strokeStyle = hexA(color, 0.9); ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + Math.PI / 4;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * 0.08, 0, TAU);
        ctx.fillStyle = color; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, TAU);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      return;
    }
  },

  // ── 折跃棱堡：四棱护盾 + 双层旋转核心 ──
  prismBoss(ctx, boss, t) {
    const color = boss.hitT > 0 ? '#ffffff' : boss.def.color;
    const alpha = boss.spawning ? clamp(1 - boss.spawnT, 0.12, 1) : 1;
    const poly = (radius, sides, offset = 0) => {
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = offset + i / sides * TAU;
        i ? ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius) : ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
      }
      ctx.closePath();
    };

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    if (boss.phase === 'ward') {
      ctx.beginPath();
      for (let i = 0; i < boss.satellitePoints.length; i++) {
        const p = boss.satellitePoints[i];
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = hexA(color, 0.32); ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = hexA('#d9c7ff', 0.72); ctx.lineWidth = 1.5; ctx.stroke();
      for (const p of boss.satellitePoints) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle + t * 0.8);
        poly(17, 4, Math.PI / 4); ctx.fillStyle = hexA('#120b2d', 0.92); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.stroke();
        poly(8, 4, Math.PI / 4); ctx.fillStyle = hexA('#f7edff', 0.88); ctx.fill();
        ctx.restore();
      }
    }

    ctx.translate(boss.x, boss.y);
    FX.glowCircle(ctx, 0, 0, boss.r * 2.1, color, boss.phase === 'ward' ? 0.45 : 0.72);
    ctx.rotate(boss.rot);
    poly(boss.r * 1.22, 8, Math.PI / 8);
    ctx.fillStyle = hexA('#100822', 0.96); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = boss.phase === 'overload' ? 4 : 2.5; ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(boss.r * 0.42, 0); ctx.lineTo(boss.r * 1.12, -8); ctx.lineTo(boss.r * 0.92, 8); ctx.closePath();
      ctx.fillStyle = hexA(i % 2 ? '#5de1ff' : color, boss.phase === 'overload' ? 0.82 : 0.48); ctx.fill();
    }
    ctx.rotate(-boss.rot * 1.8);
    poly(boss.r * 0.64, 6, t * 0.35);
    ctx.fillStyle = hexA(color, 0.22); ctx.fill();
    ctx.strokeStyle = hexA('#e9dcff', 0.82); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, boss.r * 0.24 + Math.sin(t * 7) * 2, 0, TAU);
    ctx.fillStyle = boss.phaseStage === 'transition' || boss.phase === 'overload' ? '#ffcf63' : '#ffffff'; ctx.fill();
    if (boss.phaseStage === 'transition') {
      const k = 1 - boss.phaseT / boss.def.transitionDuration;
      for (let i = 0; i < 3; i++) FX.glowRing(ctx, 0, 0, 28 + i * 16 + k * 18, i === 1 ? '#ffcf63' : color, 0.65 - i * 0.12, 3);
    }
    ctx.restore();
  },

  // ── 星蚀龙：侧面轮廓龙头 + 俯视模块身体 ──
  dragon(ctx, boss, t) {
    if (typeof GameAssets !== 'undefined' && GameAssets.dragon.ready) {
      this.dragonBitmap(ctx, boss, t);
      return;
    }
    const color = boss.hitT > 0 ? '#ffffff' : boss.def.color;
    const points = boss.bodyPoints;
    const alpha = boss.spawning ? clamp(1 - boss.spawnT / 1.1, 0.12, 1) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // 连续脊柱先填住节段间隙，外层发光、内层暗芯。
    if (points.length) {
      ctx.beginPath(); ctx.moveTo(boss.x, boss.y);
      for (const p of points) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = hexA(boss.def.color, 0.28); ctx.lineWidth = 20; ctx.stroke();
      ctx.strokeStyle = '#160a12'; ctx.lineWidth = 10; ctx.stroke();
    }

    // 尾刃在最底层。
    const tail = points[points.length - 1];
    if (tail) {
      ctx.save(); ctx.translate(tail.x, tail.y); ctx.rotate(tail.angle);
      ctx.beginPath();
      ctx.moveTo(-34, 0); ctx.lineTo(-8, -10); ctx.lineTo(4, 0); ctx.lineTo(-8, 10); ctx.closePath();
      ctx.fillStyle = '#160a12'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-2, 0);
      ctx.strokeStyle = hexA(color, 0.55); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }

    // 肩部双翼随局部切线转动，转弯时保持挂在同一节段。
    const shoulder = points[1];
    if (shoulder) {
      const flap = 0.92 + Math.sin(t * 3.2) * 0.12;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(shoulder.x, shoulder.y); ctx.rotate(shoulder.angle); ctx.scale(1, side * flap);
        ctx.beginPath();
        ctx.moveTo(2, 5); ctx.lineTo(-7, 28); ctx.lineTo(-30, 52); ctx.lineTo(-23, 17);
        ctx.lineTo(-47, 25); ctx.lineTo(-20, 2); ctx.closePath();
        ctx.fillStyle = hexA(boss.def.color, 0.13); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-30, 52);
        ctx.moveTo(-4, 7); ctx.lineTo(-47, 25);
        ctx.strokeStyle = hexA(color, 0.48); ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }
    }

    // 从尾到头绘制模块，半径逐节收窄并交替内纹，减少“复制粘贴”感。
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      const r = Math.max(9, 19 - i * 0.8);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle + (i % 2 ? Math.PI / 8 : 0));
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU + Math.PI / 8;
        const rr = r * (k % 2 ? 0.88 : 1);
        k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fillStyle = '#160a12'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = i < 3 ? 2.1 : 1.6; ctx.stroke();
      ctx.beginPath();
      if (i % 3 === 0) {
        ctx.moveTo(-r * 0.55, 0); ctx.lineTo(0, -r * 0.55); ctx.lineTo(r * 0.55, 0); ctx.lineTo(0, r * 0.55); ctx.closePath();
      } else {
        ctx.arc(0, 0, r * 0.46, 0, TAU);
      }
      ctx.strokeStyle = hexA(color, 0.48); ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, Math.max(2, r * 0.16), 0, TAU);
      ctx.fillStyle = '#ffd76a'; ctx.fill();
      ctx.restore();
    }

    // 侧面轮廓头，鼻尖朝 +X；只画可见侧眼，强调“侧视头 + 俯视身体”的设定。
    ctx.save(); ctx.translate(boss.x, boss.y); ctx.rotate(boss.heading);
    ctx.beginPath();
    ctx.moveTo(34, 0); ctx.lineTo(22, -11); ctx.lineTo(4, -15); ctx.lineTo(-13, -10);
    ctx.lineTo(-21, 0); ctx.lineTo(-12, 13); ctx.lineTo(10, 15); ctx.lineTo(27, 8); ctx.closePath();
    ctx.fillStyle = '#160a12'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2.3; ctx.stroke();
    // 后掠双角与下颌。
    ctx.beginPath(); ctx.moveTo(-5, -12); ctx.lineTo(-23, -31); ctx.lineTo(-14, -8);
    ctx.moveTo(2, -14); ctx.lineTo(-8, -36); ctx.lineTo(10, -12);
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, 5); ctx.lineTo(14, 12); ctx.lineTo(5, 7);
    ctx.strokeStyle = hexA(color, 0.6); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(13, -5, 3.2 + Math.sin(t * 5) * 0.25, 0, TAU);
    ctx.fillStyle = '#ffe17d'; ctx.fill();
    ctx.beginPath(); ctx.arc(33, 1, 1.8, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
    ctx.restore();
  },

  dragonBitmap(ctx, boss, t) {
    const points = boss.bodyPoints;
    const alpha = boss.spawning ? clamp(1 - boss.spawnT / 1.1, 0.12, 1) : 1;
    ctx.save(); ctx.globalAlpha = alpha;

    // 位图之间仍用一条暗色脊柱连接，转弯时不会露出背景裂缝。
    if (points.length) {
      ctx.beginPath(); ctx.moveTo(boss.x, boss.y);
      for (const p of points) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = hexA('#ff4d6d', 0.15); ctx.lineWidth = 17; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = '#07121f'; ctx.lineWidth = 9; ctx.stroke();
    }

    const tail = points[points.length - 1];
    if (tail) GameAssets.drawDragonPart(ctx, 'neon-dragon-tail-blade-v2', tail.x, tail.y, tail.angle - Math.PI / 2, 68);

    const shoulder = points[1];
    if (shoulder) {
      const open = Math.sin(t * 3.2) > -0.15;
      const left = open ? 'neon-dragon-wing-left-open' : 'neon-dragon-wing-left-folded';
      const right = open ? 'neon-dragon-wing-right-open' : 'neon-dragon-wing-right-folded';
      GameAssets.drawDragonPart(ctx, left, shoulder.x, shoulder.y, shoulder.angle + Math.PI / 2, 126);
      GameAssets.drawDragonPart(ctx, right, shoulder.x, shoulder.y, shoulder.angle + Math.PI / 2, 126);
    }

    const modules = ['neon-dragon-body-boss', 'neon-dragon-body-star', 'neon-dragon-body-ring', 'neon-dragon-body-diamond'];
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      const size = Math.max(38, 64 - i * 2.35);
      GameAssets.drawDragonPart(ctx, modules[i % modules.length], p.x, p.y, p.angle, size);
    }

    const neck = points[0];
    if (neck) GameAssets.drawDragonPart(ctx, 'neon-dragon-neck-shoulder', neck.x, neck.y, neck.angle + Math.PI / 2, 80);

    const firing = boss.fireT > boss.def.fireInterval - 0.28;
    const blinking = Math.sin(t * 1.7) > 0.97;
    const head = firing ? 'neon-dragon-head-bite-open' : blinking ? 'neon-dragon-head-blink' : 'neon-dragon-head-neutral';
    GameAssets.drawDragonPart(ctx, head, boss.x, boss.y, boss.heading + Math.PI, 102);

    // 青白 Boss 与红色普通敌人区分，但保留红色敌对识别环。
    ctx.beginPath(); ctx.arc(boss.x, boss.y, 34 + Math.sin(t * 3) * 2, 0, TAU);
    ctx.strokeStyle = hexA(boss.def.color, boss.hitT > 0 ? 0.95 : 0.42); ctx.lineWidth = boss.hitT > 0 ? 3 : 1.5; ctx.stroke();
    ctx.restore();
  },

  // ── 玩家子弹（vis: comet/dart/shard/lance/explosive/frag/spore）──
  // 一律 rotate(ang) 后绘制：前向 +x，拖尾恒在 -x（正后方）
  bullet(ctx, vis, r, color, ang, t) {
    ctx.rotate(ang);
    const fwd = (len, side = 0) => [len, side];
    if (vis === 'spore') {
      // 漂浮孢囊：近似圆形、无弹道尾焰；只靠呼吸与卫星粒子表现生命感。
      const pulse = 1 + Math.sin((t || 0) * 7) * 0.1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      FX.glowCircle(ctx, 0, 0, r * 2.7 * pulse, color, 0.72);
      ctx.restore();
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * TAU;
        const rr = r * pulse * (k % 2 ? 0.92 : 1.16);
        k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = hexA('#17351f', 0.95); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.43, 0, TAU);
      ctx.fillStyle = '#f4ffd8'; ctx.fill();
      for (let k = 0; k < 4; k++) {
        const a = (t || 0) * 2.2 + k * TAU / 4;
        const orbit = r * (1.48 + (k % 2) * 0.18);
        ctx.beginPath(); ctx.arc(Math.cos(a) * orbit, Math.sin(a) * orbit, 1.35 + (k % 2) * 0.4, 0, TAU);
        ctx.fillStyle = hexA(k % 2 ? '#d7ff8d' : color, 0.88); ctx.fill();
      }
    } else if (vis === 'dart') {
      // 基础形态重弹：尖头镖 + 正后方双激波线
      ctx.lineCap = 'round';
      ctx.strokeStyle = hexA(color, 0.3); ctx.lineWidth = r * 1.7;
      ctx.beginPath(); ctx.moveTo(-r * 5.5, 0); ctx.lineTo(-r * 1.2, 0); ctx.stroke();
      ctx.strokeStyle = hexA(color, 0.5); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-r * 3.5, -r * 0.9); ctx.lineTo(-r * 1.4, -r * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 3.5, r * 0.9); ctx.lineTo(-r * 1.4, r * 0.4); ctx.stroke();
      FX.glowCircle(ctx, 0, 0, r * 2.3, color, 0.9);
      ctx.beginPath();
      ctx.moveTo(r * 2, 0); ctx.lineTo(-r * 0.7, r * 0.85);
      ctx.lineTo(-r * 0.2, 0); ctx.lineTo(-r * 0.7, -r * 0.85);
      ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (vis === 'shard') {
      // 散裂形态：菱形碎片 + 短火花尾
      ctx.beginPath(); ctx.moveTo(r * 1.6, 0); ctx.lineTo(0, r * 0.9);
      ctx.lineTo(-r * 1.6, 0); ctx.lineTo(0, -r * 0.9);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = hexA(color, 0.5); ctx.lineWidth = r * 0.5;
      ctx.beginPath(); ctx.moveTo(-r * 1.6, 0); ctx.lineTo(-r * 3, 0); ctx.stroke();
    } else if (vis === 'lance') {
      // 磁轨形态：金色长矛 + 细长尾
      ctx.strokeStyle = hexA(color, 0.35); ctx.lineWidth = r * 0.9;
      ctx.beginPath(); ctx.moveTo(-r * 6, 0); ctx.lineTo(-r * 1.5, 0); ctx.stroke();
      FX.glowCircle(ctx, 0, 0, r * 1.8, color, 0.9);
      ctx.beginPath();
      ctx.moveTo(r * 2.6, 0); ctx.lineTo(-r * 1.2, r * 0.5);
      ctx.lineTo(-r * 1.2, -r * 0.5);
      ctx.closePath();
      ctx.fillStyle = '#fff2c0'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    } else if (vis === 'explosive') {
      const pulse = 1 + Math.sin((t || 0) * 20) * 0.18;
      FX.glowCircle(ctx, 0, 0, r * 3 * pulse, '#ff9d3d', 0.95);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU);
      ctx.fillStyle = '#fff3d0'; ctx.fill();
      for (let k = 0; k < 3; k++) {
        const a = (t || 0) * 9 + k * TAU / 3;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5, 1.2, 0, TAU);
        ctx.fillStyle = '#ffd25d'; ctx.fill();
      }
    } else if (vis === 'nova') {
      // 终极弹：白金彗星 + 三色棱光尾
      ctx.lineCap = 'round';
      for (const [c, w, off] of [['#4fd2ff', 2.2, -3.4], ['#ff5de3', 2.2, 0], ['#ffd25d', 2.2, 3.4]]) {
        ctx.strokeStyle = hexA(c, 0.5); ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(-r * 4.2, off); ctx.lineTo(-r * 0.9, off); ctx.stroke();
      }
      FX.glowCircle(ctx, 0, 0, r * 2.4, '#ffffff', 0.9);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, TAU);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = '#ffd25d'; ctx.lineWidth = 1.2; ctx.stroke();
    } else if (vis === 'frag') {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
      ctx.fillStyle = color; ctx.fill();
    } else {
      // comet：泪滴彗星（拖尾在正后方，渐细）
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-ux(r, 0), 0);
      ctx.lineTo(0, 0);
      ctx.strokeStyle = hexA(color, 0.42); ctx.lineWidth = r * 1.5; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 2.8, -r * 0.9); ctx.lineTo(-r * 3.6, 0); ctx.lineTo(-r * 2.8, r * 0.9);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = hexA(color, 0.4); ctx.fill();
      FX.glowCircle(ctx, 0, 0, r * 2.2, color, 0.9);
    }
    function ux(len, side) { return len; }
  },

  // ── 敌方子弹：红色光晕球 + 白芯 ──
  enemyBullet(ctx, r, color, t) {
    const pulse = 1 + Math.sin((t || 0) * 10) * 0.15;
    FX.glowCircle(ctx, 0, 0, r * 2.4 * pulse, color, 0.9);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
  },
};
