// Game 子系统：技能树/表现辅助通过 prototype composition 接入。
class GameSkillTreeSystem {
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
      if (typeof RunMonitor !== 'undefined') RunMonitor.event('form_evolved', { form:n.ref.id }, this);
      this.flashes.push(new Flash(p.x, p.y, 80, 0.5, n.ref.color));
      this.rings.push(new Ring(p.x, p.y, 12, 110, 0.6, n.ref.color, 4));
      this.shake(5);
      return;
    }
    if (n.kind === 'capstone' && !form.nodes.every(m => sk.spent.has(m.id))) return;
    if (sk.points <= 0) return;
    sk.points--;
    sk.spent.add(n.ref.id);
    if (typeof RunMonitor !== 'undefined') RunMonitor.event('skill_selected', { skill:n.ref.id, form:p.formId }, this);
    p.recomputeFire();
    this.rings.push(new Ring(n.x, n.y, 8, 40, 0.4, SKILL_TREES[p.treeId].color, 3));
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
