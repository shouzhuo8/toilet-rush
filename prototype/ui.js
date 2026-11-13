/* 课间特急 — 剧情/教学/横屏/技能演出层 ui.js v1.0
 * 自包含：注入自己的 DOM 与样式，不依赖 index.html 结构（#cvwrap / #wrap 存在即可）。
 * 暴露 window.UI（say/tip/teachEndurance/goLandscape）；不依赖 game.js 也能独立跑开场剧情。
 */
(function () {
  'use strict';
  const doc = document;

  /* ---------- 样式 ---------- */
  const css = doc.createElement('style');
  css.textContent = `
  .ui-layer { position:absolute; inset:0; pointer-events:none; z-index:60; font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif; }
  .ui-layer #uiStory, .ui-layer #uiRotate { pointer-events:auto; } /* 仅对话框与横屏按钮可点 */

  /* 剧情对话框 */
  #uiStory { position:absolute; left:50%; top:10px; transform:translateX(-50%);
    width:min(620px,92%); min-height:56px; display:none; padding:10px 16px 10px 74px;
    background:linear-gradient(#2b241b,#1b1710); border:4px solid #8a5a3b; border-radius:14px;
    box-shadow:0 8px 0 #00000066,0 16px 36px #000b, inset 0 2px 0 #ffffff22; color:#fff7ed; }
  #uiStory .face { position:absolute; left:10px; bottom:8px; width:54px; height:54px; border-radius:12px;
    background:#f5c9a6; border:3px solid #1f1a17; box-shadow:inset 0 -10px 0 #3aa0ff; overflow:hidden; }
  #uiStory .face::before { content:''; position:absolute; left:9px; top:15px; width:8px; height:10px; background:#1f1a17; box-shadow:30px 0 0 #1f1a17; border-radius:50%; }
  #uiStory .face::after { content:''; position:absolute; left:18px; top:36px; width:18px; height:6px; border-bottom:3px solid #b91c1c; border-radius:0 0 50% 50%; }
  #uiStory.urgent .face { box-shadow:inset 0 -10px 0 #ef4444; }
  #uiStory .who { font-size:11px; font-weight:900; color:#fde047; letter-spacing:1px; margin-bottom:2px; text-shadow:1px 1px 0 #000; }
  #uiStory .txt { font-size:13px; font-weight:700; line-height:1.45; min-height:32px; text-shadow:1px 2px 0 #000; }
  #uiStory .next { position:absolute; right:10px; top:6px; font-size:10px; color:#fbbf24; opacity:.7; }
  @keyframes blink { 50% { opacity:.25 } }

  /* 忍耐条教学高亮 */
  #uiTeach { position:absolute; left:50%; top:8px; transform:translateX(-50%);
    display:none; padding:6px 14px; max-width:min(700px,92%); background:#1f1a17cc; border:2px solid #fde04799;
    border-radius:8px; color:#fff7ed; font-size:12px; font-weight:800; text-align:center;
    box-shadow:0 4px 12px #0008; text-shadow:1px 1px 0 #000; line-height:1.4; }
  #uiTeach b { color:#4ade80; } #uiTeach .bad { color:#ef4444; }
  #uiTeach .arrow { color:#fde047; font-size:16px; }
  #uiTeachPointer { position:absolute; top:6px; left:120px; width:0; height:0; display:none;
    border-left:10px solid transparent; border-right:10px solid transparent; border-top:16px solid #fde047;
    filter:drop-shadow(0 2px 0 #000); animation:bob .8s infinite alternate; }
  @keyframes bob { to { transform:translateY(6px) } }

  /* 全屏闪光 + 拟声 */
  #uiFlash { position:absolute; inset:0; background:#fff7ed; opacity:0; pointer-events:none; }
  #uiFlash.go { animation:flash .3s ease-out; }
  @keyframes flash { 0% { opacity:.72 } 100% { opacity:0 } }


  /* 横屏按钮 */
  #uiRotate { position:absolute; right:12px; top:52px; padding:8px 14px; font-size:12px; font-weight:900;
    color:#1f1a17; background:linear-gradient(#fde047,#d97706); border:3px solid #5f3a24; border-radius:10px;
    box-shadow:0 4px 0 #0008; cursor:pointer; z-index:70; }
  #uiRotate:active { transform:translateY(2px); box-shadow:0 2px 0 #0008; }
  `;
  doc.head.appendChild(css);

  const host = doc.getElementById('cvwrap') || doc.getElementById('wrap') || doc.body;
  const layer = doc.createElement('div'); layer.className = 'ui-layer';
  layer.innerHTML = `
    <div id="uiFlash"></div>
    <div id="uiTeach"></div><div id="uiTeachPointer"></div>
    <div id="uiStory"><div class="face"></div><div class="who"></div><div class="txt"></div><div class="next">自动</div></div>
    <button id="uiRotate" type="button">🔄 横屏游玩</button>`;
  host.appendChild(layer);

  const $ = (s) => layer.querySelector(s);
  const story = $('#uiStory'), teach = $('#uiTeach'), ptr = $('#uiTeachPointer'),
        flash = $('#uiFlash'), rotateBtn = $('#uiRotate');

  /* ---------- 剧情对话框（队列 + 打字机） ---------- */
  const queue = [];
  let cur = null, typing = null, autoTimer = null;
  function say(who, text, opt) {
    opt = opt || {};
    queue.push({ who, text, urgent: !!opt.urgent, hold: opt.hold || 3200 });
    if (!cur) next();
  }
  function next() {
    clearTimeout(autoTimer); if (typing) { clearInterval(typing); typing = null; }
    const q = queue.shift();
    if (!q) { story.style.display = 'none'; cur = null; return; }
    cur = q; story.style.display = 'block';
    story.classList.toggle('urgent', q.urgent);
    story.querySelector('.who').textContent = q.who;
    const txtEl = story.querySelector('.txt'); txtEl.textContent = '';
    let i = 0;
    typing = setInterval(() => {
      txtEl.textContent = q.text.slice(0, ++i);
      if (i >= q.text.length) { clearInterval(typing); typing = null; armAuto(q.hold); }
    }, 26);
    autoTimer = setTimeout(() => { if (cur === q) next(); }, q.hold + q.text.length * 26 + 400);
  }
  function armAuto(ms) { clearTimeout(autoTimer); autoTimer = setTimeout(() => next(), ms); }
  // 玩法提示：纯自动推进（点击仅加速，不要求点击）
  story.addEventListener('click', () => { if (typing) { clearInterval(typing); typing = null; story.querySelector('.txt').textContent = cur.text; armAuto(cur.hold); } });

  /* ---------- 忍耐条教学 ---------- */
  function teachEndurance() {
    teach.innerHTML = '🟢 <b>忍耐度条</b>：会一直下降，<span class="bad">归零就「炸裆」直接失败</span>！<br>'
      + '<span class="arrow">▲</span> 看左上角 HUD 的绿条 · 快跑向厕所抢隔间，蹲下才开始拉！';
    teach.style.display = 'block'; ptr.style.display = 'block';
    // 指向 HUD 忍耐条实际位置
    const bar = doc.getElementById('ebarbg');
    if (bar) { const r = bar.getBoundingClientRect(), h = host.getBoundingClientRect(); ptr.style.left = (r.left - h.left + r.width / 2 - 10) + 'px'; ptr.style.top = (r.bottom - h.top + 2) + 'px'; }
    setTimeout(() => { teach.style.display = 'none'; ptr.style.display = 'none'; }, 9000);
  }

  /* ---------- 玩法提示条（非阻断、自动消失） ---------- */
  function tip(text, ms) {
    teach.textContent = text; teach.style.display = 'block';
    clearTimeout(teach._t); teach._t = setTimeout(() => teach.style.display = 'none', ms || 4000);
  }

  /* ---------- 横屏：按钮 + 首次交互自动尝试 ---------- */
  async function goLandscape(silent) {
    try {
      const el = doc.documentElement;
      if (el.requestFullscreen && !doc.fullscreenElement) await el.requestFullscreen().catch(() => {});
      const o = screen.orientation || screen.msOrientation || screen.mozOrientation;
      if (o && o.lock) await o.lock('landscape').catch(() => {});
      if (!silent) tip('已尝试切换横屏；若未生效请手动旋转设备 🔄', 3200);
    } catch (e) { if (!silent) tip('浏览器不支持自动横屏，请手动旋转设备 🔄', 3200); }
  }
  rotateBtn.addEventListener('click', () => goLandscape(false));
  function updateRotateBtn() {
    const portrait = window.innerHeight > window.innerWidth;
    rotateBtn.style.display = portrait ? 'block' : 'none';
  }
  window.addEventListener('resize', updateRotateBtn); updateRotateBtn();
  let autoDone = false;
  function firstGesture() {
    if (autoDone) return; autoDone = true;
    if (window.innerHeight > window.innerWidth) goLandscape(true);
    window.removeEventListener('pointerdown', firstGesture);
    window.removeEventListener('keydown', firstGesture);
  }
  window.addEventListener('pointerdown', firstGesture, { passive: true });
  window.addEventListener('keydown', firstGesture);

  /* ---------- 开场剧情（不依赖 game.js，靠 HUD 文案变化推铃响） ---------- */
  function intro() {
    say('你 · 憋到极限', '忍不住了……绿条一归零就「炸裆」！铃一响，冲厕所抢隔间！', { urgent: true, hold: 3600 });
    setTimeout(teachEndurance, 800);
  }
  // 等画布与 HUD 就位再开场
  setTimeout(intro, 350);

  // 监听 HUD 倒计时：从「准备」变成秒数 = 铃响
  let bellFired = false;
  const timerEl = doc.getElementById('timer');
  if (timerEl) {
    const mo = new MutationObserver(() => {
      if (bellFired || !timerEl.textContent) return;
      if (!/准备/.test(timerEl.textContent) && /\d/.test(timerEl.textContent)) {
        bellFired = true;
        say('叮铃铃——', '下课！！冲啊——往右走出教室，穿过走廊，冲进厕所！别在路上挨揍！', { urgent: true, hold: 3600 });
        tip('🏃 目标：走过出口 → 走廊 → 厕所门 → 抢一个没人的隔间', 6000);
      }
    });
    mo.observe(timerEl, { childList: true, characterData: true, subtree: true });
  }

  window.UI = { say, tip, teachEndurance, goLandscape };
})();
