/* 课间特急 — 剧情/教学/横屏/技能演出层 ui.js v1.0
 * 自包含：注入自己的 DOM 与样式，不依赖 index.html 结构（#cvwrap / #wrap 存在即可）。
 * 暴露 window.UI，game.js 通过 UI.skill(...) / UI.tip(...) 调用；未调用也能独立跑开场剧情。
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
  #uiStory { position:absolute; left:50%; bottom:12%; transform:translateX(-50%);
    width:min(760px,92%); min-height:118px; display:none; padding:16px 20px 16px 108px;
    background:linear-gradient(#2b241b,#1b1710); border:4px solid #8a5a3b; border-radius:14px;
    box-shadow:0 8px 0 #00000066,0 16px 36px #000b, inset 0 2px 0 #ffffff22; color:#fff7ed; }
  #uiStory .face { position:absolute; left:14px; bottom:14px; width:80px; height:80px; border-radius:12px;
    background:#f5c9a6; border:3px solid #1f1a17; box-shadow:inset 0 -10px 0 #3aa0ff; overflow:hidden; }
  #uiStory .face::before { content:''; position:absolute; left:12px; top:22px; width:10px; height:14px; background:#1f1a17; box-shadow:44px 0 0 #1f1a17; border-radius:50%; }
  #uiStory .face::after { content:''; position:absolute; left:28px; top:52px; width:24px; height:8px; border-bottom:3px solid #b91c1c; border-radius:0 0 50% 50%; }
  #uiStory.urgent .face { box-shadow:inset 0 -10px 0 #ef4444; }
  #uiStory .who { font-size:12px; font-weight:900; color:#fde047; letter-spacing:2px; margin-bottom:6px; text-shadow:1px 1px 0 #000; }
  #uiStory .txt { font-size:16px; font-weight:700; line-height:1.6; min-height:48px; text-shadow:1px 2px 0 #000; }
  #uiStory .next { position:absolute; right:14px; bottom:8px; font-size:11px; color:#fbbf24; animation:blink 1s infinite; }
  @keyframes blink { 50% { opacity:.25 } }

  /* 忍耐条教学高亮 */
  #uiTeach { position:absolute; left:50%; top:52px; transform:translateX(-50%);
    display:none; padding:10px 18px; max-width:90%; background:#1f1a17ee; border:3px solid #fde047;
    border-radius:10px; color:#fff7ed; font-size:13px; font-weight:800; text-align:center;
    box-shadow:0 6px 20px #000a; text-shadow:1px 1px 0 #000; }
  #uiTeach b { color:#4ade80; } #uiTeach .bad { color:#ef4444; }
  #uiTeach .arrow { color:#fde047; font-size:16px; }
  #uiTeachPointer { position:absolute; top:6px; left:120px; width:0; height:0; display:none;
    border-left:10px solid transparent; border-right:10px solid transparent; border-top:16px solid #fde047;
    filter:drop-shadow(0 2px 0 #000); animation:bob .8s infinite alternate; }
  @keyframes bob { to { transform:translateY(6px) } }

  /* 技能/道具发动卡 */
  #uiSkillWrap { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
  .ui-skill { position:absolute; min-width:260px; padding:14px 26px 18px; text-align:center;
    background:linear-gradient(#30281d,#171310); border:4px solid #fde047; border-radius:16px;
    box-shadow:0 10px 0 #00000066,0 24px 50px #000c,0 0 60px #fde04755, inset 0 2px 0 #ffffff33;
    color:#fff7ed; animation:skillIn .28s cubic-bezier(.2,1.7,.4,1) both, skillOut .35s ease-in 1.35s forwards; }
  .ui-skill .ico { font-size:38px; line-height:1; filter:drop-shadow(2px 3px 0 #000); }
  .ui-skill .nm { margin-top:6px; font-size:22px; font-weight:900; letter-spacing:2px; color:#fde047; text-shadow:2px 3px 0 #000; }
  .ui-skill .ds { margin-top:4px; font-size:12px; color:#d6d3d1; }
  .ui-skill .bar { margin-top:10px; height:6px; background:#00000066; border-radius:3px; overflow:hidden; }
  .ui-skill .bar i { display:block; height:100%; width:100%; background:linear-gradient(90deg,#38bdf8,#fde047); animation:charge 1.1s linear both; }
  .ui-skill::before,.ui-skill::after { content:'✦'; position:absolute; top:-14px; font-size:18px; color:#fde047; text-shadow:0 0 10px #fde047; }
  .ui-skill::before { left:-12px } .ui-skill::after { right:-12px }
  @keyframes skillIn { from { transform:scale(.4) rotate(-8deg); opacity:0 } to { transform:scale(1) rotate(0); opacity:1 } }
  @keyframes skillOut { to { transform:scale(1.12) translateY(-30px); opacity:0 } }
  @keyframes charge { from { width:0 } to { width:100% } }

  /* 全屏闪光 + 拟声 */
  #uiFlash { position:absolute; inset:0; background:#fff7ed; opacity:0; pointer-events:none; }
  #uiFlash.go { animation:flash .3s ease-out; }
  @keyframes flash { 0% { opacity:.72 } 100% { opacity:0 } }


  #uiTeach, #uiTeachPointer, #uiSkillWrap, .ui-skill { pointer-events:none; }
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
    <div id="uiStory"><div class="face"></div><div class="who"></div><div class="txt"></div><div class="next">▼ 点击继续 / 3s 后自动</div></div>
    <div id="uiSkillWrap"></div>
    <button id="uiRotate" type="button">🔄 横屏游玩</button>`;
  host.appendChild(layer);

  const $ = (s) => layer.querySelector(s);
  const story = $('#uiStory'), teach = $('#uiTeach'), ptr = $('#uiTeachPointer'),
        skillWrap = $('#uiSkillWrap'), flash = $('#uiFlash'), rotateBtn = $('#uiRotate');

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
  story.addEventListener('click', () => { if (typing) { clearInterval(typing); typing = null; story.querySelector('.txt').textContent = cur.text; armAuto(cur.hold); } else next(); });

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

  /* ---------- 技能/道具发动卡 ---------- */
  const SKILLS = {
    soda:    ['🥤','憋气糖','20 秒内忍耐流失减半'],
    poster:  ['🏷️','假指示贴','把隔间红绿灯翻过来骗人'],
    flush:   ['🚽','冲水伪装','假装有人刚冲完，试探门后'],
    sniff:   ['👃','蹲下嗅闻','闻出：没人 / 有人 / 主任'],
    turbo:   ['⚡','涡轮增压','嗯嗯啊啊！排便大幅加速'],
    paper:   ['🧻','门缝递纸','把纸递进去，帮 TA 体面收场'],
    takePaper:['🧻','取纸','拿到纸，干净完成'],
    wash:    ['🧼','洗手','优雅结束（用时 +5s）'],
    raid:    ['🪜','翻墙取纸','不惊动里面，偷了纸就爬出来'],
    climbOut:['🪜','原路爬出','神不知鬼不觉'],
    wire:    ['🔧','铁丝撬锁','撬开红门 → 推门期可反悔'],
    ladder:  ['🪜','梯子翻墙','无视门锁进红门'],
    broom:   ['🧹','扫把捅门','门缝下捅人，骚扰 +1'],
    plunger: ['🪠','搋子拍晕','吸在头上拔不下来'],
    knock:   ['✊','疯狂拍门','哐！！全厕所都听见'],
    punch:   ['👊','出拳','砰！击退对手，不硬直'],
    clear:   ['🧹','清障','把巨蟒/草莓塔疏通掉'],
    naked:   ['🩲','光屁股出门','10 秒内找纸或洗手'],
    dean:    ['📰','主任来了','敲门/骚扰前先嗅一下！'],
  };
  function skill(key, extra) {
    const s = SKILLS[key]; if (!s) return;
    const [ico, nm, ds] = s;
    const el = doc.createElement('div'); el.className = 'ui-skill';
    el.innerHTML = `<div class="ico">${ico}</div><div class="nm">${nm}</div><div class="ds">${extra || ds}</div><div class="bar"><i></i></div>`;
    skillWrap.appendChild(el);
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    setTimeout(() => el.remove(), 1800);
  }
  function tip(text, ms) {
    teach.textContent = text; teach.style.display = 'block'; ptr.style.display = 'none';
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

  /* ---------- 拾取道具说明 toast（非打断式） ---------- */
  const ITEM_INFO = {
    mask:    ['🥽 口罩', '免疫嗅闻传染与恶臭（戴上即生效）'],
    broom:   ['🧹 扫把', '对红门按 Q：门缝捅人（骚扰+1）· 也可通巨蟒'],
    wire:    ['🔧 铁丝', '对红门按 Q：撬锁闯入（骚扰+3），推门期 X 可撤'],
    ladder:  ['🪜 梯子', '对红门按 Q：翻墙闯入（骚扰+3），可翻入取纸'],
    plunger: ['🪠 搋子', '对红门按 Q：拍晕（骚扰+1）· 清巨蟒/草莓塔必备'],
    paper:   ['🧻 卫生纸', '自己无纸时完成善后；也可对喊话的人按 Q 递纸'],
    comic:   ['📖 漫画书', '拿着就行：排便时间 -5s'],
    soda:    ['🥤 憋气糖', '按 F 使用：20 秒内忍耐流失减半'],
    poster:  ['🏷️ 假指示贴', '按 F 对最近隔间贴：翻转红绿灯骗人 20 秒'],
  };
  const toastHost = doc.createElement('div');
  toastHost.style.cssText = 'position:absolute;right:10px;top:88px;display:flex;flex-direction:column;gap:8px;pointer-events:none;z-index:65;';
  layer.appendChild(toastHost);
  function itemToast(kind) {
    const it = ITEM_INFO[kind]; if (!it) return;
    const el = doc.createElement('div');
    el.style.cssText = `pointer-events:none;min-width:230px;max-width:290px;padding:10px 14px;background:linear-gradient(#2b241b,#1b1710);
      border:3px solid ${({mask:'#8ECAE6',broom:'#BDB76B',wire:'#B0B0B8',ladder:'#C68B59',plunger:'#8D5A3A',paper:'#F4F0E6',comic:'#FF9F68',soda:'#90E0A0',poster:'#C084FC'})[kind] || '#FDE047'};
      border-radius:12px;color:#fff7ed;font-size:12px;font-weight:700;box-shadow:0 6px 18px #000a;
      animation:toastIn .3s cubic-bezier(.2,1.5,.4,1) both;`;
    el.innerHTML = `<div style="font-size:14px;font-weight:900;color:#FDE047;text-shadow:1px 1px 0 #000;">获得 ${it[0]}</div>
      <div style="margin-top:4px;line-height:1.5;color:#e7e5e4;">${it[1]}</div>`;
    toastHost.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s, transform .4s'; el.style.opacity = '0'; el.style.transform = 'translateX(30px)'; }, 4600);
    setTimeout(() => el.remove(), 5100);
  }
  const toastCss = doc.createElement('style');
  toastCss.textContent = '@keyframes toastIn{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}';
  doc.head.appendChild(toastCss);

  window.UI = { say, skill, tip, teachEndurance, goLandscape, itemToast, SKILLS };
})();
