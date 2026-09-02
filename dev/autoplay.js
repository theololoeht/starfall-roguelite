// localhost 开发验收：?autoplay=1&debug=boss
(() => {
  const params = new URLSearchParams(location.search);
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || params.get('autoplay') !== '1') return;

  const report = { started:false, transitions:[], checks:{}, finished:false };
  const phaseDemo = params.get('autoplayMode') === 'phases';
  window.__STARFALL_AUTOPLAY_REPORT__ = report;
  const publish = status => {
    document.documentElement.dataset.autoplayStatus = status;
    document.documentElement.dataset.autoplayReport = JSON.stringify(report);
  };
  publish('starting');
  UI.selected = params.get('weapon') || 'sword';
  UI.archId = 'fortress'; UI.banId = 'heavy';
  UI.startRun(); report.started = true; publish('running');

  const start = performance.now();
  let lastTransitionKey = '';
  const timer = setInterval(() => {
    try {
    const elapsed = (performance.now() - start) / 1000;
    input.mouseActive = true;
    input.mx = CANVAS_W / 2 + Math.cos(elapsed * 1.7) * 190;
    input.my = CANVAS_H / 2 + Math.sin(elapsed * 1.3) * 120;
    if (game.lastStateTransition) {
      const key = JSON.stringify(game.lastStateTransition);
      if (key !== lastTransitionKey) {
        report.transitions.push({ ...game.lastStateTransition });
        lastTransitionKey = key;
      }
    }
    report.liveState = game.state;
    report.gameTime = Number(game.time.toFixed(2));
    report.bossAlive = game.enemies.some(e => e.def?.boss && !e.dead);

    if (elapsed > 1 && !report.checks.pause) {
      game.togglePause(); report.checks.pause = game.state === RUN_STATES.PAUSED;
      game.togglePause(); report.checks.resume = game.state === RUN_STATES.PLAYING;
    }
    if (elapsed > 2 && !report.checks.tree) {
      game.openTree(); report.checks.tree = game.state === RUN_STATES.TREE;
      game.closeTree(); report.checks.treeReturn = game.state === RUN_STATES.PLAYING;
    }
    if (elapsed > 2.5 && !report.checks.levelupInjected && game.state === RUN_STATES.PLAYING) {
      report.checks.levelupInjected = true;
      game.gainXP(xpNeed(game.level));
    }
    if (game.state === RUN_STATES.LEVELUP) {
      if (!report.checks.levelupTree) {
        UI.hideStatChoice();
        game.openTree(RUN_STATES.LEVELUP);
        report.checks.levelupTree = game.state === RUN_STATES.TREE;
        game.closeTree();
        report.checks.levelupReturn = game.state === RUN_STATES.LEVELUP;
      }
      game.pickStat(game.buildStatCards()[0]);
      report.checks.levelupResolved = game.state === RUN_STATES.PLAYING || game.statPending > 0;
    }
    const boss = game.enemies.find(e => e.def?.boss && !e.dead);
    if (boss) {
      report.checks.bossSeen = true;
      report.boss = { type:boss.type, hp:Math.round(boss.hp), spawning:boss.spawning, phase:boss.phase };
    }
    if (boss?.type === 'prism' && phaseDemo && !report.checks.midBossOverload && elapsed > 4) {
      boss.hp = boss.maxHp * 0.49;
      report.checks.midBossOverload = true;
    }
    const killAfter = boss?.type === 'prism' && phaseDemo ? 8 : 4;
    if (boss && !boss.spawning && game.state === RUN_STATES.PLAYING && elapsed > killAfter) {
      report.checks.bossKillAttempted = true;
      const scheduleEvent = BOSS_SCHEDULE.find(event => event.type === boss.type);
      report.boss.scheduleMatch = !!scheduleEvent;
      boss.hurt(boss.hp + 1, game, true);
      report.boss.afterState = game.state;
      report.boss.afterDead = boss.dead;
      report.boss.lastTransition = game.lastStateTransition;
      report.boss.errMsg = game.errMsg || null;
      report.checks.bossDefeated = boss.dead && (scheduleEvent?.final ? game.state === RUN_STATES.VICTORY : game.state === RUN_STATES.PLAYING);
      report.liveState = game.state;
      report.bossAlive = !boss.dead;
    }
    if (game.state === RUN_STATES.VICTORY || game.state === RUN_STATES.GAMEOVER || elapsed > 12) {
      report.finalState = game.state; report.finished = true;
      report.checks.noInvalidTransition = !game.errMsg;
      clearInterval(timer);
      publish('finished');
      console.info('[Starfall autoplay]', JSON.stringify(report));
    }
    else publish('running');
    } catch (error) {
      report.error = String(error?.stack || error);
      report.finalState = typeof game === 'undefined' ? 'unavailable' : game.state;
      report.finished = true;
      clearInterval(timer);
      publish('failed');
      console.error('[Starfall autoplay failed]', report.error);
    }
  }, 100);
})();
