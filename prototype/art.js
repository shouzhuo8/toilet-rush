/* 课间特急 — 程序化像素美术资产库 v1.0
 * 全部图形由代码逐像素绘制，无外部图片依赖。坐标系 = 游戏世界坐标。
 * API: window.ART（在 game.js 之前加载）
 */
(function () {
  'use strict';

  const I = (x) => Math.round(x);
  const C = {
    ink: '#1F1A17', paper: '#FFF7ED', shadow: '#00000033',
    skin: '#F5C9A6', skinShade: '#D9A17C', hair: '#3B2A20',
    white: '#FFF7ED', grey: '#94A3B8', dark: '#475569',
    wood: '#8A5A3B', woodDark: '#5F3A24', woodLight: '#B07A4F',
    mint: '#BFE3DD', mintDark: '#8FC9C1', mintLine: '#6FAEA4',
    red: '#EF4444', green: '#22C55E', amber: '#F59E0B',
    blue: '#38BDF8', gold: '#FDE047', pink: '#F472B6', purple: '#C084FC',
    poo: '#8D5A3A', pooHi: '#B07A4F', pooDk: '#5F3A24',
    berry: '#F472B6', berryHi: '#FBCFE8', berryDk: '#BE185D',
  };

  function px(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(I(x), I(y), Math.max(1, I(w)), Math.max(1, I(h))); }
  function outline(ctx, x, y, w, h, col, lw) { ctx.strokeStyle = col || C.ink; ctx.lineWidth = lw || 2; ctx.strokeRect(I(x) + .5, I(y) + .5, I(w) - 1, I(h) - 1); }
  function circle(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(I(x), I(y), r, 0, 6.2832); ctx.fill(); }

  /* ---------- 文字：像素描边字（HUD 之外的世界内标签） ---------- */
  function label(ctx, text, x, y, opt) {
    opt = opt || {};
    const size = opt.size || 12, bold = opt.bold === false ? '' : '900 ';
    ctx.save();
    ctx.font = `${bold}${size}px system-ui, "PingFang SC", sans-serif`;
    ctx.textAlign = opt.align || 'center'; ctx.textBaseline = opt.baseline || 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = opt.lw || 4;
    ctx.strokeStyle = opt.ink || C.ink; ctx.strokeText(text, x, y);
    ctx.fillStyle = opt.color || C.paper; ctx.fillText(text, x, y);
    ctx.restore();
  }

  /* ---------- 地面 / 墙 / 装饰 ---------- */
  function floor(ctx, r, colors, t) {
    const base = colors.base, alt = colors.alt, line = colors.line;
    px(ctx, r.x, r.y, r.w, r.h, base);
    // 32×32 棋盘砖 + 噪点
    for (let yy = r.y; yy < r.y + r.h; yy += 32) {
      for (let xx = r.x; xx < r.x + r.w; xx += 32) {
        if (((xx - r.x) / 32 + (yy - r.y) / 32) % 2 === 0) px(ctx, xx, yy, 32, 32, alt);
        px(ctx, xx, yy, 32, 1, line); px(ctx, xx, yy, 1, 32, line);
        if ((I(xx / 32) * 7 + I(yy / 32) * 13) % 5 === 0) px(ctx, xx + 12, yy + 18, 2, 2, line);
      }
    }
    // 墙裙 + 顶部阴影
    px(ctx, r.x, r.y, r.w, 10, colors.wall);
    px(ctx, r.x, r.y + 10, r.w, 3, colors.wallEdge);
    px(ctx, r.x, r.y + r.h - 12, r.w, 12, colors.wall);
    px(ctx, r.x, r.y + r.h - 14, r.w, 2, colors.wallEdge);
    outline(ctx, r.x, r.y, r.w, r.h, colors.wallEdge, 3);
  }

  function desks(ctx, x, y, n) { // 教室课桌（备战期布景）
    for (let i = 0; i < n; i++) {
      const dx = x + i * 150;
      px(ctx, dx, y + 18, 10, 26, C.woodDark); px(ctx, dx + 86, y + 18, 10, 26, C.woodDark);
      px(ctx, dx - 6, y, 108, 20, C.woodLight); outline(ctx, dx - 6, y, 108, 20, C.woodDark, 2);
      px(ctx, dx + 12, y + 4, 30, 3, C.wood); px(ctx, dx + 52, y + 10, 20, 2, C.wood);
      px(ctx, dx + 34, y + 44, 34, 8, '#6B8F86'); // 凳子
    }
  }
  function lockers(ctx, x, y, n) { // 走廊储物柜
    for (let i = 0; i < n; i++) {
      const dx = x + i * 56;
      px(ctx, dx, y, 50, 74, '#7C9070'); outline(ctx, dx, y, 50, 74, C.woodDark, 2);
      px(ctx, dx + 4, y + 4, 42, 2, '#A3B18A'); px(ctx, dx + 38, y + 34, 6, 3, C.gold);
      px(ctx, dx + 8, y + 14, 3, 12, C.woodDark); px(ctx, dx + 14, y + 14, 3, 12, C.woodDark);
    }
  }
  function tilesWall(ctx, x, y, w, h) { // 厕所瓷砖墙
    for (let yy = y; yy < y + h; yy += 24) for (let xx = x; xx < x + w; xx += 24) {
      px(ctx, xx, yy, 23, 23, (I(xx / 24) + I(yy / 24)) % 2 ? C.mint : '#CDEBE6');
      px(ctx, xx, yy, 23, 1, C.mintLine); px(ctx, xx, yy, 1, 23, C.mintLine);
    }
  }

  /* ---------- 角色：6 套专属造型 × 8 种动作 ---------- */
  const HERO = [
    { uniform: '#3AA0FF', trim: '#1D4ED8', hair: '#2B2118', acc: 'ahoge' },   // 你：呆毛
    { uniform: '#FF6B6B', trim: '#B91C1C', hair: '#1F1A17', acc: 'glasses' }, // 王小明：圆眼镜
    { uniform: '#FFD93D', trim: '#B45309', hair: '#1A1410', acc: 'brow' },    // 李铁蛋：粗眉
    { uniform: '#6BCB77', trim: '#15803D', hair: '#4A2E1B', acc: 'twintail' },// 张翠花：双马尾
    { uniform: '#C084FC', trim: '#7E22CE', hair: '#2A1D14', acc: 'bun' },     // 赵大宝：叼饼
  ];

  function character(ctx, p, t, opt) {
    opt = opt || {};
    const H = HERO[p.id % 5] || HERO[0];
    const scl = p.id === 4 ? 1.18 : 1;
    const moving = !!p.moving;
    const clench = p.endurance < 30;
    const dir = p.dir || 1;
    const charging = p.charging;
    const pushPhase = charging && charging.push;
    ctx.save();
    ctx.scale(dir * scl, scl);

    let bob = 0, lean = 0, legSwing = 0, armSwing = 0, squash = 1;
    if (!moving) {
      const f = Math.floor(t * 5) % 6;              // idle 憋扭：第3帧膝盖内扣、第6帧脸闪橙
      bob = f === 2 ? 1 : 0;
      legSwing = f === 2 || f === 3 ? 2 : 0;
      if (f === 5) { ctx.globalAlpha = .5; px(ctx, -9, 12, 18, 2, '#FB923C'); ctx.globalAlpha = 1; }
    } else if (clench) {
      const f = Math.floor(t * 4) % 4; legSwing = f === 1 ? 1 : 0; squash = 1.05; // 夹腿挪动
    } else {
      const f = Math.floor(t * (p.speedRun ? 13 : 9)) % 6;               // 走/跑 6 帧
      legSwing = [0, 3, 5, 0, -3, -5][f];
      armSwing = [0, -2, -3, 0, 2, 3][f];
      bob = [0, -1, -2, 0, -1, -2][f];
      lean = p.speedRun ? 4 : 2;
      if (p.speedRun) { ctx.globalAlpha = .3; px(ctx, -24, -4, 9, 2, C.paper); px(ctx, -28, 2, 11, 2, C.paper); ctx.globalAlpha = 1; }
    }
    if (charging && charging.type === 'punch') { squash = .92; lean = 6; }
    const y = bob;

    ctx.fillStyle = C.shadow; ctx.beginPath(); ctx.ellipse(0, 16, 12, 4, 0, 0, 6.2832); ctx.fill();
    ctx.save(); ctx.transform(1, 0, -lean / 60, squash, 0, 0);

    // 腿
    if (clench) { px(ctx, -5, y + 8, 4, 9, '#334155'); px(ctx, 1, y + 8, 4, 9, '#334155'); }
    else { px(ctx, -6 + legSwing * .8, y + 8, 5, 9, '#334155'); px(ctx, 1 - legSwing * .8, y + 8, 5, 9, '#334155'); }
    px(ctx, -7 + legSwing * .8, y + 15, 7, 4, C.ink); px(ctx, 1 - legSwing * .8, y + 15, 7, 4, C.ink);
    // 身体
    px(ctx, -9, y - 9, 18, 18, H.uniform); outline(ctx, -9, y - 9, 18, 18, C.ink, 2);
    px(ctx, -9, y - 3, 18, 3, H.trim); px(ctx, -2, y - 9, 3, 18, C.paper); px(ctx, -1, y - 8, 1, 16, H.trim);
    // 手臂
    if (charging && charging.type === 'punch') {
      const ext = pushPhase ? 20 : 14;
      px(ctx, 8, y - 6, ext, 6, C.skin); px(ctx, 8 + ext, y - 8, 10, 11, C.paper); outline(ctx, 8 + ext, y - 8, 10, 11, C.ink, 2);
      ctx.globalAlpha = .5; px(ctx, 8 + ext + 12, y - 12, 12, 2, C.paper); px(ctx, 8 + ext + 12, y - 4, 9, 2, C.paper); ctx.globalAlpha = 1;
    } else {
      px(ctx, -12, y - 7 - armSwing, 4, 12, H.uniform); px(ctx, 8, y - 7 + armSwing, 4, 12, H.uniform);
      px(ctx, -12, y + 4 - armSwing, 4, 4, C.skin); px(ctx, 8, y + 4 + armSwing, 4, 4, C.skin);
    }
    // 头
    px(ctx, -8, y - 24, 16, 15, C.skin); outline(ctx, -8, y - 24, 16, 15, C.ink, 2);
    px(ctx, -8, y - 26, 16, 5, H.hair); px(ctx, -9, y - 23, 2, 9, H.hair); px(ctx, 7, y - 23, 2, 9, H.hair);
    // 眼
    if (clench) { px(ctx, -6, y - 19, 4, 2, C.ink); px(ctx, 2, y - 19, 4, 2, C.ink); px(ctx, -5, y - 16, 2, 2, C.red); px(ctx, 3, y - 16, 2, 2, C.red); }
    else if (charging && charging.type === 'punch') { px(ctx, -6, y - 19, 3, 3, C.ink); px(ctx, 2, y - 19, 3, 3, C.ink); }
    else { px(ctx, -5, y - 18, 2, 3, C.ink); px(ctx, 3, y - 18, 2, 3, C.ink); }
    if (charging && charging.type === 'punch') px(ctx, -2, y - 13, 5, 2, C.ink); else px(ctx, -1, y - 13, 3, 1, C.skinShade);
    // 配件
    if (H.acc === 'ahoge') { px(ctx, 0, y - 31, 2, 6, H.hair); px(ctx, 2 + Math.sin(t * 9), y - 32, 4, 2, H.hair); }
    if (H.acc === 'glasses') { ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-3.5, y - 17, 3.5, 0, 6.283); ctx.arc(4.5, y - 17, 3.5, 0, 6.283); ctx.stroke(); px(ctx, -1, y - 17, 2, 1, C.ink); }
    if (H.acc === 'brow') px(ctx, -7, y - 22, 14, 3, H.hair);
    if (H.acc === 'twintail') {
      const sw = Math.sin(t * 9) * 2 + (moving ? 2 : 0);
      px(ctx, -13, y - 26 + sw, 5, 14, H.hair); px(ctx, 9, y - 26 - sw, 5, 14, H.hair);
      px(ctx, -13, y - 28 + sw, 5, 3, '#EF4444'); px(ctx, 9, y - 28 - sw, 5, 3, '#EF4444');
    }
    if (H.acc === 'bun') { px(ctx, 6, y - 13, 7, 4, '#F5DEB3'); outline(ctx, 6, y - 13, 7, 4, C.woodDark, 1); }
    if (p.naked) {
      px(ctx, -9, y + 2, 18, 11, '#FBCFE8'); outline(ctx, -9, y + 2, 18, 11, C.pink, 2);
      ctx.globalAlpha = .55; circle(ctx, -12, y - 4, 5, C.paper); circle(ctx, 12, y - 8, 6, C.paper); ctx.globalAlpha = 1;
    }
    // 夹腿蒸汽 / 霸体环
    if (clench && moving) { ctx.globalAlpha = .7; circle(ctx, -10, y - 30 + Math.sin(t * 7) * 2, 2.2, C.paper); circle(ctx, 10, y - 34 + Math.cos(t * 6) * 2, 1.8, C.paper); ctx.globalAlpha = 1; }
    if (p.armorNow || p.rageNow) {
      ctx.strokeStyle = p.rageNow ? '#F97316' : '#38BDF8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, y - 6, 20, 0, 6.283); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  /* ---------- 隔间门：木纹/指示灯/故障/贴纸/纸卷/门缝腿 ---------- */
  function door(ctx, st, shown, t, opt) {
    opt = opt || {};
    const { x, y, w, h } = st;
    px(ctx, x, y, w, h, C.mintDark); outline(ctx, x, y, w, h, C.mintLine, 3);
    // 门板
    px(ctx, x + 5, y + 5, w - 10, h - 10, C.wood); outline(ctx, x + 5, y + 5, w - 10, h - 10, C.woodDark, 2);
    for (let i = 0; i < 5; i++) { px(ctx, x + 12 + i * 18, y + 8, 2, h - 16, C.woodDark); px(ctx, x + 16 + i * 18, y + 8, 1, h - 16, C.woodLight); }
    // 门把手
    px(ctx, x + w - 20, y + h / 2 - 2, 10, 4, C.gold); outline(ctx, x + w - 20, y + h / 2 - 2, 10, 4, C.woodDark, 1);
    // 门缝（下沿 10px）
    px(ctx, x + 6, y + h - 12, w - 12, 9, C.ink);
    if (shown || st.occ) { // 门缝腿（只露腿，身份零泄露）
      const kick = Math.sin(t * 6) * 2;
      px(ctx, x + 26 + kick, y + h - 9, 9, 6, '#334155'); px(ctx, x + w - 38 - kick, y + h - 9, 9, 6, '#334155');
      px(ctx, x + 25 + kick, y + h - 4, 11, 3, C.ink); px(ctx, x + w - 39 - kick, y + h - 4, 11, 3, C.ink);
    }
    // 占用指示灯 + 图标
    const lx = x + w / 2, ly = y - 14;
    ctx.save(); ctx.shadowColor = shown ? C.red : C.green; ctx.shadowBlur = 10;
    circle(ctx, lx, ly, 9, shown ? C.red : C.green); ctx.restore();
    outline(ctx, lx - 9, ly - 9, 18, 18, C.ink, 2);
    label(ctx, shown ? '有' : '空', lx, ly + 4, { size: 10, lw: 0, color: C.paper });
    // 故障图标
    if (st.obstacle) {
      px(ctx, x + 8, y + 8, 20, 18, C.amber); outline(ctx, x + 8, y + 8, 20, 18, C.ink, 2);
      label(ctx, '!', x + 18, y + 22, { size: 14, lw: 0 });
      obstacle(ctx, st.obstacle, x + w / 2, y + h / 2 + 6, t, .55);
    }
    // 卷纸（纸明牌）
    if (st.hasPaper) {
      px(ctx, x + w - 24, y + 10, 14, 16, C.paper); outline(ctx, x + w - 24, y + 10, 14, 16, C.grey, 1);
      px(ctx, x + w - 22, y + 12, 10, 2, C.grey); px(ctx, x + w - 22, y + 20, 10, 2, C.grey);
      px(ctx, x + w - 22, y + 26, 12, 5, C.paper);
    }
    // 假贴翘边
    if (t < st.fakeUntil) {
      ctx.save(); ctx.translate(x + 10, y + 30); ctx.rotate(-.08 + Math.sin(t * 4) * .02);
      px(ctx, 0, 0, 44, 16, C.purple); outline(ctx, 0, 0, 44, 16, C.ink, 1);
      label(ctx, '贴纸', 22, 12, { size: 9, lw: 0 }); ctx.restore();
    }
    // 骚扰值（橙色拳头 pips）
    for (let i = 0; i < Math.min(st.harass, 3); i++) circle(ctx, x + 12 + i * 12, y - 12, 4, C.amber);
    // 优先锁
    if (st.lockBy >= 0 && t < st.lockUntil) { label(ctx, '🔒', lx + 18, ly + 4, { size: 12, lw: 0 }); }
    // 主任剪影（报纸）
    if (st.occ === 'dean') { px(ctx, x + 26, y + 22, 30, 34, C.paper); outline(ctx, x + 26, y + 22, 30, 34, C.ink, 2); px(ctx, x + 30, y + 26, 22, 2, C.grey); px(ctx, x + 30, y + 32, 22, 2, C.grey); }
  }

  /* ---------- 障碍物：带表情的黄金巨蟒 / 草莓塔 ---------- */
  function obstacle(ctx, kind, cx, cy, t, scale) {
    scale = scale || 1; ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
    const wig = Math.sin(t * 3) * 2;
    if (kind === 'anaconda') {
      for (let i = 0; i < 4; i++) {
        const yy = 12 - i * 10, ww = 46 - i * 8;
        px(ctx, -ww / 2 + wig * (i / 4), yy, ww, 11, i % 2 ? C.poo : C.pooHi);
        outline(ctx, -ww / 2 + wig * (i / 4), yy, ww, 11, C.pooDk, 1.5);
      }
      px(ctx, 14 + wig, -20, 20, 16, C.pooHi); outline(ctx, 14 + wig, -20, 20, 16, C.pooDk, 1.5);
      circle(ctx, 20 + wig, -14, 2, C.paper); circle(ctx, 29 + wig, -14, 2, C.paper);
      circle(ctx, 20 + wig, -14, 1, C.ink); circle(ctx, 29 + wig, -14, 1, C.ink);
      px(ctx, 22 + wig, -8, 6, 2, C.ink); // 微笑
      label(ctx, '~', -34, -18, { size: 14, lw: 0, color: C.pooDk });
    } else {
      for (let i = 0; i < 3; i++) {
        const yy = 14 - i * 13, ww = 40 - i * 9;
        px(ctx, -ww / 2 + wig * (i / 3), yy, ww, 14, i % 2 ? C.berry : C.berryHi);
        outline(ctx, -ww / 2 + wig * (i / 3), yy, ww, 14, C.berryDk, 1.5);
        for (let k = 0; k < 3; k++) px(ctx, -ww / 2 + 6 + k * 9, yy + 5, 3, 3, C.paper);
      }
      circle(ctx, -7 + wig, -17, 2, C.paper); circle(ctx, 3 + wig, -17, 2, C.paper);
      circle(ctx, -7 + wig, -17, 1, C.ink); circle(ctx, 3 + wig, -17, 1, C.ink);
      px(ctx, -4 + wig, -11, 6, 2, C.ink);
    }
    ctx.restore();
  }

  /* ---------- 道具：9 种可辨像素图标 ---------- */
  function item(ctx, kind, x, y, t) {
    const bob = Math.sin(t * 4 + x) * 2;
    ctx.save(); ctx.translate(x, y + bob); ctx.scale(1.45, 1.45); // 图标整体放大 1.45×（裁决#24）
    // 掉落光晕
    ctx.globalAlpha = .3; circle(ctx, 0, 0, 13, C.gold); ctx.globalAlpha = 1;
    circle(ctx, 0, 0, 10, C.paper); outline(ctx, -10, -10, 20, 20, C.ink, 2);
    switch (kind) {
      case 'mask': px(ctx, -7, -4, 14, 8, '#8ECAE6'); px(ctx, -9, -5, 3, 3, C.grey); px(ctx, 6, -5, 3, 3, C.grey); px(ctx, -8, 0, 2, 2, C.grey); px(ctx, 6, 0, 2, 2, C.grey); px(ctx, -2, -1, 4, 1, C.white); break;
      case 'broom': px(ctx, -1, -8, 3, 12, C.woodLight); px(ctx, -6, 4, 12, 6, '#BDB76B'); for (let i = 0; i < 4; i++) px(ctx, -6 + i * 3, 8, 2, 4, C.wood); break;
      case 'wire': ctx.strokeStyle = '#B0B0B8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 6); ctx.quadraticCurveTo(0, -9, 7, 3); ctx.stroke(); px(ctx, 5, 2, 4, 3, C.grey); break;
      case 'ladder': px(ctx, -6, -8, 3, 16, C.woodLight); px(ctx, 3, -8, 3, 16, C.woodLight); for (let i = 0; i < 4; i++) px(ctx, -6, -6 + i * 4, 12, 2, C.wood); break;
      case 'plunger': px(ctx, -1, -8, 3, 11, C.woodLight); px(ctx, -7, 3, 15, 6, '#8D5A3A'); outline(ctx, -7, 3, 15, 6, C.woodDark, 1); break;
      case 'paper': px(ctx, -6, -6, 12, 12, C.white); outline(ctx, -6, -6, 12, 12, C.grey, 1); px(ctx, -4, -2, 8, 1, C.grey); px(ctx, -4, 2, 8, 1, C.grey); px(ctx, 6, 3, 4, 4, C.white); break;
      case 'comic': px(ctx, -7, -7, 14, 14, '#FF9F68'); outline(ctx, -7, -7, 14, 14, C.ink, 1); label(ctx, '!', 0, 4, { size: 12, lw: 0, color: C.paper }); break;
      case 'soda': px(ctx, -5, -7, 10, 14, '#90E0A0'); outline(ctx, -5, -7, 10, 14, C.ink, 1); px(ctx, -5, -9, 10, 3, C.grey); px(ctx, -3, -3, 6, 3, C.paper); break;
      case 'poster': px(ctx, -7, -6, 14, 12, C.purple); outline(ctx, -7, -6, 14, 12, C.ink, 1); label(ctx, '?', 0, 4, { size: 11, lw: 0 }); break;
    }
    ctx.restore();
  }

  /* ---------- 洗手台（核心交互终点） ---------- */
  function sink(ctx, x, y, t) {
    px(ctx, x - 42, y - 16, 84, 30, '#E2F1F4'); outline(ctx, x - 42, y - 16, 84, 30, '#7BA3B5', 2);
    px(ctx, x - 34, y - 34, 68, 18, '#CDEBE6'); outline(ctx, x - 34, y - 34, 68, 18, '#7BA3B5', 2); // 镜子
    for (let i = 0; i < 3; i++) {
      px(ctx, x - 24 + i * 24, y - 4, 16, 10, '#BFE3DD'); outline(ctx, x - 24 + i * 24, y - 4, 16, 10, '#7BA3B5', 1);
      px(ctx, x - 18 + i * 24, y - 8, 4, 5, C.grey); // 龙头
      const drop = (t * 2 + i) % 2 < .3; if (drop) circle(ctx, x - 16 + i * 24, y + 2, 2, C.blue);
    }
    label(ctx, '洗手台 · WASH', x, y + 26, { size: 10, lw: 3 });
  }

  /* ---------- 连接口门牌 ---------- */
  function gate(ctx, c, active, t) {
    const { x, y, w, h } = c.trig;
    const pulse = active ? .35 + .2 * Math.sin(t * 3) : .12;
    ctx.save(); ctx.globalAlpha = pulse; px(ctx, x, y, w, h, active ? C.blue : C.grey); ctx.restore();
    outline(ctx, x, y, w, h, active ? C.blue : C.dark, 3);
    // 门框 + 箭头
    px(ctx, x + 4, y + 4, w - 8, h - 8, C.woodDark); px(ctx, x + 8, y + 8, w - 16, h - 16, active ? '#1E3A5F' : '#334155');
    const ax = x + w / 2 + Math.sin(t * 4) * 3;
    for (let i = 0; i < 3; i++) { px(ctx, ax - 10 + i * 8, y + h / 2 - 2, 6, 4, active ? C.blue : C.grey); }
    // 门牌
    px(ctx, x - 20, y - 26, w + 40, 20, C.wood); outline(ctx, x - 20, y - 26, w + 40, 20, C.woodDark, 2);
    label(ctx, c.label + (active ? '  →' : '  ···'), x + w / 2, y - 11, { size: 11 });
  }

  /* ---------- 占坑侠招牌 ---------- */
  function shameSign(ctx, x, y, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 5) * .06);
    px(ctx, -26, -12, 52, 18, C.wood); outline(ctx, -26, -12, 52, 18, C.woodDark, 2);
    label(ctx, '占坑侠', 0, 2, { size: 10, lw: 0, color: C.gold });
    ctx.restore();
  }

  /* ---------- 拟声字（3px 描边弹入） ---------- */
  function onomat(ctx, o) {
    const pr = Math.max(0, Math.min(1, o.t / .18));
    const sc = .6 + .4 * (1 - Math.pow(1 - pr, 3)) + Math.sin(o.t * 22) * .03 * (1 - pr);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, o.life * 1.4));
    ctx.translate(o.x, o.y - (1 - o.life) * 16); ctx.scale(sc, sc);
    ctx.font = '900 26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = 7; ctx.strokeStyle = C.ink; ctx.strokeText(o.txt, 0, 0);
    ctx.fillStyle = o.color || C.paper; ctx.fillText(o.txt, 0, 0);
    ctx.restore();
  }

  /* ---------- 提示气泡（世界内 tips） ---------- */
  function bubble(ctx, x, y, text, opt) {
    opt = opt || {};
    ctx.save(); ctx.font = `700 ${opt.size || 11}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 16;
    px(ctx, x - w / 2, y - 16, w, 20, opt.bg || '#26221AEE'); outline(ctx, x - w / 2, y - 16, w, 20, opt.border || C.gold, 2);
    label(ctx, text, x, y - 2, { size: opt.size || 11, lw: 0, color: opt.color || C.paper });
    ctx.restore();
  }

  window.ART = { C, px, outline, circle, label, floor, desks, lockers, tilesWall, character, door, obstacle, item, sink, gate, shameSign, onomat, bubble, HERO };
})();
