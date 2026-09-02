import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Math });
for (const file of ['js/utils.js', 'js/config.js', 'js/spawns.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
}

const snapshot = vm.runInContext(`({
  canvas: {width: CANVAS_W, height: CANVAS_H},
  defs: Object.keys(ENEMY_DEFS),
  roster: ENEMY_SPAWN_ROSTER.map(x => ({...x})),
  bosses: BOSS_SCHEDULE.map(x => ({...x})),
  massSpawns: MASS_SPAWNS.map(x => ({...x})),
  spawnDefsValid: validateSpawnDefinitions(),
  formations: Object.fromEntries(Object.entries(FORMATIONS).map(([id,f]) => [id, {id:f.id,role:f.role,category:f.category,unlockAt:f.unlockAt||0, units:f.build()}]))
})`, context);

const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const canvasTag = html.match(/<canvas\s+id="game"\s+width="(\d+)"\s+height="(\d+)"/);
assert(canvasTag, 'index.html 必须声明游戏画布尺寸');
assert.deepEqual([Number(canvasTag[1]), Number(canvasTag[2])], [snapshot.canvas.width, snapshot.canvas.height], 'HTML 画布必须与配置坐标系一致');

assert.equal(new Set(snapshot.roster.map(x => x.type)).size, snapshot.roster.length, '自然刷怪表不得重复类型');
assert(snapshot.spawnDefsValid, '全部阵型与批量生成配置必须通过启动校验');
for (const rule of snapshot.roster) {
  assert(snapshot.defs.includes(rule.type), `刷怪类型缺少定义: ${rule.type}`);
  assert(rule.weight > 0, `${rule.type} 权重必须为正数`);
  assert(rule.maxAlive > 0, `${rule.type} 场上上限必须为正数`);
}
for (const m of snapshot.massSpawns) {
  assert(snapshot.defs.includes(m.type) || m.type === 'mixed', `大批量方案类型缺少定义: ${m.type}`);
  assert(m.count >= 4 && m.count <= 30, `大批量方案 ${m.id} 数量超出 4~30`);
}
for (const [id, formation] of Object.entries(snapshot.formations)) {
  assert.equal(formation.id, id, `${id} 编队 id 必须与配置键一致`);
  assert(formation.role && formation.category, `${id} 必须声明战术职责与类别`);
  assert(formation.units.length > 0, `${id} 编队不能为空`);
  for (const unit of formation.units) {
    assert(snapshot.defs.includes(unit.type), `${id} 引用了不存在的类型 ${unit.type}`);
    const rule = snapshot.roster.find(x => x.type === unit.type);
    assert(rule, `${id} 的 ${unit.type} 不在自然解锁表中`);
    assert(rule.unlockAt <= formation.unlockAt, `${id} 早于 ${unit.type} 的解锁时间`);
  }
}
for (const boss of snapshot.bosses) {
  assert(snapshot.defs.includes(boss.type), `Boss 类型缺少定义: ${boss.type}`);
  assert(boss.at > 0, `Boss ${boss.type} 时间点必须为正数`);
}

console.log(`balance-smoke: ${snapshot.roster.length} natural enemies, ${Object.keys(snapshot.formations).length} formations, ${snapshot.bosses.length} boss event`);
