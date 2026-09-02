# 星火战机 Starfall

一款运行在浏览器中的霓虹风 2D Roguelite 射击游戏原型。项目使用原生 JavaScript 与 Canvas 2D 实现，重点探索分支武器进化、组合攻击、阵型出怪和多阶段 Boss 战。

![Starfall gameplay preview](dev/v23-orbit-path.png)

## 当前能力

- 鼠标、触屏与 WASD 移动，自动攻击与主动清弹幕技能。
- 蜂窝式技能树和可叠加的攻击进化，而非简单替换旧攻击。
- 标准化攻击描述，覆盖弹体、范围、环绕、主动瞄准与持续伤害等行为。
- 普通敌人、阵型、生成上限和预警机制。
- 折跃棱堡的两阶段几何弹幕，以及星蚀龙的盘旋突击、身体弹幕和三阶段吐息。
- 明确的一局状态机、最终 Boss 胜利结算和本地自动试玩验收。
- `actual` 与 `test` 两套数值配置，方便正常游玩和快速调试。
- 无构建步骤、无后端依赖，可由任意静态文件服务器运行。

> 当前状态：具备中期与最终 Boss 的可通关开发版原型。音效、引导与正式 6–8 分钟节奏仍在开发中。

## 本地运行

直接打开 `index.html` 可以运行大部分功能。推荐通过本地静态服务器启动，以避免浏览器对资源加载的限制：

```bash
python -m http.server 8765
```

然后访问：

```text
http://127.0.0.1:8765/
```

常用调试地址：

```text
http://127.0.0.1:8765/?balance=test
http://127.0.0.1:8765/?balance=test&debug=boss
http://127.0.0.1:8765/?balance=test&debug=midboss
http://127.0.0.1:8765/?balance=test&debugForm=plague
http://127.0.0.1:8765/?balance=test&debug=boss&autoplay=1&weapon=sword
http://127.0.0.1:8765/?telemetry=1&session=three-run-balance&runs=3
http://127.0.0.1:8765/dev/run-monitor.html
```

## 测试

项目测试使用 Node.js 内置能力，不需要安装 npm 依赖：

```bash
node tests/balance-smoke.mjs
node tests/balance-profiles-smoke.mjs
node tests/projectile-art-smoke.mjs
node tests/archetype-art-smoke.mjs
node tests/dragon-motion-smoke.mjs
node tests/prism-boss-smoke.mjs
node tests/attack-framework-smoke.mjs
node tests/systems-v23-smoke.mjs
node tests/playable-weapons-smoke.mjs
node tests/sword-progression-smoke.mjs
node tests/run-state-smoke.mjs
node tests/game-systems-smoke.mjs
node tests/telemetry-smoke.mjs
node tests/boss-pacing-smoke.mjs
node tests/spore-cloud-smoke.mjs
node tests/playtest-feedback-smoke.mjs
node tests/plague-cashout-smoke.mjs
```

## 项目结构

```text
assets/       游戏位图与龙精灵图资源
dev/          美术预览、调试页面与验证截图
js/           游戏循环、实体、攻击、出怪、成长、碰撞、遭遇、UI 和特效
tests/        数值、攻击、Boss 与美术契约测试
index.html    游戏入口
style.css     页面与 UI 样式
```

设计和数值说明见：

- [DESIGN.md](DESIGN.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [BALANCE.md](BALANCE.md)
- [BULLETS.md](BULLETS.md)
- [MONSTERS.md](MONSTERS.md)
- [PLAYTEST.md](PLAYTEST.md)

## 后续计划

1. 用正式数值实测并调整 6–8 分钟通关节奏。
2. 把本地自动试玩升级为持续集成可执行的浏览器测试。
3. 补齐音效、设置、引导和浏览器端完整流程测试。
