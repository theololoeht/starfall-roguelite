// ===== UI：选武器 / HUD 同步 / 升级卡 / 结算 =====
function swordPanelModel(p) {
  const attacks = p.attacks || [];
  const slash = attacks.find(a => a.mode === 'sword_slash');
  const orbit = attacks.find(a => a.mode === 'orbit_blade');
  const wave = attacks.find(a => a.mode === 'phase_wave');
  const crown = attacks.find(a => a.mode === 'blade_crown');
  const lines = [];
  if (slash) {
    const f = slash.fire;
    lines.push(`弧斩 ${(f.damage * p.dmgMul).toFixed(1)} · ${Math.round(f.radius)}px · ${Math.round(f.arc / Math.PI * 180)}°`);
  }
  if (orbit) {
    const f = orbit.fire;
    lines.push(`环刃 ${f.blades}枚 · 轨道 ${Math.round(f.radius)}px · 转速 ${f.spinSpeed.toFixed(2)}`);
  }
  if (wave) {
    const f = wave.fire;
    lines.push(`猎杀波 ${f.projectiles || 1}道 · 锁敌 ${Math.round(f.range)}px · 贯穿 ${f.pierce}`);
  }
  if (crown) {
    const f = crown.fire;
    lines.push(`刃冠 ${f.projectiles}道 · 周期 ${(f.interval / p.atkSpdMul).toFixed(2)}s`);
  }
  lines.push(`总理论DPS ${p.dpsEstimate.toFixed(1)}`);
  return { title:p.form?.name || '相位刃', lines };
}

const UI = {
  cache: {},
  selected: 'cannon',   // 初始武器选择
  banId: null,          // 流派 BP：禁用
  archId: null,         // 流派 BP：选定

  init() {
    this.els = {};
    for (const id of ['hp-fill', 'hp-text', 'xp-fill', 'xp-text', 'level-text', 'time-text', 'wave-text',
      'stat-strip', 'weapon-slots', 'menu', 'gameover', 'run-summary',
      'weapon-pick', 'archetype-bp', 'start-btn', 'sword-slot', 'sword-cd', 'menu-btn',
      'choices', 'choices-title', 'choice-cards', 'dps-panel', 'hud']) {
      this.els[id.replace(/-/g, '_')] = document.getElementById(id);
    }
    this.els.start_btn.onclick = () => { if (this.archId) this.startRun(); };
    this.els.menu_btn.onclick = () => this.showMenu();
    document.getElementById('retry-btn').onclick = () => this.startRun();
    this.buildMenu();
    this.buildArchetypes();
  },

  // ── 数值成长三选一（每级弹出；蜂巢树卡为可选入口）──
  showStatChoice(cards, onPick) {
    this.els.choices_title.textContent = `⬆ Lv ${game.level} · 选择数值成长`;
    const wrap = this.els.choice_cards;
    wrap.innerHTML = '';
    for (const c of cards) {
      const div = document.createElement('div');
      div.className = 'card kind-stat';
      div.innerHTML = `<div class="icon">${c.icon}</div><div class="name">${c.name}</div><div class="tag">数值成长</div><div class="desc">${c.desc}</div>`;
      div.onclick = () => { wrap.innerHTML = ''; onPick(c); };
      wrap.appendChild(div);
    }
    if (game.player.skills.points > 0 && game.player.treeId) {
      const div = document.createElement('div');
      div.className = 'card kind-merge';
      div.innerHTML = `<div class="icon">⬢</div><div class="name">蜂巢技能树</div><div class="tag">⬢ ${game.player.skills.points} 点待点亮</div><div class="desc">打开技能树：强化带特殊效果的蜂窝，或进化攻击形态（之后可按 T 再打开）</div>`;
      div.onclick = () => { wrap.innerHTML = ''; this.hideStatChoice(); game.openTree(); };
      wrap.appendChild(div);
    }
    this.els.choices.classList.remove('hidden');
  },

  hideStatChoice() { this.els.choices.classList.add('hidden'); },

  // 返回开始页面（保留上局武器/流派选择，可直接调整后再次出击）
  showMenu() {
    game.state = 'menu';
    this.els.menu.classList.remove('hidden');
    this.els.gameover.classList.add('hidden');
  },

  buildMenu() {
    const wrap = this.els.weapon_pick;
    wrap.innerHTML = '';
    for (const id of PLAYABLE_WEAPON_IDS) {
      const d = WEAPON_DEFS[id];
      const div = document.createElement('div');
      div.className = 'wcard' + (id === this.selected ? ' sel' : '');
      div.style.setProperty('--wc', d.color);
      div.innerHTML = `<div class="icon">${d.icon}</div><div class="name">${d.name}</div><div class="tag">${d.tag}</div><div class="desc">${d.desc}</div>`;
      div.onclick = () => { this.selected = id; this.buildMenu(); };
      wrap.appendChild(div);
    }
  },

  // ── 流派 BP：每张卡可「禁用」或「选定」，禁 1 选 1 ──
  buildArchetypes() {
    const wrap = this.els.archetype_bp;
    wrap.innerHTML = '';
    for (const a of ARCHETYPES) {
      const div = document.createElement('div');
      div.className = 'acard' + (this.banId === a.id ? ' banned' : '') + (this.archId === a.id ? ' sel' : '');
      div.style.setProperty('--wc', a.color);
      div.innerHTML =
        `<div class="ahead"><span class="icon">${a.icon}</span><span class="name">${a.name}</span></div>` +
        `<div class="desc">${a.desc}</div>` +
        `<div class="btns"><button class="mini ban">🚫 禁用</button><button class="mini pick">✔ 选定</button></div>`;
      div.querySelector('.ban').onclick = () => {
        this.banId = this.banId === a.id ? null : a.id;
        if (this.banId && this.archId === this.banId) this.archId = null;
        this.buildArchetypes();
      };
      div.querySelector('.pick').onclick = () => {
        this.archId = this.archId === a.id ? null : a.id;
        if (this.archId && this.banId === this.archId) this.banId = null;
        this.buildArchetypes();
      };
      wrap.appendChild(div);
    }
    this.els.start_btn.disabled = !this.archId;
  },

  startRun() {
    game.reset(this.selected, this.archId);
    this.els.menu.classList.add('hidden');
    this.els.gameover.classList.add('hidden');
    this.hideStatChoice();
  },

  syncHUD(g) {
    if (!g.player) return;
    // 技能树全屏绘制时隐藏 DOM HUD，避免压住树面板
    if (this.els.hud) this.els.hud.classList.toggle('hidden', g.state === 'tree');
    const p = g.player;
    this.els.hp_fill.style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
    this.els.hp_text.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
    const need = xpNeed(g.level);
    this.els.xp_fill.style.width = clamp(g.xp / need * 100, 0, 100) + '%';
    this.els.xp_text.textContent = `XP ${g.xp} / ${need}`;
    this.els.level_text.textContent = `Lv ${g.level}` + (p.skills.points > 0 ? ` · ⬢${p.skills.points}` : '');
    this.els.time_text.textContent = fmtTime(g.time);
    this.els.wave_text.textContent = `WAVE ${g.wave} · ${g.score}分`;
    // 右侧数值面板：射速/DPS/特效一览（让"射速换弹幕"的取舍透明可见）
    if (this.els.dps_panel) {
      const f = p.fire;
      if (f) {
        const interval = (f.interval || f.tick || 1) / p.atkSpdMul;
        const rps = 1 / interval;
        const weaponType = p.mainWeapon?.def.type;
        if (weaponType === 'nova') {
          const mode = f.mode || 'pulse';
          const regen = dotRegenScaling(p);
          const fullDot = f.stackDps * (f.dotMul || 1) * regen.poisonMul * f.maxStacks * p.dmgMul;
          let lines;
          if (mode === 'spore') {
            const range = f.range * (f.rangeMul || 1) * regen.rangeMul;
            const hit = f.damage * p.dmgMul;
            const layer = f.stackDps * (f.dotMul || 1) * regen.poisonMul * p.dmgMul;
            lines = [`孢子命中 <b>${hit.toFixed(1)}</b> · 射程 ${Math.round(range)}px`, `射速 <b>${rps.toFixed(2)}/s</b> · 每次 +${f.stacks} 层`, `单层毒伤 <span class="dps">${layer.toFixed(1)}/s</span> · 恢复转化 ${Math.round((regen.poisonMul - 1) * 100)}%`];
          } else if (mode === 'pulse') {
            const radius = f.radius * (f.rangeMul || 1), pulse = f.pulseDmg * p.dmgMul;
            lines = [`脉冲 <b>${pulse.toFixed(1)}</b> · 半径 ${Math.round(radius)}px`, `周期 <b>${interval.toFixed(2)}s</b> · 每次 +${f.stacks} 层`, `满层持续DPS <span class="dps">${fullDot.toFixed(1)}</span>（上限 ${f.maxStacks}）`];
          } else if (mode === 'flameblade') {
            const range = f.range * (f.rangeMul || 1) * (f.bladeRangeMul || 1) * regen.rangeMul, width = f.width * (f.bladeWidthMul || 1);
            const direct = f.dps * (f.bladeDmgMul || 1) * p.dmgMul;
            lines = [`焰刃持续DPS <b>${direct.toFixed(1)}</b>`, `射程 ${Math.round(range)}px · 宽度 ${Math.round(width)}px`, `满层腐蚀DPS <span class="dps">${fullDot.toFixed(1)}</span>`];
          } else if (mode === 'mist') {
            const radius = f.radius * (f.rangeMul || 1) * (f.mistRadiusMul || 1) * regen.rangeMul, direct = f.dps * (f.mistDmgMul || 1) * p.dmgMul;
            lines = [`雾域持续DPS <b>${direct.toFixed(1)}</b>`, `半径 ${Math.round(radius)}px · 粒子上限 ${Math.round(f.maxMotes * (f.moteMul || 1))}`, `满层腐蚀DPS <span class="dps">${fullDot.toFixed(1)}</span>`];
          } else {
            const radius = f.radius * (f.rangeMul || 1), range = f.range * (f.rangeMul || 1) * (f.bladeRangeMul || 1);
            const direct = (f.dps * (f.bladeDmgMul || 1) + f.dps * (f.mistDmgMul || 1)) * p.dmgMul;
            const attack = p.attacks[p.attacks.length - 1], behavior = f.bladeBehaviorByParent?.[attack?.parentFormId] || 'orbit';
            const retained = p.attacks.slice(0, -1).map(a => ({spore:'孢子',flameblade:'焰刃',mist:'毒雾'}[a.mode] || a.mode)).join('+');
            const bladeMode = behavior === 'targetLock' ? `猎杀双刃 · 锁敌 ${f.targetRange}px` : `环蚀双刃 · 转速 ${f.orbitSpeed.toFixed(2)}rad/s`;
            lines = [`${bladeMode} · 刃长 ${Math.round(range)}px`, `保留 ${retained || '无'} · 雾域 ${Math.round(radius)}px · 坍缩 ${f.collapseDmg}`, `总理论DPS <span class="dps">${p.dpsEstimate.toFixed(1)}</span> · 满层腐蚀 ${fullDot.toFixed(1)}`];
          }
          const sig = ['nova', mode, ...lines, p.dmgMul].join(':');
          if (this.cache.dpsSig !== sig) {
            this.cache.dpsSig = sig;
            this.els.dps_panel.innerHTML =
              `<div class="cap">${p.form?.name || '腐蚀'}面板</div>` + lines.join('<br>');
          }
        } else if (weaponType === 'sword') {
          const panel = swordPanelModel(p);
          const sig = ['sword', panel.title, ...panel.lines].join(':');
          if (this.cache.dpsSig !== sig) {
            this.cache.dpsSig = sig;
            this.els.dps_panel.innerHTML =
              `<div class="cap">${panel.title}面板</div>` + panel.lines.join('<br>');
          }
        } else {
        const heavyAvg = f.heavyEvery ? (1 + 1 / f.heavyEvery) : 1;
        const perVolley = f.damage * p.dmgMul * heavyAvg;
        let dps = perVolley * (f.projectiles || 1) * rps;
        if (f.sideShots) dps += 2 * f.damage * 0.5 * p.dmgMul * heavyAvg * rps;
        const fx = [];
        if (f.splash) fx.push('溅射');
        if (f.ricochet) fx.push('弹射');
        if (f.sideShots) fx.push('侧弦');
        if (f.heavyEvery) fx.push('重弹');
        if (f.frag) fx.push('碎裂');
        if (f.explosiveEvery) fx.push('爆裂');
        if (f.homing) fx.push('追踪');
        if (f.charge) fx.push('蓄能');
        if (f.emp) fx.push('EMP');
        if (f.chain) fx.push('链电');
        if (f.pierce > 1) fx.push('贯穿' + f.pierce);
        const sig = [f.damage, f.interval, f.projectiles, p.dmgMul, p.atkSpdMul, fx.join(',')].join(':');
        if (this.cache.dpsSig !== sig) {
          this.cache.dpsSig = sig;
          this.els.dps_panel.innerHTML =
            `<div class="cap">火力面板</div>` +
            `伤害 <b>${(f.damage * p.dmgMul * heavyAvg).toFixed(1)}</b> × ${f.projectiles} 弹<br>` +
            `射速 <b>${rps.toFixed(1)}</b> 发/s（间隔 ${interval.toFixed(2)}s）<br>` +
            `单体DPS <span class="dps">${dps.toFixed(1)}</span>` +
            (fx.length ? `<br><span class="fx">⟪${fx.join('·')}⟫</span>` : '');
        }
        }
      } else this.els.dps_panel.innerHTML = '';
    }
    // 右键挥刀冷却
    if (this.els.sword_slot) {
      const cd = p.swordCd;
      this.els.sword_slot.classList.toggle('cd', cd > 0);
      this.els.sword_cd.textContent = cd > 0 ? cd.toFixed(1) + 's' : '就绪·右键';
    }

    const sig = p.weapons.map(w => `${w.id}:${w.level}`).join(',') + ':' + (p.form ? p.form.id : '') + ':' + p.skills.spent.size;
    if (this.cache.weaponSig !== sig) {
      this.cache.weaponSig = sig;
      this.els.weapon_slots.innerHTML = p.weapons.map(w => {
        const lv = p.treeId ? `⬢${p.skills.spent.size} · ${p.form ? p.form.name : ''}` : 'Lv' + w.level;
        return `<div class="slot" title="${w.def.name}" style="--wc:${p.form ? p.form.color : w.def.color}">${w.def.icon}<span class="lv">${lv}</span></div>`;
      }).join('');
    }
    const ssig = [p.maxHp, p.armor, p.dmgMul, p.atkSpdMul, p.moveMul, p.regen, p.shield, p.shieldMax].join(':');
    if (this.cache.statSig !== ssig) {
      this.cache.statSig = ssig;
      this.els.stat_strip.textContent =
        `❤${p.maxHp}  🎯${Math.round(p.dmgMul * 100)}%  ⚡${Math.round(p.atkSpdMul * 100)}%  🚀${Math.round(p.moveMul * 100)}%  🧱${p.armor}  🔧${p.regen.toFixed(1)}/s  🛡${p.shield}/${p.shieldMax}`;
    }
  },

  showGameOver(s) {
    this.els.run_summary.innerHTML =
      `存活 <b>${fmtTime(s.time)}</b> · 抵达 WAVE ${s.wave}<br>` +
      `最终等级 <b>Lv ${s.level}</b> · 击坠 <b>${s.kills}</b> 架<br>` +
      `总分 <b>${s.score}</b>`;
    this.els.gameover.classList.remove('hidden');
  },
};
