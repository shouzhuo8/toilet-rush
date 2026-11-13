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
    const moving = !!p.moving || !!p.animMove;
    const clench = p.endurance < 30;
    const dir = p.dir || 1;
    const charging = p.charging;
    const pushPhase = charging && charging.push;
    ctx.save();
    ctx.scale(dir * scl, scl);

    // ── 一次性动作（ART §2.2）──
    const ak = p.animKind, akp = p.animT || 0;
    if (ak === 'evictFly') { // 被逼出：倒转 3 圈飞出
      ctx.translate(0, -40 * Math.sin(akp * Math.PI));
      ctx.rotate(dir * akp * Math.PI * 6);
    } else if (ak === 'hit') { // 受击：后仰 + 白闪
      ctx.rotate(dir * -0.18 * Math.sin(akp * Math.PI));
      ctx.globalAlpha *= (akp < .35 ? .55 : 1);
    } else if (ak === 'sniff') { ctx.scale(1, 1 - .22 * Math.sin(akp * Math.PI)); }
    else if (ak === 'wash') { ctx.translate(0, -4 * Math.sin(akp * Math.PI)); }
    else if (ak === 'victory') { ctx.translate(0, -6 * Math.abs(Math.sin(akp * Math.PI * 2))); }
    else if (ak === 'climb') { ctx.translate(0, -10 * Math.sin(akp * Math.PI)); }
    else if (ak === 'nakedDash') { ctx.rotate(dir * 0.12 * Math.sin(akp * Math.PI)); }
    else if (ak === 'turboPush') { ctx.scale(1 + .06 * Math.sin(akp * Math.PI * 6), 1 - .06 * Math.sin(akp * Math.PI * 6)); }

    let bob = 0, lean = 0, legSwing = 0, armSwing = 0, squash = 1;
    if (!moving) {
      const f = Math.floor(t * 5) % 6;              // idle 憋扭：第3帧膝盖内扣、第6帧脸闪橙
      bob = f === 2 ? 1 : 0;
      legSwing = f === 2 || f === 3 ? 2 : 0;
      if (f === 5) { ctx.globalAlpha = .5; px(ctx, -9, 12, 18, 2, '#FB923C'); ctx.globalAlpha = 1; }
    } else if (clench) {
      const f = Math.floor(t * 4) % 4; legSwing = f === 1 ? 1 : 0; squash = 1.05; // 夹腿挪动
    } else {
      const ph = (p.walkPhase || 0) / 14;                              // 相位随真实位移
      const f = Math.floor(ph) % 6;                                     // 走/跑 6 帧
      legSwing = [0, 3, 5, 0, -3, -5][f];
      armSwing = [0, -2, -3, 0, 2, 3][f];
      bob = [0, -1, -2, 0, -1, -2][f];
      lean = (p.animSpeed || 0) > 60 ? 4 : 2;
      if ((p.animSpeed || 0) > 60) { ctx.globalAlpha = .3; px(ctx, -24, -4, 9, 2, C.paper); px(ctx, -28, 2, 11, 2, C.paper); ctx.globalAlpha = 1; }
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
    if (ak === 'wash' || ak === 'victory') { // 双手上举
      px(ctx, -14, y - 22 - Math.abs(Math.sin(t * 10)) * 3, 5, 14, H.uniform);
      px(ctx, 9, y - 22 - Math.abs(Math.cos(t * 10)) * 3, 5, 14, H.uniform);
      px(ctx, -14, y - 26 - Math.abs(Math.sin(t * 10)) * 3, 5, 5, C.skin);
      px(ctx, 9, y - 26 - Math.abs(Math.cos(t * 10)) * 3, 5, 5, C.skin);
    } else if (ak === 'paperHand') { // 伸手递纸
      px(ctx, 8, y - 4, 18, 5, C.skin); px(ctx, 25, y - 6, 8, 9, C.paper);
    } else if (charging && charging.type === 'punch') {
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
  function door(ctx, st, shown, simT, t) {
    // 信息保密（裁决#33）：门面只显示「有没有人」，障碍/纸/主任一律不画
    const { x, y, w, h } = st;
    px(ctx, x, y, w, h, C.mintDark); outline(ctx, x, y, w, h, C.mintLine, 3);
    px(ctx, x + 5, y + 5, w - 10, h - 10, C.wood); outline(ctx, x + 5, y + 5, w - 10, h - 10, C.woodDark, 2);
    for (let i = 0; i < 5; i++) { px(ctx, x + 12 + i * 18, y + 8, 2, h - 16, C.woodDark); px(ctx, x + 16 + i * 18, y + 8, 1, h - 16, C.woodLight); }
    // 门牌号
    px(ctx, x + 8, y + 8, 22, 16, C.woodDark); outline(ctx, x + 8, y + 8, 22, 16, C.ink, 1);
    label(ctx, String(st.idx + 1), x + 19, y + 21, { size: 11, lw: 0, color: C.paper });
    // 把手
    px(ctx, x + w - 20, y + h / 2 - 2, 10, 4, C.gold); outline(ctx, x + w - 20, y + h / 2 - 2, 10, 4, C.woodDark, 1);
    // 门缝
    px(ctx, x + 6, y + h - 12, w - 12, 9, C.ink);
    if (shown) { // 门缝腿：仅按显示层（假绿=无腿，不泄露真值）
      const kick = Math.sin(t * 6) * 2;
      px(ctx, x + 26 + kick, y + h - 9, 9, 6, '#334155'); px(ctx, x + w - 38 - kick, y + h - 9, 9, 6, '#334155');
      px(ctx, x + 25 + kick, y + h - 4, 11, 3, C.ink); px(ctx, x + w - 39 - kick, y + h - 4, 11, 3, C.ink);
    }
    // 占用灯
    const lx = x + w / 2, ly = y - 14;
    ctx.save(); ctx.shadowColor = shown ? C.red : C.green; ctx.shadowBlur = 10;
    circle(ctx, lx, ly, 9, shown ? C.red : C.green); ctx.restore();
    outline(ctx, lx - 9, ly - 9, 18, 18, C.ink, 2);
    label(ctx, shown ? '有' : '空', lx, ly + 4, { size: 10, lw: 0, color: C.paper });
    // 假贴翘边（物理存在的贴纸，属于反制线索）
    if (simT < st.fakeUntil) {
      ctx.save(); ctx.translate(x + 10, y + 30); ctx.rotate(-.08 + Math.sin(t * 4) * .02);
      px(ctx, 0, 0, 44, 16, C.purple); outline(ctx, 0, 0, 44, 16, C.ink, 1);
      label(ctx, '贴纸', 22, 12, { size: 9, lw: 0 }); ctx.restore();
    }
    // 优先锁
    if (st.lockBy >= 0 && simT < st.lockUntil) label(ctx, '🔒', lx + 18, ly + 4, { size: 12, lw: 0 });
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

  /* ---------- 校园厕所环境（世界侧，可辨认实物） ---------- */
  function toiletEnv(ctx, room, t) {
    // 四周瓷砖墙 + 1.1m 白色墙裙
    const { x, y, w, h } = room;
    const band = 78; // 墙裙高度
    for (const [rx, ry, rw, rh, side] of [
      [x, y, w, band, 'top'], [x, y + h - band, w, band, 'bottom'],
      [x, y, band, h, 'left'], [x + w - band, y, band, h, 'right'],
    ]) {
      ctx.fillStyle = '#F4FAF8'; ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = 'rgba(150,180,175,.55)'; ctx.lineWidth = 1;
      for (let i = 0; i < rw; i += 34) { ctx.beginPath(); ctx.moveTo(rx + i, ry); ctx.lineTo(rx + i, ry + rh); ctx.stroke(); }
      for (let j = 0; j < rh; j += 34) { ctx.beginPath(); ctx.moveTo(rx, ry + j); ctx.lineTo(rx + rw, ry + j); ctx.stroke(); }
    }
    // 瓷砖上沿阴影
    ctx.fillStyle = 'rgba(80,120,115,.20)'; ctx.fillRect(x, y + band, w, 4); ctx.fillRect(x, y + h - band - 4, w, 4);
    // 通风窗（上墙）
    for (const wx of [930, 1300]) {
      ctx.fillStyle = '#8FA9A4'; ctx.fillRect(wx, y + 8, 120, 48);
      ctx.fillStyle = '#DCEFEA'; ctx.fillRect(wx + 5, y + 13, 110, 38);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(120,150,145,.65)'; ctx.fillRect(wx + 5, y + 16 + i * 7, 110, 2); }
    }
    // 标语牌（被涂改的校园标语）
    const signs = [[700, y + 10, '来也匆匆 去也冲冲'], [250, y + h - 110, '节约用水 从我做起']];
    for (const [sx, sy, txt] of signs) {
      ctx.fillStyle = '#2F6DB5'; ctx.fillRect(sx - 86, sy, 172, 30);
      ctx.strokeStyle = '#1D4ED8'; ctx.lineWidth = 2; ctx.strokeRect(sx - 86, sy, 172, 30);
      ctx.fillStyle = '#FFF7ED'; ctx.font = '900 14px "PingFang SC",system-ui'; ctx.textAlign = 'center';
      ctx.fillText(txt, sx, sy + 20);
      // 被改成脏话的涂鸦
      ctx.strokeStyle = 'rgba(255,80,80,.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx - 40, sy + 8); ctx.lineTo(sx + 44, sy + 8); ctx.stroke();
      ctx.fillStyle = 'rgba(200,40,40,.9)'; ctx.font = '900 12px "PingFang SC",system-ui';
      ctx.fillText('（此处已被涂改）', sx, sy + 44);
    }
    // 拖把池 + 拖把
    const MX = 170, MY = 880;
    ctx.fillStyle = '#D6E2DE'; ctx.fillRect(MX, MY, 90, 70);
    ctx.strokeStyle = '#9FB2AD'; ctx.lineWidth = 3; ctx.strokeRect(MX, MY, 90, 70);
    ctx.fillStyle = '#7FA8A0'; ctx.fillRect(MX + 8, MY + 10, 74, 34);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(MX + 12, MY + 14, 30, 6);
    ctx.fillStyle = '#8A5A3B'; ctx.save(); ctx.translate(MX + 40, MY - 10); ctx.rotate(-.22); ctx.fillRect(0, 0, 6, 74); ctx.restore();
    ctx.fillStyle = '#BDB76B'; ctx.fillRect(MX + 26, MY + 6, 26, 16);
    // 垃圾桶 + 溢出的纸团
    for (const [bx, by] of [[1390, 700], [250, 250]]) {
      ctx.fillStyle = '#6B7A76'; ctx.fillRect(bx, by, 60, 74);
      ctx.strokeStyle = '#4B5A56'; ctx.lineWidth = 3; ctx.strokeRect(bx, by, 60, 74);
      ctx.fillStyle = '#8A9A96'; ctx.fillRect(bx, by, 60, 10);
      ctx.fillStyle = '#FAF7EF';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(bx + 8 + (i * 9) % 50, by - 4 - (i % 3) * 6, 7, 0, 6.2832); ctx.fill(); }
    }
    // 烘手机（墙面）
    ctx.fillStyle = '#B0B0B8'; ctx.fillRect(1310, y + 84, 46, 30);
    ctx.fillStyle = '#8A8A94'; ctx.fillRect(1314, y + 108, 38, 6);
    if (Math.sin(t * 9) > .6) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(1320, y + 114, 26, 18); }
    // 地漏 + 水渍
    for (const [gx, gy] of [[650, 660], [1080, 1000]]) {
      ctx.fillStyle = '#9AA5A1'; ctx.fillRect(gx, gy, 40, 18);
      ctx.fillStyle = '#5F6B68'; for (let i = 0; i < 5; i++) ctx.fillRect(gx + 3 + i * 7, gy + 2, 3, 14);
    }
    ctx.fillStyle = 'rgba(140,130,90,.20)';
    for (const [sx2, sy2] of [[1450, 660], [300, 900], [900, 980]]) { ctx.beginPath(); ctx.ellipse(sx2, sy2, 56, 18, 0, 0, 6.2832); ctx.fill(); }
    // 墙角霉斑
    ctx.fillStyle = 'rgba(70,90,70,.22)';
    for (const [mx2, my2] of [[x + 12, y + 12], [x + w - 40, y + h - 60]]) { ctx.beginPath(); ctx.ellipse(mx2, my2, 26, 16, .4, 0, 6.2832); ctx.fill(); }
  }

  /* ---------- 隔间排：隔板 + 门楣 + 门牌 ---------- */
  function stallRow(ctx, stalls, t) {
    for (const st of stalls) {
      // 门楣
      ctx.fillStyle = '#8A5A3B'; ctx.fillRect(st.x - 6, st.y - 12, st.w + 12, 10);
      ctx.strokeStyle = '#5F3A24'; ctx.lineWidth = 2; ctx.strokeRect(st.x - 6, st.y - 12, st.w + 12, 10);
      // 隔板（左右）
      ctx.fillStyle = '#7C8F8A'; ctx.fillRect(st.x - 10, st.y - 6, 8, st.h + 8);
      ctx.fillStyle = '#6B7A76'; ctx.fillRect(st.x + st.w + 2, st.y - 6, 8, st.h + 8);
      // 隔板刻字
      ctx.fillStyle = 'rgba(40,30,20,.5)'; ctx.font = '900 9px system-ui'; ctx.textAlign = 'left';
      ctx.fillText('到此一游', st.x + st.w - 4, st.y + 40 + ((st.idx * 13) % 60));
    }
  }

  /* ---------- 隔间内第一视角（1000×620 设计坐标） ---------- */
  function stallInterior(ctx, o) {
    // o = { w,h, t, st, p, harass, state, hasPaper, obstacle, idx, seed }
    const W = o.w, H = o.h, t = o.t;
    const sx = W / 1000, sy = H / 620;
    ctx.save(); ctx.scale(sx, sy);
    const st = o.st, idx = o.idx || 0;
    const seed = (o.seed || 1) ^ (idx * 2654435761);
    const R = mulberry32(seed);

    // ── 0. 墙面：瓷砖 + 白色墙裙 ──
    ctx.fillStyle = '#CDEBE6'; ctx.fillRect(0, 0, 1000, 620);
    for (let y = 0; y < 620; y += 26) for (let x = 0; x < 1000; x += 26) {
      ctx.fillStyle = ((x / 26 | 0) + (y / 26 | 0)) % 2 ? '#BFE3DD' : '#CDEBE6';
      ctx.fillRect(x, y, 25, 25);
      ctx.fillStyle = 'rgba(111,174,164,.45)'; ctx.fillRect(x, y, 25, 1); ctx.fillRect(x, y, 1, 25);
    }
    // 墙裙（下 1/3）白瓷砖
    ctx.fillStyle = '#F4FAF8'; ctx.fillRect(0, 400, 1000, 220);
    for (let x = 0; x < 1000; x += 40) { ctx.fillStyle = 'rgba(180,200,196,.6)'; ctx.fillRect(x, 400, 1, 220); }
    for (let y = 400; y < 620; y += 34) { ctx.fillStyle = 'rgba(180,200,196,.6)'; ctx.fillRect(0, y, 1000, 1); }
    // 墙面污渍与霉斑
    ctx.fillStyle = 'rgba(120,110,80,.18)';
    for (let i = 0; i < 7; i++) { const px2 = R() * 900 + 50, py2 = R() * 380 + 20; ctx.beginPath(); ctx.ellipse(px2, py2, 14 + R() * 26, 8 + R() * 16, R() * 3, 0, 6.2832); ctx.fill(); }
    // 通风窗（上方居中）
    ctx.fillStyle = '#8FA9A4'; ctx.fillRect(430, 24, 140, 54);
    ctx.fillStyle = '#DCEFEA'; ctx.fillRect(436, 30, 128, 42);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(120,150,145,.7)'; ctx.fillRect(436, 32 + i * 7, 128, 2); }
    // 吊灯
    ctx.fillStyle = '#6B7A76'; ctx.fillRect(492, 0, 16, 14);
    ctx.fillStyle = Math.sin(t * 11) > -.9 ? '#FFFBEA' : '#D8D2BE';
    ctx.beginPath(); ctx.moveTo(470, 14); ctx.lineTo(530, 14); ctx.lineTo(516, 30); ctx.lineTo(484, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,251,234,.10)'; ctx.beginPath(); ctx.moveTo(470, 30); ctx.lineTo(530, 30); ctx.lineTo(600, 420); ctx.lineTo(400, 420); ctx.closePath(); ctx.fill();

    // ── 1. 门板内面 ──
    const shake = Math.min(o.harass || 0, 3) * 2 * (Math.sin(t * 40) > 0 ? 1 : -1);
    const bulge = o.bulge || 0;
    ctx.save(); ctx.translate(shake, 0);
    const DX = 300 - bulge * 6, DY = 60, DW = 400 + bulge * 12, DH = 400;
    ctx.fillStyle = '#8A5A3B'; ctx.fillRect(DX, DY, DW, DH);
    ctx.strokeStyle = '#5F3A24'; ctx.lineWidth = 4; ctx.strokeRect(DX, DY, DW, DH);
    // 木纹
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#7A4E33' : '#96653F'; ctx.fillRect(DX + 10 + i * 44, DY + 6, 3, DH - 12); }
    // 门闩（插销）
    ctx.fillStyle = '#B0B0B8'; ctx.fillRect(DX + DW - 30, DY + 190, 22, 30);
    ctx.fillStyle = '#7C7C86'; ctx.fillRect(DX + DW - 30, DY + 190, 22, 8);
    ctx.fillStyle = '#5F3A24'; ctx.fillRect(DX + DW - 44, DY + 198, 16, 12);
    // 合页
    ctx.fillStyle = '#8A8A94'; ctx.fillRect(DX - 2, DY + 40, 14, 26); ctx.fillRect(DX - 2, DY + 320, 14, 26);
    // 划痕
    ctx.strokeStyle = 'rgba(60,40,25,.55)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) { const x0 = DX + 40 + R() * (DW - 80), y0 = DY + 60 + R() * (DH - 120); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 20 + R() * 40, y0 + 6 + R() * 20); ctx.stroke(); }
    // 涂鸦
    ctx.fillStyle = 'rgba(40,30,20,.75)'; ctx.font = '900 17px "PingFang SC",system-ui'; ctx.textAlign = 'left';
    ctx.fillText('王小明到此一游', DX + 40, DY + 90);
    ctx.fillText('主任是狗', DX + 60, DY + 250);
    ctx.fillStyle = 'rgba(200,40,40,.72)'; ctx.font = '900 26px system-ui';
    ctx.fillText('♥', DX + 300, DY + 120); ctx.strokeStyle = 'rgba(40,30,20,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(DX + 290, DY + 110); ctx.lineTo(DX + 340, DY + 150); ctx.stroke();
    // 小广告 ×3（歪贴、被撕角）
    const ads = [['通下水道', '138****6688', DX + 44, DY + 150, -0.06], ['开锁 24H', '挂锁 · 随叫随到', DX + 250, DY + 200, 0.05], ['办证', '学历 · 证件 · 包过', DX + 120, DY + 320, -0.03]];
    for (const [a, b, x, y, rot] of ads) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = '#F4F0E6'; ctx.fillRect(0, 0, 150, 48);
      ctx.strokeStyle = '#B9B3A4'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, 150, 48);
      ctx.fillStyle = '#B91C1C'; ctx.font = '900 17px "PingFang SC",system-ui'; ctx.fillText(a, 8, 20);
      ctx.fillStyle = '#1F1A17'; ctx.font = '700 11px "PingFang SC",system-ui'; ctx.fillText(b, 8, 38);
      ctx.fillStyle = 'rgba(205,235,230,1)'; ctx.beginPath(); ctx.moveTo(150, 0); ctx.lineTo(126, 0); ctx.lineTo(150, 22); ctx.closePath(); ctx.fill(); // 撕角
      ctx.restore();
    }
    // 门缝（下沿 12px）：透光 + 门外影子
    ctx.fillStyle = '#0E0C0A'; ctx.fillRect(DX + 4, DY + DH - 13, DW - 8, 13);
    ctx.fillStyle = 'rgba(255,247,210,.55)'; ctx.fillRect(DX + 10, DY + DH - 10, DW - 20, 4);
    const sh = Math.sin(t * 1.6) * 60 + 200;
    ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fillRect(DX + sh, DY + DH - 9, 46, 8);
    // 骚扰裂纹 + 鼓包
    if ((o.harass || 0) >= 2) {
      ctx.strokeStyle = 'rgba(50,30,20,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(DX + 200, DY + 60); ctx.lineTo(DX + 226, DY + 150); ctx.lineTo(DX + 196, DY + 230); ctx.stroke();
    }
    if (bulge > 0) { ctx.strokeStyle = 'rgba(30,20,12,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(DX + DW / 2, DY + DH / 2, 70 + bulge * 10, 110 + bulge * 14, 0, 0, 6.2832); ctx.stroke(); }
    // 门缝塞进来的扫把头（被捅）
    if (o.poking) {
      ctx.fillStyle = '#BDB76B'; ctx.fillRect(DX + 150, DY + DH - 6, 90, 12);
      ctx.fillStyle = '#8A7B3A'; ctx.fillRect(DX + 148, DY + DH - 2, 94, 6);
      for (let i = 0; i < 8; i++) { ctx.fillStyle = '#C9C07A'; ctx.fillRect(DX + 150 + i * 12, DY + DH + 6, 4, 12 + (i % 3) * 4); }
    }
    ctx.restore();

    // ── 2. 左侧卷纸架（真实形态：有纸=纸卷+垂纸；没纸=空纸芯）──
    const RX = 150, RY = 330;
    ctx.fillStyle = '#B0B0B8'; ctx.fillRect(RX - 6, RY - 26, 12, 10); // 支架
    ctx.fillStyle = '#8A8A94'; ctx.fillRect(RX - 3, RY - 18, 6, 46);
    if (o.hasPaper) {
      ctx.fillStyle = '#FAF7EF'; ctx.beginPath(); ctx.ellipse(RX, RY + 8, 30, 22, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#D6D0C2'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#E6DFD0'; ctx.beginPath(); ctx.ellipse(RX, RY + 8, 11, 8, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#FAF7EF'; ctx.fillRect(RX - 16, RY + 22, 32, 34); // 垂纸
      ctx.strokeStyle = '#D6D0C2'; ctx.strokeRect(RX - 16, RY + 22, 32, 34);
      ctx.beginPath(); ctx.moveTo(RX - 16, RY + 56); ctx.lineTo(RX - 6, RY + 62); ctx.lineTo(RX + 4, RY + 56); ctx.lineTo(RX + 16, RY + 62); ctx.stroke();
    } else {
      ctx.fillStyle = '#C9BFA8'; ctx.beginPath(); ctx.ellipse(RX, RY + 8, 22, 16, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#8A7F6A'; ctx.beginPath(); ctx.ellipse(RX, RY + 8, 12, 8, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#FAF7EF'; ctx.fillRect(RX - 8, RY + 14, 16, 12); // 最后半张
    }
    // 右侧挂钩 + 书包
    const HX = 860, HY = 190;
    ctx.fillStyle = '#B0B0B8'; ctx.fillRect(HX - 4, HY - 6, 8, 16); ctx.fillRect(HX - 4, HY - 6, 22, 6);
    ctx.fillStyle = '#2F6DB5'; ctx.fillRect(HX - 26, HY + 4, 52, 64);
    ctx.strokeStyle = '#1D4ED8'; ctx.lineWidth = 3; ctx.strokeRect(HX - 26, HY + 4, 52, 64);
    ctx.fillStyle = '#3AA0FF'; ctx.fillRect(HX - 16, HY + 18, 32, 16);

    // ── 3. 蹲便器（真实形态）+ 障碍 ──
    const BX = 500, BY = 520;
    // 台阶
    ctx.fillStyle = '#E8EFEC'; ctx.fillRect(BX - 190, BY - 40, 380, 110);
    ctx.strokeStyle = '#B6C6C1'; ctx.lineWidth = 3; ctx.strokeRect(BX - 190, BY - 40, 380, 110);
    // 蹲便槽（椭圆）
    ctx.fillStyle = '#F4FAF8'; ctx.beginPath(); ctx.ellipse(BX, BY + 14, 84, 40, 0, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#9FB2AD'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#7FA8A0'; ctx.beginPath(); ctx.ellipse(BX, BY + 18, 62, 26, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(BX - 16, BY + 12, 24, 8, 0, 0, 6.2832); ctx.fill();
    // 排污口
    ctx.fillStyle = '#2F3A38'; ctx.beginPath(); ctx.ellipse(BX, BY + 34, 18, 9, 0, 0, 6.2832); ctx.fill();
    // 防滑脚垫
    ctx.fillStyle = '#D6E2DE'; ctx.fillRect(BX - 160, BY - 16, 56, 20); ctx.fillRect(BX + 104, BY - 16, 56, 20);
    // 障碍（真实造型）
    if (o.obstacle) obstacle(ctx, o.obstacle, BX, BY + 6, t, 1.35);

    // ── 4. 地面细节：烟头、纸团、水渍、地漏 ──
    const floorY = 596;
    for (let i = 0; i < 4; i++) {
      const cx2 = 120 + R() * 760, cy2 = floorY - R() * 26;
      ctx.fillStyle = '#F4F0E6'; ctx.fillRect(cx2, cy2, 16, 5);
      ctx.fillStyle = '#B5651D'; ctx.fillRect(cx2 + 13, cy2, 5, 5);
      ctx.fillStyle = '#6B6B6B'; ctx.fillRect(cx2 - 3, cy2, 4, 5);
    }
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(200 + R() * 600, floorY - 4 - R() * 30, 5 + R() * 4, 0, 6.2832); ctx.fill(); }
    ctx.fillStyle = 'rgba(150,140,100,.22)';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(120 + R() * 760, floorY - 10 - R() * 30, 26 + R() * 30, 8 + R() * 8, 0, 0, 6.2832); ctx.fill(); }
    // 地漏
    ctx.fillStyle = '#9AA5A1'; ctx.fillRect(760, floorY - 22, 40, 16);
    ctx.fillStyle = '#5F6B68'; for (let i = 0; i < 5; i++) ctx.fillRect(763 + i * 7, floorY - 20, 3, 12);

    // ── 5. 前景：蹲姿膝盖 / 裤腿（马赛克处理裸露）──
    if (o.state === 'relief' || o.state === 'blocked' || o.state === 'post') {
      const bob = Math.sin(t * 3) * 2;
      ctx.fillStyle = '#243244'; ctx.fillRect(330, 470 + bob, 90, 120); ctx.fillRect(580, 470 - bob, 90, 120); // 裤腿
      ctx.fillStyle = '#1E293B'; ctx.fillRect(330, 566 + bob, 110, 40); ctx.fillRect(560, 566 - bob, 110, 40);
      // 小腿皮肤
      ctx.fillStyle = '#F5C9A6'; ctx.fillRect(352, 486 + bob, 46, 40); ctx.fillRect(602, 486 - bob, 46, 40);
      // 马赛克条（遮挡）
      for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#9CA3AF' : '#6B7280';
        ctx.fillRect(430 + i * 10, 540 + j * 10, 10, 10);
      }
    }
    // ── 6. 被闯入演出 ──
    if (o.intrusion > 0) {
      const k = o.intrusion;
      ctx.fillStyle = `rgba(0,0,0,${.55 * k})`; ctx.fillRect(0, 0, 1000, 620);
      // 门外逆光剪影
      ctx.fillStyle = 'rgba(255,247,210,' + (.7 * k) + ')'; ctx.fillRect(340, 60, 320, 400);
      ctx.fillStyle = 'rgba(20,16,12,' + (.9 * k) + ')';
      ctx.beginPath(); ctx.arc(500, 210, 46, 0, 6.2832); ctx.fill();
      ctx.fillRect(450, 250, 100, 210);
      ctx.fillRect(432, 270, 26, 150); ctx.fillRect(542, 270, 26, 150);
      // 木屑
      ctx.fillStyle = '#C9A87C';
      for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; ctx.fillRect(500 + Math.cos(a) * (60 + 120 * k), 300 + Math.sin(a) * (60 + 120 * k), 6, 4); }
      // 飞舞的厕纸
      ctx.fillStyle = '#FAF7EF'; ctx.save(); ctx.translate(720 - 200 * k, 380 - 120 * k); ctx.rotate(k * 4); ctx.fillRect(-24, -12, 48, 24); ctx.restore();
    }
    // ── 7. 被捅演出：红边暗角 ──
    if (o.hurt > 0) {
      const g = ctx.createRadialGradient(500, 310, 180, 500, 310, 560);
      g.addColorStop(0, 'rgba(180,20,20,0)'); g.addColorStop(1, 'rgba(180,20,20,' + (.75 * o.hurt) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1000, 620);
    }
    ctx.restore();
  }

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

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

  window.ART = { C, px, outline, circle, label, floor, desks, lockers, tilesWall, character, door, obstacle, item, sink, gate, shameSign, onomat, bubble, stallInterior, toiletEnv, stallRow, HERO };
})();
