const RUN_STATES = Object.freeze({
  MENU:'menu', PLAYING:'playing', LEVELUP:'levelup', TREE:'tree', PAUSED:'paused',
  BOSS_INTRO:'bossIntro', VICTORY:'victory', GAMEOVER:'gameover',
});

const RUN_STATE_TRANSITIONS = Object.freeze({
  menu:        new Set(['playing']),
  playing:     new Set(['levelup','tree','paused','bossIntro','victory','gameover','menu']),
  levelup:     new Set(['tree','playing','menu']),
  tree:        new Set(['playing','levelup','menu']),
  paused:      new Set(['playing','menu']),
  bossIntro:   new Set(['playing','gameover','menu']),
  victory:     new Set(['playing','menu']),
  gameover:    new Set(['playing','menu']),
});

function canTransitionRunState(from, to) {
  return from === to || !!RUN_STATE_TRANSITIONS[from]?.has(to);
}

function transitionRunState(game, to, reason = '', force = false) {
  const from = game.state;
  if (!force && !canTransitionRunState(from, to)) throw new Error(`非法状态转换: ${from} -> ${to}${reason ? ` (${reason})` : ''}`);
  game.state = to;
  game.lastStateTransition = { from, to, reason, at:game.time || 0 };
  if (typeof RunMonitor !== 'undefined') RunMonitor.transition(game, from, to, reason);
  return to;
}
