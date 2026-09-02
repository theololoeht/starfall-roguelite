// ===== 画布（横板）=====
const CANVAS_W = 1080, CANVAS_H = 675;
const WEAPON_SLOTS = 6;

// ===== 数值配置档 =====
// 正式版默认使用 actual；测试版使用 ?balance=test；指定 Boss 场景额外加 &debug=boss。
// 测试档只缩短验证周期、提高容错，不覆盖下方怪物/武器的原始设计数据。
const BALANCE_PROFILES = {
  actual: {
    id: 'actual', label: '正式数值',
    combat: { playerHpMul: 1, playerDamageMul: 1, enemyHpMul: 1, enemyDamageMul: 1, xpMul: 1, scoreMul: 1 },
    pacing: {
      unlockScale: 1, waveLen: 30, spawnWindow: 20,
      formationInterval: 40, firstFormationAt: 35, spawnTelegraph: 0.55,
      enemySoftCap: 85, enemyHardCap: 150, bossSoftCap: 34, pressure: 0.5,
      spawnBase: 1.5, spawnMin: 0.7, spawnAcceleration: 0.005,
      emptyFieldAcceleration: 5, groupRampSeconds: 240, bossAt: 180, massShare: 0.55, firstMassAt: 30, massInterval: 30,
    },
    growth: { hpPerSecond: 0.005, hpPerWave: 0.02 },
  },
  test: {
    id: 'test', label: '测试数值',
    combat: { playerHpMul: 3, playerDamageMul: 2, enemyHpMul: 0.65, enemyDamageMul: 0.5, xpMul: 3, scoreMul: 1 },
    pacing: {
      unlockScale: 0.2, waveLen: 12, spawnWindow: 9,
      formationInterval: 12, firstFormationAt: 8, spawnTelegraph: 0.45,
      enemySoftCap: 60, enemyHardCap: 110, bossSoftCap: 26, pressure: 0.6,
      spawnBase: 0.9, spawnMin: 0.4, spawnAcceleration: 0.008,
      emptyFieldAcceleration: 8, groupRampSeconds: 48, bossAt: 36, massShare: 0.6, firstMassAt: 10, massInterval: 14,
    },
    growth: { hpPerSecond: 0.005, hpPerWave: 0.02 },
  },
};
const BALANCE_QUERY = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('balance') : null;
const BALANCE_MODE = BALANCE_QUERY === 'test' ? 'test' : 'actual';
const BALANCE = BALANCE_PROFILES[BALANCE_MODE];
const DEBUG_SCENARIO = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('debug') : null;
const DEBUG_SCENARIOS = {
  boss: { playerHp: 99999, bossLeadSeconds: 0.25, disableNaturalSpawns: true },
};
const DEBUG_SETTINGS = DEBUG_SCENARIOS[DEBUG_SCENARIO] || null;

function scaledEnemyDamage(value) { return value * BALANCE.combat.enemyDamageMul; }
function formationUnlockAt(formation) { return (formation.unlockAt || 0) * BALANCE.pacing.unlockScale; }

// ===== 玩家基础属性 =====
const PLAYER_BASE = {
  maxHp: 100,
  speed: 300,
  radius: 13,
  pickupRange: 90,
  armor: 0,
  regen: 0,
  dmgMul: 1,
  atkSpdMul: 1,
  moveMul: 1,
};

// ===== 升级所需经验（升级更快）=====
function xpNeed(level) { return Math.floor(5 + level * 3 + level * level * 0.4); }

// ===== 数值成长三选一（每级 1 次，自选数值方向）=====
const STAT_CHOICES = [
  { id: 'dmg',    name: '火力校准', icon: '🎯', desc: '全局伤害 +12%',  apply(p) { p.dmgMul += 0.12; } },
  { id: 'rof',    name: '射频加速', icon: '⚡', desc: '攻击速度 +10%',  apply(p) { p.atkSpdMul += 0.10; } },
  { id: 'hp',     name: '船体加固', icon: '❤️', desc: '生命上限 +14 并回复 14', apply(p) { p.maxHp += 14; p.hp = Math.min(p.maxHp, p.hp + 14); } },
  { id: 'spd',    name: '推进强化', icon: '🚀', desc: '移动速度 +9%',   apply(p) { p.moveMul += 0.09; } },
  { id: 'armor',  name: '附加装甲', icon: '🧱', desc: '护甲 +1',        apply(p) { p.armor += 1; } },
  { id: 'magnet', name: '磁力牵引', icon: '🧲', desc: '拾取范围 +25%',  apply(p) { p.pickupRange *= 1.25; } },
  { id: 'regen',  name: '纳米维修', icon: '🔧', desc: '每秒回复 +0.6',  apply(p) { p.regen += 0.6; } },
];

// ===== 敌机图鉴（Nova Drift 式霓虹几何体）=====
// 特效：出生传送门、受击白闪、死亡爆闪+冲击环；特殊行为自带前摇特效
const ENEMY_DEFS = {
  rock: {   // 陨石：缓慢漂移，死亡分裂成两块小陨石
    name: '陨石', hp: 20, speed: 32, r: 19, dmg: 8, xp: 2, score: 15, color: '#b06a52',
    drift: true, splitRock: 2,
  },
  rock_s: { // 小陨石
    name: '陨石碎块', hp: 8, speed: 62, r: 10, dmg: 5, xp: 1, score: 5, color: '#c07a5e',
    drift: true,
  },
  mite: {   // 蜂群：直线扑向玩家（开局不开晃）
    name: '蜂群', hp: 5, speed: 150, r: 9, dmg: 6, xp: 1, score: 10, color: '#ff2e4d',
  },
  dasher: { // 掠袭者：蓄力锁定→高速突刺（限量）
    name: '掠袭者', hp: 14, speed: 95, r: 12, dmg: 10, xp: 2, score: 25, color: '#ff5d3d',
  },
  gunner: { // 炮手：保持距离，发射【单发】子弹
    name: '炮手', hp: 20, speed: 70, r: 13, dmg: 8, xp: 2, score: 30, color: '#ff8c42',
    fireInterval: 2.8, bulletSpeed: 230, bulletDmg: 8, shots: 1,
  },
  burst: {  // 连射兵：发射【一串】3 连子弹
    name: '连射兵', hp: 26, speed: 65, r: 14, dmg: 8, xp: 3, score: 45, color: '#ff5577',
    fireInterval: 3.4, bulletSpeed: 235, bulletDmg: 8, shots: 3, burstGap: 0.13,
  },
  scatter: { // 散射兵：发射【五向散射】弹
    name: '散射兵', hp: 34, speed: 60, r: 15, dmg: 8, xp: 4, score: 60, color: '#ff3366',
    fireInterval: 3.8, bulletSpeed: 210, bulletDmg: 8, shots: 5, fan: 0.55,
  },
  bastion: { // 堡垒：重装缓慢逼近，死亡环形弹幕
    name: '堡垒', hp: 110, speed: 28, r: 25, dmg: 16, xp: 6, score: 90, color: '#ff3d3d',
    deathBurst: { n: 10, speed: 170, dmg: 8 },
  },
  bomber: { // 自爆虫：径直冲向玩家，死亡/接触时爆炸
    name: '自爆虫', hp: 16, speed: 132, r: 11, dmg: 6, xp: 2, score: 30, color: '#ff4d2e',
    bomb: { r: 80, dmg: 20 },
  },
  sniper: { // 狙击塔：超远距离，0.6 秒瞄准线预警后发射高速弹
    name: '狙击塔', hp: 18, speed: 55, r: 12, dmg: 10, xp: 3, score: 50, color: '#d43d3d',
    fireInterval: 4.2, bulletSpeed: 400, bulletDmg: 12, snipe: true, snipeTime: 0.6,
    keepMin: 360, keepMax: 470,
  },
  miner: { // 布雷者：沿路投掷感应地雷
    name: '布雷者', hp: 30, speed: 40, r: 14, dmg: 8, xp: 4, score: 55, color: '#ff7d5a',
    dropEvery: 3.2, mineArm: 1.0, mineLife: 12, mineR: 60, mineDmg: 16,
  },
  hive: { // 蜂巢母体：缓慢逼近，周期孵化蜂群；死亡再释放一批
    name: '蜂巢母体', hp: 130, speed: 22, r: 30, dmg: 12, xp: 8, score: 110, color: '#ff6b81',
    hiveEvery: 5, hiveChildren: 2, hiveDeath: 4,
  },
  dragon: { // 星蚀龙：三分钟首领，身体由路径采样的独立节段构成
    name: '星蚀龙', hp: 900, speed: 92, r: 27, dmg: 22, xp: 36, score: 1800, color: '#ff4d6d',
    boss: true, fireInterval: 2.4, bulletSpeed: 245, bulletDmg: 10,
    orbitDuration: 6.5, bodyFireInterval: 0.9, bodyDamageMul: 0.35,
    assaultTelegraph: 0.9, assaultDuration: 0.82, assaultSpeed: 470,
    breathWindup: 1.2, breathDuration: 2.5, breathRange: 650, breathWidth: 34, breathDmg: 18,
  },
};

// ===== 武器身份与实验原型数值 =====
const WEAPON_DEFS = {
  cannon: {
    id: 'cannon', name: '脉冲机炮', icon: '🔫', color: '#4fd2ff', type: 'gun',
    tag: '传统射击',
    desc: '鼠标模式自动索敌；WASD 模式沿机头射击。蜂巢树可溅射、弹射、侧弦。',
  },
  laser: {
    id: 'laser', name: '聚焦激光', icon: '🔆', color: '#ffe25d', type: 'laser',
    tag: '激光 · 贯穿',
    desc: '持续聚焦光束灼烧单一目标，高DPS；满级射线贯穿整条直线。',
    maxLevel: 5,
    levelStats(lv) {
      return {
        dps:   [0, 16, 22, 29, 38, 50][lv],
        width: [0, 4, 5, 6, 7, 9][lv],
        range: 430,
        beams: [0, 1, 1, 1, 2, 2][lv],   // Lv4 起双束分光
        pierce: lv >= 5,                 // Lv5 贯穿直线
      };
    },
    levelNames: [null, '聚焦光束', '功率提升', '过载透镜', '双束分光', '贯穿射线'],
  },
  ram: {
    id: 'ram', name: '冲撞装甲', icon: '🛡️', color: '#ff9d5d', type: 'ram',
    tag: '撞击 · 拖尾',
    desc: '周期性向敌机突进，撞击造成大额伤害与击退，突进无敌并留下炽热拖尾。',
    maxLevel: 5,
    levelStats(lv) {
      return {
        damage:   [0, 16, 24, 33, 44, 58][lv],
        interval: [0, 3.8, 3.3, 2.9, 2.5, 2.1][lv],
        dashSpeed: 980, dashTime: 0.32,
      };
    },
    levelNames: [null, '启动冲角', '撞击强化', '液压增压', '过载冲程', '歼灭冲撞'],
  },
  nova: {
    id: 'nova', name: '腐蚀孢子', icon: '☢️', color: '#8dff5d', type: 'nova',
    tag: 'DoT · 远程叠毒',
    desc: '机体周围释放漂移孢子，靠近敌机后激活追踪并叠加腐蚀；进化为焰刃或粒子雾。',
  },
  sword: {
    id: 'sword', name: '相位刃', icon: '⚔️', color: '#ff5de3', type: 'sword',
    tag: '挥剑 · 贴脸',
    desc: '机身周身弧形荧光斩击，适合在敌机群中穿行贴脸输出。',
  },
  trail: {
    id: 'trail', name: '矢量尾焰', icon: '🌠', color: '#5dffd2', type: 'trail',
    tag: '轨迹 · 领域',
    desc: '飞行时喷洒高温等离子尾迹，敌机穿越时被持续灼烧。',
    maxLevel: 5,
    levelStats(lv) {
      return {
        dps:     [0, 8, 11, 15, 20, 26][lv],
        segLife: [0, 2.2, 2.4, 2.6, 2.8, 3.2][lv],
        width:   [0, 26, 30, 34, 38, 44][lv],
        dropInterval: 0.07,
      };
    },
    levelNames: [null, '离子喷洒', '尾焰增压', '等离子加浓', '宽域尾迹', '高能彗流'],
  },
};

// ===== 蜂巢技能树（v0.6：节点=特殊效果，不再是纯数值）=====
const SKILL_TREES = {
  cannon: {
    color: '#4fd2ff',
    progression: { attacks: 'retain', upgrades: 'chain' },
    branchForms: ['shotgun', 'rail'],
    finalForm: 'ultimate',
    forms: {
      base: {
        id: 'base', name: '脉冲机炮', icon: '🔫', color: '#4fd2ff',
        desc: '鼠标模式自动索敌，WASD 模式沿机头发射脉冲弹',
        fire: { damage: 8, interval: 0.46, projectiles: 1, bulletSpeed: 640, bulletR: 4.5, pierce: 1, spread: 0.11 },
        nodes: [
          { id: 'c1', name: '过载弹芯', desc: '⟪特殊⟫ 命中溅射：波及周围 45px 敌人（35% 伤害）', apply(f) { f.splash = 45; f.splashMul = 0.35; } },
          { id: 'c2', name: '弹射机制', desc: '⟪特殊⟫ 子弹命中后弹向最近的另一敌机（60% 伤害，1 次）', apply(f) { f.ricochet = 1; f.ricochetMul = 0.6; } },
          { id: 'c3', name: '侧弦击发', desc: '⟪特殊⟫ 每次射击同时向 ±24° 各发射 1 发副弹（50% 伤害）', apply(f) { f.sideShots = true; } },
        ],
        capstone: { id: 'c0', name: '火控中枢', desc: '⟪特殊⟫ 重型轮射：每第 3 发为重弹（×2 伤害、巨弹、击退），贯穿 +1', apply(f) { f.heavyEvery = 3; f.pierce += 1; } },
        evolutions: [
          { id: 'shotgun', name: '精华 · 散裂弹幕', icon: '🌟', color: '#ff5de3', desc: '改变攻击形式：五向散射压制（射速略降，弹幕 ×5）' },
          { id: 'rail', name: '精华 · 贯穿磁轨', icon: '🎯', color: '#ffd25d', desc: '改变攻击形式：重型磁轨弹（射速大降，单发高伤+贯穿）' },
        ],
      },
      shotgun: {
        id: 'shotgun', name: '散裂弹幕', icon: '🌟', color: '#ff5de3',
        desc: '五向散射，近距离压制八方',
        fire: { damage: 6, interval: 0.62, projectiles: 5, bulletSpeed: 560, bulletR: 4, pierce: 1, spread: 0.16 },
        nodes: [
          { id: 's1', name: '碎裂弹幕', desc: '⟪特殊⟫ 子弹命中碎成 2 枚碎片（25% 伤害）', apply(f) { f.frag = 2; } },
          { id: 's2', name: '烈性爆裂', desc: '⟪特殊⟫ 每第 4 发为爆裂弹：命中引发 70px 爆炸', apply(f) { f.explosiveEvery = 4; f.explosiveR = 70; } },
          { id: 's3', name: '蜂群制导', desc: '⟪特殊⟫ 全部子弹轻微追踪最近敌机', apply(f) { f.homing = true; } },
        ],
        capstone: { id: 's0', name: '弹幕风暴', desc: '⟪特殊⟫ 全部子弹获得 1 次弹射，伤害 +30%', apply(f) { f.ricochet = (f.ricochet || 0) + 1; f.damage *= 1.3; } },
        evolutions: [
          { id: 'ultimate', name: '终极进化 · 湮灭星舰', icon: '👑', color: '#e8f4ff', desc: '飞升为终极形态：湮灭主炮 + 棱镜舷' },
        ],
      },
      ultimate: {
        id: 'ultimate', name: '湮灭星舰', icon: '👑', color: '#e8f4ff',
        desc: '终极形态：湮灭主炮五连 + 棱镜舷，集三系之大成',
        fire: { damage: 30, interval: 0.42, projectiles: 5, bulletSpeed: 760, bulletR: 6, pierce: 3, spread: 0.14, splash: 40, splashMul: 0.3 },
        nodes: [   // 上三门 = 特殊效果；下三门 = 高数值
          { id: 'u1', name: '棱镜环', desc: '⟪特殊⟫ 子弹附加弹射 +1（60% 伤害）', apply(f) { f.ricochet = (f.ricochet || 0) + 1; } },
          { id: 'u2', name: '追踪棱镜', desc: '⟪特殊⟫ 全部子弹轻微追踪敌机', apply(f) { f.homing = true; } },
          { id: 'u3', name: '湮灭溅环', desc: '⟪特殊⟫ 命中溅射 70px（45% 伤害）', apply(f) { f.splash = 70; f.splashMul = 0.45; } },
          { id: 'u4', name: '湮灭装填', desc: '⟪高数值⟫ 伤害 ×1.5', apply(f) { f.damage *= 1.5; } },
          { id: 'u5', name: '射频超载', desc: '⟪高数值⟫ 攻击速度 +33%', apply(f) { f.interval *= 0.75; } },
          { id: 'u6', name: '弹幕扩容', desc: '⟪高数值⟫ 弹道 +2', apply(f) { f.projectiles += 2; } },
        ],
        evolutions: [],
      },
      rail: {
        id: 'rail', name: '贯穿磁轨', icon: '🎯', color: '#ffd25d',
        desc: '重型磁轨弹，贯穿一线',
        fire: { damage: 26, interval: 0.8, projectiles: 1, bulletSpeed: 900, bulletR: 6, pierce: 4, spread: 0.03 },
        nodes: [
          { id: 'r1', name: '磁场贯穿', desc: '贯穿 +2（贯穿伤害不衰减）', apply(f) { f.pierce += 2; } },
          { id: 'r2', name: '蓄能狙击', desc: '⟪特殊⟫ 静止 0.5 秒后，下一发伤害 ×2.5（超大弹体）', apply(f) { f.charge = true; } },
          { id: 'r3', name: '电磁脉冲', desc: '⟪特殊⟫ 每 4 秒自动释放 EMP：清除 160px 内敌弹并造成伤害', apply(f) { f.emp = true; } },
        ],
        capstone: { id: 'r0', name: '湮灭磁轨', desc: '⟪特殊⟫ 链式闪电：命中跳向 2 个敌人（40% 伤害），伤害 +40%', apply(f) { f.chain = 2; f.damage *= 1.4; } },
        evolutions: [
          { id: 'ultimate', name: '终极进化 · 湮灭星舰', icon: '👑', color: '#e8f4ff', desc: '保留磁轨主炮，新增湮灭炮组与棱镜侧舷' },
        ],
      },
    },
  },
  nova: {
    color: '#8dff5d',
    progression: { attacks: 'retain', upgrades: 'chain' },
    branchForms: ['flameblade', 'mist'],
    finalForm: 'plague',
    forms: {
      base: {
        id: 'base', name: '腐蚀孢子', icon: '☢️', color: '#8dff5d',
        desc: '原型机：机体周围释放漂移孢子，近敌激活追踪，命中后建立持续伤害',
        fire: {
          mode: 'spore', damage: 5, range: 620, interval: 0.72, bulletSpeed: 520, bulletR: 7, pierce: 1,
          stacks: 1, stackDps: 1.5, maxStacks: 4, stackDuration: 3.5,
          origin: { type: 'bodyScatter', minRadius: 8, maxRadius: 26 },
          targeting: { type: 'proximityArm', acquireRadius: 150, turnSpeed: 4.2 },
          launch: { driftSpeedMinMul: 0.18, driftSpeedMaxMul: 0.28, chaseAccel: 420 },
          capacity: { maxAlive: 10 }, life: 5.5,
        },
        nodes: [
          { id: 'n1', name: '扩散介质', desc: '所有范围或射程 +20%', apply(f) { f.rangeMul = (f.rangeMul || 1) * 1.2; } },
          { id: 'n2', name: '催化毒层', desc: '腐蚀层数上限 +3', apply(f) { f.maxStacks += 3; } },
          { id: 'n3', name: '长效残留', desc: '腐蚀伤害 +45%，持续时间 +1.5 秒', apply(f) { f.dotMul = (f.dotMul || 1) * 1.45; f.stackDuration += 1.5; } },
        ],
        capstone: { id: 'n0', name: '裂孢弹头', desc: '孢子命中时感染 48px 内其他敌机；解锁焰刃与粒子雾分支', apply(f) { f.sporeBurst = 48; } },
        evolutions: [
          { id: 'flameblade', name: '精华 · 连续焰刃', icon: '🔥', color: '#ff9d5d', desc: '将远程孢子改造为朝机头持续喷射的中近程腐蚀焰刃' },
          { id: 'mist', name: '精华 · 粒子毒雾', icon: '🫧', color: '#5dffd2', desc: '释放驻留粒子雾，持续污染机体周围区域' },
        ],
      },
      flameblade: {
        id: 'flameblade', name: '连续焰刃', icon: '🔥', color: '#ff9d5d',
        desc: '前向持续喷焰，以线段宽度判定切开近中距离敌群',
        fire: { mode: 'flameblade', dps: 18, range: 180, width: 46, tick: 0.12, stackEvery: 0.4, stackDps: 2.2, maxStacks: 7, stackDuration: 4 },
        nodes: [
          { id: 'nf1', name: '延展焰锋', desc: '焰刃射程 +28%', apply(f) { f.bladeRangeMul = (f.bladeRangeMul || 1) * 1.28; } },
          { id: 'nf2', name: '宽域喷口', desc: '焰刃宽度 +40%', apply(f) { f.bladeWidthMul = (f.bladeWidthMul || 1) * 1.4; } },
          { id: 'nf3', name: '白热催化', desc: '焰刃直接伤害与腐蚀伤害 +35%', apply(f) { f.bladeDmgMul = (f.bladeDmgMul || 1) * 1.35; f.dotMul = (f.dotMul || 1) * 1.35; } },
        ],
        capstone: { id: 'nf0', name: '双生焰刃', desc: '喷出两道交叉焰锋，覆盖更宽前方区域', apply(f) { f.twinBlade = true; } },
        evolutions: [{ id: 'plague', name: '终极 · 猎杀疫焰', icon: '♨️', color: '#eaffc7', desc: '保留原焰刃，新增主动锁敌的双疫焰刃、毒雾与坍缩' }],
      },
      mist: {
        id: 'mist', name: '粒子毒雾', icon: '🫧', color: '#5dffd2',
        desc: '在世界坐标留下漂浮腐蚀粒子，形成持续范围压制',
        fire: { mode: 'mist', dps: 12, radius: 135, tick: 0.18, emitInterval: 0.07, moteLife: 1.7, maxMotes: 34, stackEvery: 0.45, stackDps: 2.1, maxStacks: 7, stackDuration: 4.2 },
        nodes: [
          { id: 'nm1', name: '雾域扩张', desc: '毒雾半径 +28%', apply(f) { f.mistRadiusMul = (f.mistRadiusMul || 1) * 1.28; } },
          { id: 'nm2', name: '粒子增殖', desc: '粒子上限 +50%，雾域伤害 +20%', apply(f) { f.moteMul = (f.moteMul || 1) * 1.5; f.mistDmgMul = (f.mistDmgMul || 1) * 1.2; } },
          { id: 'nm3', name: '凝滞毒核', desc: '腐蚀伤害 +55%，雾粒驻留更久', apply(f) { f.dotMul = (f.dotMul || 1) * 1.55; f.moteLife *= 1.25; } },
        ],
        capstone: { id: 'nm0', name: '孢子坍缩', desc: '每 3 秒使雾域收缩爆发一次', apply(f) { f.mistCollapse = true; } },
        evolutions: [{ id: 'plague', name: '终极 · 环蚀疫焰', icon: '♨️', color: '#eaffc7', desc: '保留原毒雾，新增绕机旋转的双疫焰刃与周期坍缩' }],
      },
      plague: {
        id: 'plague', name: '疫焰天灾', icon: '♨️', color: '#eaffc7',
        desc: '终极机：根据进化来源新增锁敌或旋转双刃，并维持粒子雾与周期坍缩',
        fire: {
          mode: 'plague', dps: 28, range: 210, width: 54, radius: 165, tick: 0.12,
          emitInterval: 0.05, moteLife: 1.9, maxMotes: 46, stackEvery: 0.32,
          stackDps: 4.5, maxStacks: 12, stackDuration: 5, collapseInterval: 2.4, collapseDmg: 34,
          bladeBehaviorByParent: { flameblade: 'targetLock', mist: 'orbit' },
          targetRange: 560, targetTurnSpeed: 6.5, bladeSpread: 0.13, orbitSpeed: 1.65,
        },
        nodes: [
          { id: 'np1', name: '天灾延展', desc: '焰刃射程与雾域半径 +18%', apply(f) { f.rangeMul = (f.rangeMul || 1) * 1.18; } },
          { id: 'np2', name: '高压喷流', desc: '焰刃宽度 +25%', apply(f) { f.bladeWidthMul = (f.bladeWidthMul || 1) * 1.25; } },
          { id: 'np3', name: '灾厄密度', desc: '粒子数量 +35%', apply(f) { f.moteMul = (f.moteMul || 1) * 1.35; } },
          { id: 'np4', name: '腐蚀过载', desc: '全部持续伤害 +35%', apply(f) { f.dotMul = (f.dotMul || 1) * 1.35; } },
          { id: 'np5', name: '坍缩加速', desc: '领域坍缩间隔 -25%', apply(f) { f.collapseInterval *= 0.75; } },
          { id: 'np6', name: '终末反应', desc: '直接伤害 +30%', apply(f) { f.bladeDmgMul = (f.bladeDmgMul || 1) * 1.3; f.mistDmgMul = (f.mistDmgMul || 1) * 1.3; } },
        ],
        evolutions: [],
      },
    },
  },
  sword: {
    color: '#b77dff',
    progression: { attacks: 'retain', upgrades: 'chain' },
    branchForms: ['orbit', 'hunter'],
    finalForm: 'ascendant',
    forms: {
      base: {
        id: 'base', name: '相位刃', icon: '⚔️', color: '#b77dff',
        desc: '锁定近敌后以前摇提示方向，沿弧线完成近战切割',
        fire: { mode: 'sword_slash', damage: 12, interval: 1.5, arc: 140 * Math.PI / 180, radius: 85, sweepTime: 0.22, windup: 0.14 },
        nodes: [
          { id: 'w1', name: '刃身延展', desc: '斩击半径 +28', apply(f) { if (Number.isFinite(f.radius)) f.radius += 28; } },
          { id: 'w2', name: '广角相位', desc: '斩击弧度 +50°', apply(f) { if (Number.isFinite(f.arc)) f.arc = Math.min(TAU, f.arc + 50 * Math.PI / 180); } },
          { id: 'w3', name: '高频驱动', desc: '攻击间隔缩短 25%，挥刀速度加快', apply(f) { if (Number.isFinite(f.interval)) f.interval *= 0.75; if (Number.isFinite(f.sweepTime)) f.sweepTime *= 0.82; } },
        ],
        capstone: { id: 'w0', name: '万刃圆斩', desc: '斩击扩展为 360°，伤害 ×1.35，并产生第二道余光', apply(f) { if (Number.isFinite(f.arc)) f.arc = TAU; if (Number.isFinite(f.damage)) f.damage *= 1.35; f.echo = true; } },
        evolutions: [
          { id: 'orbit', name: '精华 · 护航环刃', icon: '🛞', color: '#65e7ff', desc: '保留基础弧斩，新增持续绕机旋转的防守环刃' },
          { id: 'hunter', name: '精华 · 猎杀相位', icon: '➤', color: '#ff73d1', desc: '保留基础弧斩，新增主动锁敌的远程相位波' },
        ],
      },
      orbit: {
        id: 'orbit', name: '护航环刃', icon: '🛞', color: '#65e7ff',
        desc: '三枚相位刃自动绕机旋转，切割靠近的敌人与弹幕',
        fire: { mode: 'orbit_blade', damage: 7, tick: 0.16, radius: 112, bladeRadius: 17, blades: 3, spinSpeed: 2.4 },
        nodes: [
          { id: 'wo1', name: '轨道外扩', desc: '环刃半径 +24', apply(f) { if (Number.isFinite(f.radius)) f.radius += 24; } },
          { id: 'wo2', name: '四刃阵列', desc: '环刃数量 +1', apply(f) { if (Number.isFinite(f.blades)) f.blades += 1; } },
          { id: 'wo3', name: '超频轴承', desc: '旋转速度 +35%，伤害 +20%', apply(f) { if (Number.isFinite(f.spinSpeed)) f.spinSpeed *= 1.35; if (Number.isFinite(f.damage)) f.damage *= 1.2; } },
        ],
        capstone: { id: 'wo0', name: '拒止力场', desc: '环刃可清除接触到的普通敌弹', apply(f) { f.clearBullets = true; } },
        evolutions: [{ id: 'ascendant', name: '终极 · 相位刃冠', icon: '♛', color: '#f2e8ff', desc: '保留弧斩与环刃，新增全向刃冠脉冲' }],
      },
      hunter: {
        id: 'hunter', name: '猎杀相位', icon: '➤', color: '#ff73d1',
        desc: '周期锁定远处敌机，发射可贯穿的高速相位波',
        fire: { mode: 'phase_wave', damage: 24, interval: 1.05, bulletSpeed: 760, bulletR: 9, pierce: 3, range: 720 },
        nodes: [
          { id: 'wh1', name: '长程标定', desc: '锁敌距离 +180', apply(f) { if (Number.isFinite(f.range)) f.range += 180; } },
          { id: 'wh2', name: '多层切面', desc: '贯穿 +2', apply(f) { if (Number.isFinite(f.pierce)) f.pierce += 2; } },
          { id: 'wh3', name: '追猎校准', desc: '相位波轻微追踪并提高伤害', apply(f) { f.homing = true; if (Number.isFinite(f.damage)) f.damage *= 1.25; } },
        ],
        capstone: { id: 'wh0', name: '双重处决', desc: '每次锁敌连续发射两道交错相位波', apply(f) { f.projectiles = 2; } },
        evolutions: [{ id: 'ascendant', name: '终极 · 相位刃冠', icon: '♛', color: '#f2e8ff', desc: '保留弧斩与猎杀波，新增全向刃冠脉冲' }],
      },
      ascendant: {
        id: 'ascendant', name: '相位刃冠', icon: '♛', color: '#f2e8ff',
        desc: '周期展开全向刃冠，向周围目标释放多枚追踪刃光',
        fire: { mode: 'blade_crown', damage: 18, interval: 1.7, bulletSpeed: 620, bulletR: 7, projectiles: 6, pierce: 2, range: 680 },
        nodes: [
          { id: 'wa1', name: '冠刃扩容', desc: '刃光数量 +2', apply(f) { if (Number.isFinite(f.projectiles)) f.projectiles += 2; } },
          { id: 'wa2', name: '白热锋面', desc: '刃光伤害 +35%', apply(f) { if (Number.isFinite(f.damage)) f.damage *= 1.35; } },
          { id: 'wa3', name: '相位折返', desc: '刃光获得追踪并贯穿 +1', apply(f) { f.homing = true; if (Number.isFinite(f.pierce)) f.pierce += 1; } },
          { id: 'wa4', name: '高速展开', desc: '攻击间隔 -22%', apply(f) { if (Number.isFinite(f.interval)) f.interval *= 0.78; } },
          { id: 'wa5', name: '宽刃投影', desc: '刃光体积 +30%', apply(f) { if (Number.isFinite(f.bulletR)) f.bulletR *= 1.3; } },
          { id: 'wa6', name: '终末贯穿', desc: '贯穿 +3', apply(f) { if (Number.isFinite(f.pierce)) f.pierce += 3; } },
        ],
        evolutions: [],
      },
    },
  },
};

// ===== 正式内容边界 =====
// 只有这里列出的武器可以出现在正式开局菜单中。原型定义可以继续留在
// WEAPON_DEFS 供开发验证，但不得因为“有一条数值配置”就被视为可交付内容。
const PLAYABLE_WEAPON_IDS = Object.freeze(['cannon', 'nova', 'sword']);
const EXPERIMENTAL_WEAPON_IDS = Object.freeze(
  Object.keys(WEAPON_DEFS).filter(id => !PLAYABLE_WEAPON_IDS.includes(id)),
);

// ===== 周期性规律编队（八方：以玩家为中心，从任意方向边缘包抄）=====
// build() 返回编队单元：{type, angle(八方向角), perp(垂直偏移), delay(入场延迟)}
function pick8Angle() { return Math.floor(rand(0, 8)) / 8 * TAU + rand(-0.12, 0.12); }

const FORMATIONS = {
  vee: {
    id: 'vee', role: '正面楔形压迫', category: 'lane', weight: 1.2,
    unlockAt: 0,
    build() {
      const a = pick8Angle(), units = [];
      for (let i = 0; i < 7; i++) {
        const off = i - 3;
        units.push({ type: 'mite', angle: a, perp: off * 40, delay: Math.abs(off) * 0.12 });
      }
      return units;
    },
  },
  spiral: {
    id: 'spiral', role: '环向持续入场', category: 'flow', weight: 1,
    unlockAt: 0,
    build() {
      const a0 = rand(0, TAU), units = [];
      for (let i = 0; i < 16; i++) units.push({ type: 'mite', angle: a0 + i * 0.42, perp: 0, delay: i * 0.11 });
      return units;
    },
  },
  ring: {
    id: 'ring', role: '八向同步突进', category: 'surround', weight: 0.9,
    unlockAt: 30,
    build() {
      const units = [];
      for (let i = 0; i < 8; i++) units.push({ type: 'dasher', angle: i / 8 * TAU, perp: 0, delay: i * 0.09 });
      return units;
    },
  },
  pincer: {
    id: 'pincer', role: '双侧夹击', category: 'surround', weight: 1.1,
    unlockAt: 30,
    build() {
      const a = pick8Angle(), units = [];
      for (let i = 0; i < 4; i++) {
        units.push({ type: 'mite', angle: a, perp: (i - 1.5) * 38, delay: i * 0.08 });
        units.push({ type: 'mite', angle: a + Math.PI, perp: (i - 1.5) * 38, delay: i * 0.08 });
      }
      return units;
    },
  },
  cross: {
    id: 'cross', role: '四向混合封锁', category: 'mixed', weight: 0.8,
    unlockAt: 60,
    build() {
      const units = [];
      for (let d = 0; d < 4; d++) {
        const a = d * Math.PI / 2 + Math.PI / 4 + rand(-0.1, 0.1);
        for (let i = 0; i < 3; i++) units.push({ type: 'mite', angle: a, perp: (i - 1) * 34, delay: i * 0.1 });
        units.push({ type: 'bomber', angle: a, perp: 0, delay: 0.2 });
      }
      return units;
    },
  },
  wall: {
    id: 'wall', role: '单侧弹幕横墙', category: 'lane', weight: 0.9,
    unlockAt: 55,
    build() {
      const side = Math.random() < 0.5 ? 0 : Math.PI, units = [];
      for (let i = 0; i < 5; i++) units.push({ type: 'gunner', angle: side, perp: (i - 2) * 72, delay: i * 0.1 });
      return units;
    },
  },
  train: {
    id: 'train', role: '单线交替火力', category: 'flow', weight: 0.9,
    unlockAt: 80,
    build() {
      const a = pick8Angle(), units = [];
      const mix = ['gunner', 'burst', 'gunner', 'burst', 'gunner', 'burst'];
      for (let i = 0; i < 6; i++) units.push({ type: mix[i], angle: a, perp: 0, delay: i * 0.16 });
      return units;
    },
  },
  vortex: {
    id: 'vortex', role: '双臂旋涡包围', category: 'surround', weight: 0.7,
    unlockAt: 100,
    build() {
      const a0 = rand(0, TAU), units = [];
      for (let i = 0; i < 22; i++) {
        const arm = i % 2;
        units.push({ type: 'mite', angle: a0 + i * 0.4 + arm * Math.PI, perp: 0, delay: i * 0.07 });
      }
      return units;
    },
  },
  ambush: {
    id: 'ambush', role: '突进与远程交叉', category: 'mixed', weight: 0.8,
    unlockAt: 120,
    build() {
      const a = pick8Angle(), units = [];
      for (let i = 0; i < 3; i++) units.push({ type: 'dasher', angle: a, perp: (i - 1) * 42, delay: i * 0.12 });
      for (let i = 0; i < 2; i++) units.push({ type: 'sniper', angle: a + Math.PI, perp: (i - 0.5) * 60, delay: 0.3 + i * 0.2 });
      return units;
    },
  },
  convoy: {
    id: 'convoy', role: '重装护航队', category: 'mixed', weight: 0.65,
    unlockAt: 150,
    build() {
      const a = pick8Angle(), units = [];
      units.push({ type: 'bastion', angle: a, perp: 0, delay: 0 });
      for (let i = 0; i < 2; i++) units.push({ type: 'gunner', angle: a, perp: (i ? 90 : -90), delay: 0.25 });
      for (let i = 0; i < 2; i++) units.push({ type: 'burst', angle: a + Math.PI, perp: (i ? 70 : -70), delay: 0.4 });
      return units;
    },
  },
};
const FORMATION_INTERVAL = BALANCE.pacing.formationInterval;
const FIRST_FORMATION_AT = BALANCE.pacing.firstFormationAt;
const SPAWN_TELEGRAPH = BALANCE.pacing.spawnTelegraph;
const WAVE_LEN = BALANCE.pacing.waveLen;
const SPAWN_WINDOW = BALANCE.pacing.spawnWindow;
const ENEMY_SOFT_CAP = BALANCE.pacing.enemySoftCap;
const ENEMY_HARD_CAP = BALANCE.pacing.enemyHardCap;

// ===== 自然刷怪唯一配置源 =====
// weight 是同一时刻候选池中的相对权重；maxAlive 防止高压单位在场上堆叠。
// rock_s 仅由陨石死亡生成，dragon 仅由首领时间表生成，因此不在自然刷怪表中。
const ENEMY_SPAWN_ROSTER_BASE = [
  { type: 'rock',    unlockAt: 0,   weight: 4, maxAlive: 18, role: '环境压力' },
  { type: 'mite',    unlockAt: 0,   weight: 6, maxAlive: 36, role: '近战杂兵' },
  { type: 'dasher',  unlockAt: 30,  weight: 2, maxAlive: 5,  role: '突进威胁' },
  { type: 'gunner',  unlockAt: 45,  weight: 2, maxAlive: 8,  role: '单发弹幕' },
  { type: 'burst',   unlockAt: 80,  weight: 2, maxAlive: 7,  role: '串射弹幕' },
  { type: 'scatter', unlockAt: 115, weight: 1, maxAlive: 5,  role: '扇形封位' },
  { type: 'bastion', unlockAt: 145, weight: 1, maxAlive: 3,  role: '重装压场' },
  { type: 'bomber',  unlockAt: 60,  weight: 2, maxAlive: 6,  role: '自爆冲锋' },
  { type: 'sniper',  unlockAt: 95,  weight: 2, maxAlive: 4,  role: '远程狙击' },
  { type: 'miner',   unlockAt: 130, weight: 1, maxAlive: 3,  role: '布雷封路' },
  { type: 'hive',    unlockAt: 165, weight: 1, maxAlive: 2,  role: '孵化母体' },
];
const ENEMY_SPAWN_ROSTER = ENEMY_SPAWN_ROSTER_BASE.map(rule => ({
  ...rule,
  unlockAt: rule.unlockAt * BALANCE.pacing.unlockScale,
}));

const BOSS_SCHEDULE = [
  { type: 'dragon', at: BALANCE.pacing.bossAt, final: true, intro: 1.4, announce: '⚠ 星蚀龙正在进入战场' },
];

// ===== 大批量生成方案（每波开始时随机执行一个，数量随玩家输出预算缩放）=====
const MASS_SPAWNS = [
  { id: 'miteFlood',   unlockAt: 0,   type: 'mite',   count: 20, pattern: 'arc',    role: '蝗潮宽弧' },
  { id: 'rockBelt',    unlockAt: 0,   type: 'rock',   count: 10, pattern: 'belt',   role: '陨石斜带' },
  { id: 'miteStorm',   unlockAt: 15,  type: 'mite',   count: 26, pattern: 'spiral', role: '蜂群双螺旋' },
  { id: 'bomberPack',  unlockAt: 60,  type: 'bomber', count: 7,  pattern: 'vee',    role: '爆虫楔形' },
  { id: 'gunnerWall',  unlockAt: 80,  type: 'gunner', count: 8,  pattern: 'wall',   role: '弹幕横墙' },
  { id: 'mixedWedge',  unlockAt: 110, type: 'mixed',  count: 12, pattern: 'wedge',  role: '混编突击' },
];

function enemySpawnRule(type) {
  return ENEMY_SPAWN_ROSTER.find(r => r.type === type) || null;
}

function isEnemyUnlocked(type, time) {
  const rule = enemySpawnRule(type);
  return !!rule && time >= rule.unlockAt;
}

// ===== 流派（开局 BP：禁用 1 个，选定 1 个；影响初始属性与升级卡权重）=====
const ARCHETYPES = [
  {
    id: 'barrage', name: '弹幕密度流', icon: '🌀', color: '#4fd2ff',
    desc: '攻速 +15%，武器升级卡出现率翻倍',
    apply(p) { p.atkSpdMul += 0.15; }, weights: { up: 2 },
  },
  {
    id: 'heavy', name: '重炮轰击流', icon: '💣', color: '#ff9d5d',
    desc: '全局伤害 +22%，攻速 -8%',
    apply(p) { p.dmgMul += 0.22; p.atkSpdMul -= 0.08; }, weights: {},
  },
  {
    id: 'swift', name: '机动游走流', icon: '💨', color: '#5dffd2',
    desc: '移速 +18%，拾取范围 +40%，属性卡更多',
    apply(p) { p.moveMul += 0.18; p.pickupRange *= 1.4; }, weights: { stat: 2 },
  },
  {
    id: 'fortress', name: '钢铁堡垒流', icon: '🧱', color: '#ffd25d',
    desc: '生命上限 +30，护甲 +2，移速 -10%',
    apply(p) { p.maxHp += 30; p.hp += 30; p.armor += 2; p.moveMul -= 0.10; }, weights: {},
  },
];

// 从玩家位置沿 angle 投射到屏幕外圈（边缘出怪点）
function edgeSpawnPos(px, py, angle, margin = 40) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (CANVAS_W + margin - px) / dx);
  if (dx < -1e-6) t = Math.min(t, (-margin - px) / dx);
  if (dy > 1e-6) t = Math.min(t, (CANVAS_H + margin - py) / dy);
  if (dy < -1e-6) t = Math.min(t, (-margin - py) / dy);
  return { x: px + dx * t, y: py + dy * t };
}
