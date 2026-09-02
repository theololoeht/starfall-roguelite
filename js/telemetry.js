// 本地试玩遥测：仅 localhost + ?telemetry=1 启用，不上传、不记录按键或个人信息。
const RunMonitor = (() => {
  const STORAGE_KEY = 'starfall.playtest.runs.v1';
  const ACTIVE_KEY = 'starfall.playtest.active.v1';
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const enabled = /^(localhost|127\.0\.0\.1)$/.test(typeof location !== 'undefined' ? location.hostname : '') && params.get('telemetry') === '1';
  const session = params.get('session') || 'three-run-balance';
  const targetRuns = Math.max(1, Number(params.get('runs')) || 3);
  let active = null;
  let badge = null;
  let frameStats = { frames:0, lowFrames:0, minFps:Infinity, fpsSum:0 };

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch (_) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }
  function completedCount() {
    return read(STORAGE_KEY, []).filter(run => run.session === session && run.outcome !== 'abandoned').length;
  }
  function ensureBadge() {
    if (!enabled || badge || typeof document === 'undefined') return;
    badge = document.createElement('div');
    badge.id = 'playtest-rec';
    badge.style.cssText = 'position:fixed;left:14px;top:14px;z-index:30;padding:6px 9px;border:1px solid #ff5d7e;background:rgba(8,10,25,.84);color:#ff91aa;font:700 11px monospace;letter-spacing:.08em;pointer-events:none';
    document.body.appendChild(badge);
  }
  function updateBadge(text = '') {
    ensureBadge();
    if (badge) badge.textContent = `● REC ${Math.min(completedCount() + (active ? 1 : 0), targetRuns)}/${targetRuns}${text ? ` · ${text}` : ''}`;
  }
  function snapshotPlayer(game) {
    const p = game.player;
    return {
      hp:Math.max(0, p.hp), maxHp:p.maxHp, armor:p.armor, regen:p.regen,
      damageMul:p.dmgMul, attackSpeedMul:p.atkSpdMul, moveMul:p.moveMul,
      form:p.formId, formChain:[...(p.formChain || [])], skills:[...(p.skills?.spent || [])],
    };
  }
  function saveActive() {
    if (active) write(ACTIVE_KEY, active);
  }
  function archive(run) {
    const runs = read(STORAGE_KEY, []);
    runs.push(run);
    write(STORAGE_KEY, runs.slice(-30));
  }

  function start(game) {
    if (!enabled) return;
    const stale = read(ACTIVE_KEY, null);
    if (stale?.outcome === 'running') {
      stale.outcome = 'abandoned';
      stale.endedAt = new Date().toISOString();
      archive(stale);
    }
    frameStats = { frames:0, lowFrames:0, minFps:Infinity, fpsSum:0 };
    active = {
      schema:1, id:`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, session,
      targetRuns, startedAt:new Date().toISOString(), endedAt:null, outcome:'running',
      balance:BALANCE_MODE, weapon:game.initialWeapon, archetype:game.archetypeDef?.id || null,
      gameTimeStart:game.time, duration:0, level:game.level, kills:0, score:0,
      damageTaken:0, shieldBlocks:0, damageBySource:{}, bossEncounters:{},
      peakEnemies:0, peakEnemyBullets:0, averageFps:0, minFps:null, lowFrameRatio:0,
      events:[], samples:[], finalPlayer:null, lastSampleAt:game.time,
    };
    saveActive();
    updateBadge('RUNNING');
  }

  function event(type, data = {}, game = null) {
    if (!active) return;
    active.events.push({ t:Number((game?.time ?? active.duration).toFixed(2)), type, ...data });
    if (active.events.length > 600) active.events.shift();
  }

  function frame(rawDt) {
    if (!active || !Number.isFinite(rawDt) || rawDt <= 0) return;
    const fps = 1 / rawDt;
    frameStats.frames++;
    frameStats.fpsSum += fps;
    frameStats.minFps = Math.min(frameStats.minFps, fps);
    if (fps < 45) frameStats.lowFrames++;
  }

  function sample(game) {
    if (!active) return;
    active.duration = Math.max(0, game.time - active.gameTimeStart);
    active.level = game.level; active.kills = game.kills; active.score = game.score;
    active.peakEnemies = Math.max(active.peakEnemies, game.enemies.filter(e => !e.dead).length);
    active.peakEnemyBullets = Math.max(active.peakEnemyBullets, game.eBullets.filter(b => !b.dead).length);
    const boss = game.enemies.find(e => e.def?.boss && !e.dead);
    if (boss) {
      const record = active.bossEncounters[boss.type] || (active.bossEncounters[boss.type] = { firstSeen:game.time, phases:{}, defeatedAt:null });
      const phase = boss.phaseLabel || boss.phase || 'active';
      record.phases[phase] = (record.phases[phase] || 0) + Math.max(0, game.time - (active.lastTickAt || game.time));
    }
    active.lastTickAt = game.time;
    if (game.time - active.lastSampleAt >= 2) {
      active.lastSampleAt = game.time;
      active.samples.push({
        t:Number(active.duration.toFixed(1)), hp:Math.round(game.player.hp), level:game.level,
        enemies:game.enemies.filter(e => !e.dead).length, enemyBullets:game.eBullets.filter(b => !b.dead).length,
        form:game.player.formId, boss:boss ? `${boss.type}:${boss.phaseLabel || boss.phase}` : null,
      });
      saveActive();
    }
  }

  function damage(game, amount, source, blocked = false) {
    if (!active) return;
    const sourceName = source?.type || source?.def?.name || source?.constructor?.name || 'unknown';
    if (blocked) active.shieldBlocks++;
    else {
      active.damageTaken += amount;
      active.damageBySource[sourceName] = (active.damageBySource[sourceName] || 0) + amount;
    }
    event(blocked ? 'shield_block' : 'damage', { amount, source:sourceName, hp:Math.max(0, game.player.hp) }, game);
  }

  function bossDefeated(game, boss) {
    if (!active) return;
    const record = active.bossEncounters[boss.type] || (active.bossEncounters[boss.type] = { firstSeen:game.time, phases:{}, defeatedAt:null });
    record.defeatedAt = game.time;
    record.fightDuration = Number((game.time - record.firstSeen).toFixed(2));
    event('boss_defeated', { boss:boss.type, fightDuration:record.fightDuration }, game);
  }

  function transition(game, from, to, reason) {
    if (!active) return;
    event('state', { from, to, reason }, game);
    if (to === RUN_STATES.VICTORY) finish(game, 'victory');
    else if (to === RUN_STATES.GAMEOVER) finish(game, 'gameover');
    else if (to === RUN_STATES.MENU && from !== RUN_STATES.MENU) finish(game, 'quit');
  }

  function finish(game, outcome) {
    if (!active || active.outcome !== 'running') return;
    active.outcome = outcome;
    active.endedAt = new Date().toISOString();
    active.duration = Math.max(0, game.time - active.gameTimeStart);
    active.level = game.level; active.kills = game.kills; active.score = game.score;
    active.finalPlayer = snapshotPlayer(game);
    active.averageFps = frameStats.frames ? Number((frameStats.fpsSum / frameStats.frames).toFixed(1)) : 0;
    active.minFps = Number.isFinite(frameStats.minFps) ? Number(frameStats.minFps.toFixed(1)) : null;
    active.lowFrameRatio = frameStats.frames ? Number((frameStats.lowFrames / frameStats.frames).toFixed(4)) : 0;
    delete active.lastSampleAt; delete active.lastTickAt;
    archive(active);
    remove(ACTIVE_KEY);
    const finished = active;
    active = null;
    updateBadge(`${outcome.toUpperCase()} · ${completedCount()}/${targetRuns}`);
    return finished;
  }

  return { enabled, session, targetRuns, start, event, frame, sample, damage, bossDefeated, transition, finish, storageKey:STORAGE_KEY };
})();
