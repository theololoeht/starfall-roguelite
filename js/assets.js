// ===== 位图资源管线 =====
// 运行时只从 sprite-gen manifest 读取帧矩形；unpack-source 只提供语义标签到帧序号的映射。
const GameAssets = {
  dragon: {
    image: null,
    manifest: null,
    labels: new Map(),
    ready: false,
    error: null,
  },

  async loadDragon() {
    const asset = this.dragon;
    const version = '20';
    try {
      const [manifest, source] = await Promise.all([
        fetch(`assets/dragon/manifest.json?v=${version}`).then(r => {
          if (!r.ok) throw new Error(`dragon manifest HTTP ${r.status}`);
          return r.json();
        }),
        fetch(`assets/dragon/unpack-source.json?v=${version}`).then(r => {
          if (!r.ok) throw new Error(`dragon labels HTTP ${r.status}`);
          return r.json();
        }),
      ]);
      if (manifest.game_input !== 'sprite-sheet-alpha.png' || manifest.degraded_static_fallback) {
        throw new Error('dragon manifest runtime contract mismatch');
      }
      const rects = manifest.frame_layout?.rows?.modules;
      if (!Array.isArray(rects) || rects.length !== source.labels.length) {
        throw new Error('dragon manifest labels/frame count mismatch');
      }
      const image = new Image();
      image.decoding = 'async';
      image.src = `assets/dragon/${manifest.game_input}?v=${version}`;
      await image.decode();
      asset.image = image;
      asset.manifest = manifest;
      source.labels.forEach((label, index) => asset.labels.set(label, index));
      asset.ready = true;
    } catch (error) {
      asset.error = error;
      console.warn('[Starfall] 龙位图加载失败，使用 Canvas 降级绘制：', error);
    }
  },

  drawDragonPart(ctx, label, x, y, angle, size, flipY = false) {
    const asset = this.dragon;
    if (!asset.ready) return false;
    const index = asset.labels.get(label);
    const rect = asset.manifest.frame_layout.rows.modules[index];
    if (!rect) return false;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle); ctx.scale(1, flipY ? -1 : 1);
    ctx.drawImage(asset.image, rect.x, rect.y, rect.w, rect.h, -size / 2, -size / 2, size, size);
    ctx.restore();
    return true;
  },
};

GameAssets.loadDragon();
