/* 课间特急：厕所攻防战 — 可玩原型 v0.1
 * 单机 20Hz 权威模拟（与 ARCH-9.5 结算协议同构）+ 4 个 AI + 双端输入 + 无头测试
 * 规则来源：GDD-PVP.md v0.3；结算协议：arch/ARCH-9.5-引导结算协议.md
 */
'use strict';

/* ================= 配置（GDD §15 数值速查表同源） ================= */
const TICK = 20, TICK_MS = 1000 / TICK;
const s = (sec) => Math.round(sec * TICK); // 秒 → tick

const NUM = {
  drain: { poo: 0.36 }, // 局长 4~8min：步行上限 ≈278s
  runMult: 1.5, sneakMult: 0.5,
  speed: { run: 60, walk: 43, sneak: 21.6 }, // px/s（≈12px/m）
  relief: { poop: s(38) },
  turboSave: s(13), comicSave: s(5),
  guide: { wire: s(1.2), ladder: s(2), poke: s(1.5), bonk: s(0.5), knock: s(1.5), wash: s(1.5), takePaper: s(0.5), climbPaper: s(1.5), climbOut: s(0.8),
           sniff: s(1.5), paper: s(1.5), clearPA: s(3), clearPB: s(5), clearBA: s(8),
           push: s(2), enter: s(0.5) },
  cd: { pokeDoor: s(3), knock: s(10), knockAbort: s(5), reenter: s(3) },
  harass: { need: 3, decay: s(9) },
  prot: { evictImmune: s(10), lock: s(2),
          staggerS: s(3), staggerL: s(4), evictDrain: s(8) },
  dean: { prob: 0.6, spawnMin: s(30), spawnMax: s(90), stayMin: s(15), stayMax: s(35), anger: 0.30 },
  stall: { obstacle: 0.35, paper: 0.70 },
  bells: { pre: s(150), preMult: 1.5, cap: s(480), softAt: 3, softT: s(120), softMult: 2.0 },
  post: { autoBreak: s(15), penalty: s(5), autoPenalty: s(8), washPenalty: s(5), nakedMult: 0.6, washGuide: s(1.5), takePaper: s(0.5), climbPaper: s(1.5), climbOut: s(0.8) },
  sniff: { errBare: 0.10, errMask: 0.15, infect: 0.45, rate: 0.30, range: 52 },
  soda: { dur: s(20), mult: 0.5 },
  punch: { guide: s(0.4), cd: s(3), dmg: 4, kb: 72, kbDur: s(0.2), range: 42, koLine: 8 }, // 裁决#20 互殴：击退不硬直
  splash: { broom: 0.30, dmg: 5 },
  actR: 48, pickR: 26, // 基础交互/拾取半径
  reach: 170, // 厕所内跨区交互半径（入口→各隔间门；与 ARCH-13.2 的 L1 感知半径 15m 同量级）
};

/* ================= 工具 ================= */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================= 三地图（MAP-INTERACTION.md v1.0）=================
 * map0 教室(900×620) / map1 教室外-三平行走廊(1800×620) / map2 厕所(1100×760)
 * 跨图零可见；连接口自动切图；摄像机跟随。 */
const MAPS = [
  { id: 0, name: '教室', W: 1800, H: 1100, floor: 'floorClass', label: '教室',
    rooms: [{ x: 60, y: 140, w: 1680, h: 820 }] },
  { id: 1, name: '教室外', W: 2400, H: 1200, floor: 'floorFast', label: '走廊',
    rooms: [
      { x: 40, y: 160, w: 140, h: 920 },                // 西竖井（教室门落点，纵贯三路）
      { x: 180, y: 160, w: 2000, h: 100, id: 'rB', label: '道具路B', floor: 'floorB' },
      { x: 180, y: 560, w: 2000, h: 100, id: 'fast', label: '快速路', floor: 'floorFast' },
      { x: 180, y: 960, w: 2000, h: 120, id: 'rA', label: '道具路A', floor: 'floorA' },
      { x: 2180, y: 160, w: 140, h: 920 },              // 东竖井（厕所门落点，纵贯三路）
    ] },
  { id: 2, name: '厕所', W: 1800, H: 1100, floor: 'toilet', label: '厕所',
    rooms: [{ x: 60, y: 60, w: 1680, h: 980 }] },
];
const ROOMS = MAPS[1].rooms; // 兼容旧引用（走廊三路）
function walkable(mapId, x, y) { for (const r of MAPS[mapId].rooms) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true; return false; }
function inToilet(p) { return p.mapId === 2; }

/* 连接口（§2.1）：触发区 + 落点 + 锁定条件 */
const CONNECTIONS = [
  { from: 0, to: 1, trig: { x: 1700, y: 500, w: 60, h: 60 }, land: { x: 100, y: 600 }, dir: 1, lock: 'bell', oneWay: true, label: '教室出口' },
  { from: 1, to: 2, trig: { x: 2300, y: 560, w: 60, h: 60 }, land: { x: 130, y: 980 }, dir: 1, label: '厕所门' },
  { from: 2, to: 1, trig: { x: 70, y: 950, w: 60, h: 60 }, land: { x: 2330, y: 600 }, dir: -1, label: '厕所门' },
];

const STALLS = [ // map2 坐标（上排 3 间 y=140，下排 2 间 y=520）
  { x: 300, y: 200 }, { x: 780, y: 200 }, { x: 1260, y: 200 },
  { x: 540, y: 780 }, { x: 1020, y: 780 },
].map((u, i) => ({ idx: i, mapId: 2, x: u.x, y: u.y, w: 110, h: 110, doorPt: { x: u.x + 55, y: u.y - 30 }, inPt: { x: u.x + 55, y: u.y + 55 }, occ: null, occId: 0, occKind: null, obstacle: null, hasPaper: false, harass: 0, lastH: -9999, lockBy: -1, lockUntil: 0, fakeOcc: null, fakeUntil: 0 }));
const SINK = { x: 1500, y: 560, mapId: 2 };
const SPAWNS = [0, 1, 2, 3, 4].map(i => ({ x: 240 + i * 120, y: 540 })); // map0
const ROUTES = { // map1 内分段路径（西井→东路→东井）
  fast: [{ x: 140, y: 610 }, { x: 500, y: 610 }, { x: 1900, y: 610 }, { x: 2220, y: 610 }],
  A: [{ x: 140, y: 1010 }, { x: 500, y: 1010 }, { x: 1900, y: 1010 }, { x: 2220, y: 610 }],
  B: [{ x: 140, y: 210 }, { x: 500, y: 210 }, { x: 1900, y: 210 }, { x: 2220, y: 610 }],
};
const ITEM_DEFS = {
  mask: { name: '口罩', color: '#8ecae6' }, broom: { name: '扫把', color: '#bdb76b' },
  wire: { name: '铁丝', color: '#b0b0b8' }, ladder: { name: '梯子', color: '#c68b59' },
  plunger: { name: '搋子', color: '#8d5a3a' }, paper: { name: '卫生纸', color: '#f4f0e6' },
  comic: { name: '漫画书', color: '#ff9f68' }, soda: { name: '憋气糖', color: '#90e0a0' },
  poster: { name: '假指示贴', color: '#c084fc' },
};
const WEAPONS = new Set(['broom', 'wire', 'ladder', 'plunger']);
const CONSUMABLES = new Set(['paper', 'soda', 'poster']);

/* ============ ART-DIRECTION v1.0 色板（P0 落地） ============ */
const PAL = {
  floorClass: '#E8D8B0', floorFast: '#D9D2BE', floorA: '#F2C078', floorB: '#A3B18A',
  toilet: '#BFE3DD', toiletDark: '#8FC9C1', door: '#8A5A3B', doorDark: '#5F3A24',
  occRed: '#EF4444', freeGreen: '#22C55E', fault: '#F59E0B',
  ink: '#1F1A17', paper: '#FFF7ED',
  eGood: '#4ADE80', eMid: '#FBBF24', eWarn: '#FB923C', eBad: '#EF4444',
  armor: '#38BDF8', gold: '#FDE047', rage: '#F97316', infect: '#A3E635', deanFog: '#7F1D1D',
  sonar: { 1: '#94A3B8', 2: '#38BDF8', 3: '#FB923C', 4: '#DC2626' },
  onomat: '#FFF7ED', onomatInk: '#1F1A17',
};
// 四级视觉声呐（听障可玩性 / 音频情报冗余）：Ⅰ脚步 Ⅱ水流 Ⅲ战斗 Ⅳ主任
const SONAR_LV = {
  foot: 1, relief: 2, turbo: 2, shout: 2, flush: 2,
  harass: 3, evict: 3, clear: 3, poster: 1, punch: 3,
  deanIn: 4, deanAnger: 4, deanOut: 4,
};
// 拟声字包（P0-9）：事件 → 画面文字
const ONOMAT = {
  harass: '嗷！', evict: '出去！', turbo: '嗯嗯啊啊！', shout: '谁有纸！！',
  flush: '哗——', clear: '噗通', deanIn: '……', deanAnger: '你，出来', punch: '砰！',
};

/* ================= Sim（权威模拟 + ARCH-9.5 三段流水） ================= */
class Sim {
  constructor(seed) {
    this.rng = mulberry32(seed >>> 0); this.seed = seed >>> 0;
    this.t = 0; this.phase = 'prep'; this.prepLeft = s(10);
    this.G = 1; this.softUntil = -1; this.finalCount = 0;
    this.events = []; this.pending = []; this.iidSeq = 1;
    this.bellT = 0; this.lastShout = null;

    // 全员"大肠翻滚"（v0.4：尿线已彻底删除）
    const NAMES = ['你', '王小明', '李铁蛋', '张翠花', '赵大宝'];
    const COLORS = ['#3aa0ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#c084fc'];
    this.players = NAMES.map((n, i) => ({
      id: i, name: n, color: COLORS[i], debuff: 'poo', mapId: 0, switchCdUntil: 0, _sim: null,
      x: SPAWNS[i].x, y: SPAWNS[i].y, dir: 1,
      endurance: 100, moveMode: 'walk', sneaking: false,
      state: 'idle', // idle|relief|post|stagger —— FINAL 由 final 字段表达
      relief: null, // {kind,total,left}
      post: null, // {shouted, autoAt}
      naked: false, // 光屁股移动态（裁决#18）：可去有纸隔间取纸 / 洗手台优雅结束
      climbed: -1, hasClimbedPaper: false, // 裁决#19：翻入取纸→沿原路爬出后才定型
      beaten: 0, beatCdUntil: 0, kb: null, // 裁决#20：挨揍计数(≥8 打出屎)/出拳CD/击退位移
      final: null, // {kind:'done'|'blowout'|'dead', time}
      staggerUntil: 0, armorUntil: 0, rageUntil: 0, immuneUntil: 0,
      drainBuffUntil: 0, sodaUntil: 0, reenterCDUntil: 0,
      items: [], sniffLeft: 1, turboLeft: 1,
      cds: {}, charging: null, bot: i > 0,
      atStall: -1,
    }));

    // 障碍 + 纸（裁决#4 保底 1 间）
    this.stalls = STALLS.map(() => null);
    const obRoll = STALLS.map(() => this.rng() < NUM.stall.obstacle);
    if (!obRoll.some(v => v)) obRoll[(this.rng() * STALLS.length) | 0] = true;
    STALLS.forEach((st, i) => {
      this.stalls[i] = { ...st, obstacle: obRoll[i] ? (this.rng() < 0.5 ? 'anaconda' : 'berry') : null, hasPaper: this.rng() < NUM.stall.paper, fakeOcc: null, fakeUntil: 0 };
    });

    // 道具
    let itemId = 1; this.items = [];
    const put = (kind, x, y) => this.items.push({ id: itemId++, kind, mapId: 2, x, y, taken: false });
    const put1 = (kind, x, y) => this.items.push({ id: itemId++, kind, mapId: 1, x, y, taken: false });
    put1('mask', 700, 570); put1('mask', 700, 590); put1('wire', 700, 610);
    put1('paper', 700, 630); put1('comic', 700, 650); put1('soda', 700, 670); // A 路：同一 x 并排 6 件
    put1('poster', 1200, 610); // 快速路中点（顺手恶作剧，单件不参与争抢）
    put1('broom', 700, 170); put1('broom', 700, 195); put1('ladder', 700, 220);
    put1('plunger', 700, 245); put1('paper', 700, 270); // B 路：同一 x 并排 5 件
    put('plunger', 1560, 560); put('paper', 1600, 560); // 洗手台旁（map2，put 默认）

    // 主任
    this.dean = { active: false, stall: -1, planned: this.rng() < NUM.dean.prob, spawnAt: -1, leaveAt: -1, secondDone: false };
    if (this.dean.planned) this.dean.spawnAt = NUM.dean.spawnMin + ((this.rng() * (NUM.dean.spawnMax - NUM.dean.spawnMin)) | 0);
    this.players.forEach(p => { p._sim = this; });
  }

  /* ---- 对外 API ---- */
  queue(pid, type, target) { const iid = this.iidSeq++; this.pending.push({ iid, pid, type, target }); return iid; }
  cancel(pid) { const g = this.players[pid].charging; if (g) g.cancelReq = true; }
  drop(pid) { const p = this.players[pid]; if (p.charging) this._abortGuide(p, p.charging, 'drop'); } // C10：断线=目标失效
  get alivePlayers() { return this.players.filter(p => !p.final); }

  /* ---- 连接口与切图事务（MAP-INTERACTION §2）---- */
  touchConnections(p) {
    if (this.phase !== 'run' || p.final || this.t < p.switchCdUntil) return;
    for (const c of CONNECTIONS) {
      if (c.from !== p.mapId) continue;
      if (p.x >= c.trig.x && p.x <= c.trig.x + c.trig.w && p.y >= c.trig.y && p.y <= c.trig.y + c.trig.h) {
        this.switchMap(p, c); // 本函数仅在 run 阶段执行，铃前锁定已由 movePlayer 的 x≤780 阻挡实现
        return;
      }
    }
  }
  switchMap(p, c) {
    // 2. ABORT 在途引导（ARCH-9.5 目标失效：全额回滚；KNOCK 半额 CD 例外）
    if (p.charging) this._abortGuide(p, p.charging, 'switch');
    if (p.climbed >= 0) p.climbed = -1; // 翻入资格丢失，已取的纸保留
    // 3~6. 换图 + 落点 + 冷却（订阅/快照在联机版扩展，单机即内存态）
    p.mapId = c.to;
    p.x = c.land.x; p.y = c.land.y;
    p.switchCdUntil = this.t + s(1.5);
    this._ev('switchMap', { pid: p.id, from: c.from, to: c.to, label: c.label });
    // 切图转场（MAP-INTERACTION §8）：0.35s 黑场 + 门声；表现层消费该事件
  }

  _ev(type, data) { this.events.push({ ...data, t: this.t, type }); } // type 恒为事件名（载荷字段不可覆盖）
  _canSee(p, pt) { return dist(p, pt) <= NUM.actR + 26 || inToilet(p) && inToilet(pt); }
  shownOcc(st) { return this.t < st.fakeUntil ? st.fakeOcc : !!st.occ; } // 信息层（可被假贴篡改），合法性永远看 st.occ 真值
  clearFake(st) { st.fakeOcc = null; st.fakeUntil = 0; }

  /* ---- 引导系统（ARCH-9.5） ---- */
  _startGuide(p, g) {
    p.charging = g; g.startT = this.t;
    g.resolveT = this.t + g.dur; g.cancelReq = false;
    if (g.type === 'wire' || g.type === 'ladder' || g.type === 'climbPaper') { g.occId = this.stalls[g.target.idx].occId; }
    else if (g.type === 'poke' || g.type === 'bonk' || g.type === 'knock' || g.type === 'sniff' || g.type === 'paper') { g.occId = this.stalls[g.target.idx].occId; }
    this._ev('guideStart', { pid: p.id, act: g.type, dur: g.dur });
    if (p.id === 0) this._ev('uiSkill', { pid: 0, key: ({ wire: 'wire', ladder: 'ladder', poke: 'broom', bonk: 'plunger', knock: 'knock', sniff: 'sniff', paper: 'paper', clear: 'clear', takePaper: 'takePaper', wash: 'wash', climbOut: 'climbOut' })[g.type] || g.type });
  }
  _abortGuide(p, g, reason) {
    p.charging = null;
    // 回滚矩阵：消耗在 RESOLVE 才落账 → 全额回滚；KNOCK 半额 CD（防刷音）
    if (g.type === 'knock' && g.dur > 0) p.cds['knock'] = this.t + NUM.cd.knockAbort;
    this._ev('guideAbort', { pid: p.id, act: g.type, reason });
  }
  _consume(p, kind) {
    const charges = p._charges || (p._charges = {});
    if (WEAPONS.has(kind)) {
      if (charges[kind] === undefined) { if (!p.items.includes(kind)) return; charges[kind] = 1; }
      charges[kind]--;
      if (charges[kind] <= 0) { delete charges[kind]; const i = p.items.indexOf(kind); if (i >= 0) p.items.splice(i, 1); }
    } else {
      const i = p.items.indexOf(kind); if (i >= 0) p.items.splice(i, 1);
    }
  }
  _hasWeapon(p, k) { return p.items.includes(k); }

  /* ---- tick 主循环：三段流水 ---- */
  tick() {
    if (this.phase === 'end') return;
    this.t++;
    if (this.phase === 'prep') {
      this.prepLeft--; if (this.prepLeft <= 0) { this.phase = 'run'; this.bellT = this.t; this._ev('bell', { kind: 'start' }); }
      return;
    }
    /* ── 段① 定时器结算 ── */
    this._timers();
    /* ── 段② 在途引导推进（resolve 升序，同刻按 startT）── */
    const charging = this.players.filter(p => p.charging).sort((a, b) => a.charging.resolveT - b.charging.resolveT || a.charging.startT - b.charging.startT || a.id - b.id);
    for (const p of charging) {
      const g = p.charging; if (!g) continue;
      const stall = g.target && g.target.idx !== undefined ? this.stalls[g.target.idx] : null;
      const invalid = stall && g.occId !== undefined && stall.occId !== g.occId;
      if (g.cancelReq) { this._cancelGuide(p, g); continue; }
      if (invalid) { this._abortGuide(p, g, 'target'); continue; }
      if (g.push) {
        if (this.t >= g.pushUntil) this._resolvePush(p, g, stall);
        continue;
      }
      if (this.t >= g.resolveT) this._resolve(p, g, stall);
    }
    /* ── 段③ 新意图受理（actor_id 确定性排序）── */
    const sorted = this.pending.slice().sort((a, b) => a.pid - b.pid); this.pending = [];
    for (const it of sorted) this._accept(it);
    /* 收尾 */
    if (this.finalCount >= 5) this._end();
  }

  _cancelGuide(p, g) {
    p.charging = null;
    if (g.push) { this._ev('pushCancel', { pid: p.id }); return; } // 推门期取消：道具已耗、安全
    this._abortGuide(p, g, 'cancel');
  }

  /* ---- 段① ---- */
  _timers() {
    const t = this.t;
    if (t === NUM.bells.pre) { this.G = NUM.bells.preMult; this._ev('bell', { kind: 'pre' }); }
    if (this.softUntil > 0 && t >= this.softUntil) { this.softUntil = -1; this._forceEnd(); return; } // 软收尾到时无条件结束（含已定型者不再重算）
    if (t >= NUM.bells.cap) this._forceEnd();

    // 主任
    const d = this.dean;
    if (!d.active && d.spawnAt > 0 && t >= d.spawnAt) {
      const free = this.stalls.filter(st => !st.occ && !st.obstacle);
      if (free.length) {
        const st = free[(this.rng() * free.length) | 0];
        d.active = true; d.stall = st.idx; st.occ = 'dean'; st.occKind = 'dean'; st.occId++; st.harass = 0; this.clearFake(st);
        d.leaveAt = t + NUM.dean.stayMin + ((this.rng() * (NUM.dean.stayMax - NUM.dean.stayMin)) | 0);
        d.spawnAt = -1;
        this._ev('deanIn', {});
      } else { d.spawnAt = t + s(5); } // 候选为空：5s 重 roll
    }
    if (d.active && t >= d.leaveAt) {
      const st = this.stalls[d.stall]; st.occ = null; st.occKind = null; st.occId++; st.harass = 0; this.clearFake(st);
      d.active = false; d.stall = -1;
      this._ev('deanOut', {});
      if (!d.secondDone && this.alivePlayers.length > 2 && this.rng() < 0.3) { d.secondDone = true; d.spawnAt = t + s(10); }
    }

    for (const p of this.players) {
      if (p.final) continue;
      // 忍耐流失
      if (p.state === 'idle') {
        let mult = p.moveMode === 'run' ? NUM.runMult : p.moveMode === 'sneak' ? NUM.sneakMult : 1;
        if (t < p.sodaUntil) mult *= NUM.soda.mult;
        if (t < p.drainBuffUntil) mult *= 1.25;
        p.endurance -= NUM.drain.poo * mult * this.G / TICK;
        if (p.endurance <= 0) this._finalize(p, 'blowout');
      }
      // 排便进度
      if (p.state === 'relief' && p.relief) {
        p.relief.left--;
        if (p.relief.left <= 0) this._reliefDone(p);
      }
      // 挂起超时（含光屁股移动态）：10s 强制自动破罐 +8s
      if (p.post && (p.state === 'post' || p.naked) && !p.post.hasPaper) {
        if (t >= p.post.autoAt) this._breakFinish(p, true);
      }
      // 击退位移（裁决#20）：0.2s 强制位移，墙体贴住
      if (p.kb && t < p.kb.until) {
        const nx2 = p.x + p.kb.vx / TICK, ny2 = p.y + p.kb.vy / TICK;
        if (walkable(p.mapId, nx2, p.y)) p.x = nx2; else p.kb.until = t;
        if (walkable(p.mapId, p.x, ny2)) p.y = ny2; else p.kb.until = t;
      } else if (p.kb && t >= p.kb.until) p.kb = null;
      // 骚扰值衰减
      for (const st of this.stalls) if (st.harass > 0 && t - st.lastH > NUM.harass.decay) { st.harass--; st.lastH = t; if (st.harass <= 0) st.c_first = null; }
    }
    // 软收尾检测
    if (this.softUntil < 0 && this.finalCount >= NUM.bells.softAt && this.finalCount < 5) {
      this.softUntil = t + NUM.bells.softT; this.G = NUM.bells.softMult; this._ev('bell', { kind: 'soft' });
    }
  }

  _forceEnd() { for (const p of this.players) if (!p.final) this._finalize(p, 'blowout'); this._end(); }
  _end() { if (this.phase !== 'end') { this.phase = 'end'; this._ev('gameEnd', {}); } }

  _reliefDone(p) {
    const st = this.stalls[p.atStall];
    if (st && st.hasPaper) { st.hasPaper = false; this._finalize(p, 'done'); }
    else { p.state = 'post'; p.post = { hasPaper: false, shouted: false, autoAt: this.t + NUM.post.autoBreak }; this._ev('postStuck', { pid: p.id }); }
  }
  _breakFinish(p, auto) {
    if (!p.post) return;
    p.post = null; this._finalize(p, 'done', auto ? NUM.post.autoPenalty : NUM.post.penalty);
  }
  // 裁决#18：光着屁股出门（离开隔间、进入移动态；10s 倒计时继续）
  _goNaked(p) {
    if (p.state !== 'post' || !p.post) return;
    if (p.atStall >= 0) {
      const st = this.stalls[p.atStall];
      if (st.occ === p) { st.occ = null; st.occKind = null; st.occId++; st.harass = 0; this.clearFake(st); }
      p.x = st.doorPt.x; p.y = st.doorPt.y - 8; p.atStall = -1;
    }
    p.state = 'idle'; p.naked = true; p.relief = null;
    this._ev('nakedOut', { pid: p.id });
  }
  _cleanFinish(p, how, penalty = 0) { // how: 'paper' | 'wash'
    if (!p.naked && p.state !== 'post') return;
    p.post = null; p.naked = false;
    this._ev(how === 'wash' ? 'washDone' : 'paperGot', { pid: p.id });
    this._finalize(p, 'done', penalty);
  }
  _finalize(p, kind, penalty = 0) {
    if (p.final) return;
    p.charging = null; p.state = 'idle'; p.relief = null; p.post = null; p.naked = false; p.climbed = -1;
    if (p.atStall >= 0) { const st = this.stalls[p.atStall]; if (st.occ === p) { st.occ = null; st.occKind = null; st.occId++; st.harass = 0; this.clearFake(st); } p.atStall = -1; }
    p.final = { kind, time: kind === 'done' ? Math.max(0.05, (this.t - this.bellT) / TICK + penalty / TICK) : (this.t - this.bellT) / TICK };
    this.finalCount++;
    this._ev('final', { pid: p.id, kind, time: p.final.time });
    // 指向该玩家的在途引导 → 目标失效（段②下 tick 也会捕获，这里即时清理更快）
    for (const q of this.players) {
      const g = q.charging;
      if (g && g.target && g.target.idx !== undefined) {
        const st = this.stalls[g.target.idx];
        if (st.occId !== g.occId) this._abortGuide(q, g, 'target');
      }
    }
  }

  /* ---- 段③：意图受理 ---- */
  _accept(it) {
    const p = this.players[it.pid];
    if (!p || p.final) return;
    if (p.charging) { this._ev('intentFail', { pid: it.pid, why: 'busy' }); return; }
    const t = it.type, tg = it.target || {};
    const st = tg.idx !== undefined && !['punch'].includes(t) ? this.stalls[tg.idx] : null;
    // 跨图零交互（MAP-INTERACTION §4）
    if (st && st.mapId === 2 && p.mapId !== 2) return this._ev('intentFail', { pid: it.pid, why: 'far', act: t });

    const fail = (why) => this._ev('intentFail', { pid: it.pid, why, act: t });
    const cdKey = (k) => `${k}`;
    const cdOf = (k) => (p.cds[cdKey(k)] || 0) > this.t;

    switch (t) {
      case 'pick': {
        const item = this.items.find(i => i.id === tg.id && !i.taken);
        if (!item || item.mapId !== p.mapId || dist(p, item) > NUM.pickR) return fail('far');
        if (p.items.length >= 2) return fail('full');
        if (WEAPONS.has(item.kind) && p.items.some(i => WEAPONS.has(i))) return fail('weapon1');
        item.taken = true; p.items.push(item.kind);
        if (item.kind === 'broom' || item.kind === 'plunger') p._charges = { ...p._charges, [item.kind]: 2 };
        this._ev('pick', { pid: p.id, kind: item.kind }); return;
      }
      case 'move': { p.moveMode = tg.mode; return; }
      case 'enterStall': {
        if (!st || dist(p, st.doorPt) > (inToilet(p) ? NUM.reach : NUM.actR + 30)) return fail('far');
        if (this.t < p.reenterCDUntil) return fail('cd');
        if (st.occ || st.obstacle) return fail(st.obstacle ? 'dirty' : 'occupied');
        if (st.lockBy >= 0 && st.lockBy !== p.id && this.t < st.lockUntil) return fail('lock');
        this._startGuide(p, { type: 'enterStall', dur: NUM.guide.enter, target: tg, occId: st.occId });
        return;
      }
      case 'poke': case 'bonk': case 'knock': {
        if (!st || !st.occ || dist(p, st.doorPt) > (inToilet(p) ? NUM.reach : NUM.actR + 26)) return fail('far');
        if (t === 'poke') { if (!this._hasWeapon(p, 'broom')) return fail('noitem'); if (cdOf(`poke${tg.idx}`)) return fail('cd'); }
        if (t === 'bonk') { if (!this._hasWeapon(p, 'plunger')) return fail('noitem'); if (cdOf(`poke${tg.idx}`)) return fail('cd'); }
        if (t === 'knock') { if (cdOf('knock')) return fail('cd'); p.cds['knock'] = this.t + NUM.cd.knock; }
        if (t === 'poke') p.cds[`poke${tg.idx}`] = this.t + NUM.cd.pokeDoor;
        this._startGuide(p, { type: t, dur: t === 'poke' ? NUM.guide.poke : t === 'bonk' ? NUM.guide.bonk : NUM.guide.knock, target: tg });
        return;
      }
      case 'wire': case 'ladder': {
        if (!st || !st.occ || dist(p, st.doorPt) > (inToilet(p) ? NUM.reach : NUM.actR + 26)) return fail('far');
        if (!this._hasWeapon(p, t)) return fail('noitem');
        this._startGuide(p, { type: t, dur: t === 'wire' ? NUM.guide.wire : NUM.guide.ladder, target: tg });
        return;
      }
      case 'sniff': {
        if (p.sniffLeft <= 0) return fail('used');
        if (!st || dist(p, st.doorPt) > (inToilet(p) ? NUM.reach : NUM.sniff.range)) return fail('far');
        this._startGuide(p, { type: 'sniff', dur: NUM.guide.sniff, target: tg });
        return;
      }
      case 'paper': {
        if (!st || !st.occ || dist(p, st.doorPt) > (inToilet(p) ? NUM.reach : NUM.actR + 26)) return fail('far');
        if (!p.items.includes('paper')) return fail('noitem');
        const occ = st.occ; if (occ === 'dean' || !occ.post) return fail('target');
        this._startGuide(p, { type: 'paper', dur: NUM.guide.paper, target: tg });
        return;
      }
      case 'clear': {
        if (!st || !st.obstacle || st.occ || dist(p, st.doorPt) > (inToilet(p) ? NUM.reach : NUM.actR + 26)) return fail('far');
        let dur = 0, kind = null;
        if (this._hasWeapon(p, 'plunger')) { dur = st.obstacle === 'anaconda' ? NUM.guide.clearPA : NUM.guide.clearPB; kind = 'plunger'; }
        else if (st.obstacle === 'anaconda' && this._hasWeapon(p, 'broom')) { dur = NUM.guide.clearBA; kind = 'broom'; }
        else return fail('noitem');
        this._startGuide(p, { type: 'clear', dur, target: tg, occId: st.occId, clearKind: kind });
        return;
      }
      case 'turbo': {
        if (p.turboLeft <= 0 || !p.relief || p.relief.kind !== 'poop') return fail('cond');
        p.turboLeft--; p.relief.total -= NUM.turboSave; p.relief.left -= NUM.turboSave;
        this._ev('turbo', { pid: p.id }); this._noise(p.x, p.y, 'turbo');
        return;
      }
      case 'soda': {
        const i = p.items.indexOf('soda'); if (i < 0) return fail('noitem');
        p.items.splice(i, 1); p.sodaUntil = this.t + NUM.soda.dur; this._ev('soda', { pid: p.id }); return;
      }
      case 'punch': { // 裁决#20：空手互殴——命中后击退 72px/0.2s，不硬直、不控；排便/光屁股中不可出拳
        const v = this.players[tg.id]; if (!v || v.final || v.id === p.id) return fail('target');
        if (this.t < p.beatCdUntil) return fail('cd');
        if (dist(p, v) > NUM.punch.range || p.mapId !== v.mapId) return fail('far');
        if (p.state !== 'idle') return fail('cond');
        p.beatCdUntil = this.t + NUM.punch.cd;
        if (p.id === 0) this._ev('uiSkill', { pid: 0, key: 'punch' });
        this._startGuide(p, { type: 'punch', dur: NUM.punch.guide, target: { kind: 'player', id: v.id } });
        return;
      }
      case 'poster': {
        if (!st || dist(p, st.doorPt) > (inToilet(p) ? NUM.reach : NUM.actR + 26)) return fail('far');
        if (!p.items.includes('poster')) return fail('noitem');
        p.items.splice(p.items.indexOf('poster'), 1);
        st.fakeOcc = !this.shownOcc(st); st.fakeUntil = this.t + s(20); // 20s 后自动复原
        this._ev('poster', { pid: p.id, idx: st.idx, shown: st.fakeOcc });
        return;
      }
      case 'flushFake': {
        if (!st || dist(p, st.doorPt) > (inToilet(p) ? NUM.reach : NUM.actR + 26)) return fail('far');
        if (this.shownOcc(st)) return fail('occupied');
        // 假贴绿标的主任间：无声失败，但操作者由此确认真值（不广播，仅单播结果）
        this._noise(st.doorPt.x, st.doorPt.y, 'flush');
        this._ev('flushFake', { pid: p.id, idx: st.idx, truth: st.occ === 'dean' ? 'dean' : st.occ ? 'player' : 'none' });
        return;
      }
      case 'giveup': {
        if (p.state === 'relief' || p.state === 'post') {
          if (p.relief) p.relief.left = p.relief.total; // 进度清零
          p.post = null; p.state = 'idle'; p.reenterCDUntil = this.t + NUM.cd.reenter;
          if (p.atStall >= 0) { const st2 = this.stalls[p.atStall]; if (st2.occ === p) { st2.occ = null; st2.occKind = null; st2.occId++; st2.harass = 0; } p.x = st2.doorPt.x; p.y = st2.doorPt.y - 6; p.atStall = -1; }
          this._ev('giveup', { pid: p.id });
        }
        return;
      }
      case 'shout': {
        if (p.state !== 'post' || !p.post || p.post.shouted) return fail('cond');
        p.post.shouted = true; p.post.autoAt = this.t + NUM.post.autoBreak;
        this.lastShout = { stall: p.atStall, until: this.t + NUM.post.autoBreak };
        this._ev('shout', { pid: p.id }); this._noise(p.x, p.y, 'shout'); return;
      }
      case 'break': { if (p.state === 'post') this._breakFinish(p, false); return; }
      case 'nakedOut': { if (p.state === 'post') this._goNaked(p); return; }
      case 'punch': {
        const v = this.players[g.target.id];
        if (!v || v.final || v.mapId !== p.mapId || dist(p, v) > NUM.punch.range * 1.6) { this._ev('punchMiss', { pid: p.id }); return; }
        v.beaten++;
        v.endurance -= NUM.punch.dmg;
        // 击退：沿攻击者→受害者方向位移 kb px / kbDur（隔间内不退：门挡着）
        if (v.atStall < 0 && v.atUrinal < 0) {
          const dx = v.x - p.x, dy = v.y - p.y, d = Math.hypot(dx, dy) || 1;
          v.kb = { vx: dx / d * NUM.punch.kb / (NUM.punch.kbDur / (1000 / TICK_MS)), vy: dy / d * NUM.punch.kb / (NUM.punch.kbDur / (1000 / TICK_MS)), until: this.t + NUM.punch.kbDur };
          if (v.charging && !v.charging.push) this._abortGuide(v, v.charging, 'punched'); // 位移必然打断引导（道具回滚）
        }
        this._ev('punchHit', { pid: p.id, vid: v.id, beaten: v.beaten });
        this._noise(v.x, v.y, 'punch');
        if (v.beaten >= NUM.punch.koLine) { this._ev('beatenOut', { pid: v.id, by: p.id }); this._finalize(v, 'blowout'); return; }
        if (v.endurance <= 0) this._finalize(v, 'blowout');
        return;
      }
      case 'takePaper': {
        if (!p.naked || !st) return fail('cond');
        if (dist(p, st.doorPt) > (inToilet(p) ? NUM.reach : NUM.actR + 26)) return fail('far');
        if (!st.hasPaper) return fail('nopaper');
        if (st.occ || st.obstacle) return fail('occupied');
        if (st.lockBy >= 0 && st.lockBy !== p.id && this.t < st.lockUntil) return fail('lock');
        this._startGuide(p, { type: 'takePaper', dur: NUM.guide.takePaper, target: tg, occId: st.occId });
        return;
      }
      case 'raidPaper': { // 光屁股翻墙/撬锁进有人的有纸房（不逼出）
        if (!p.naked || !st || !st.hasPaper || !st.occ || st.occ === 'dean') return fail('cond');
        if (dist(p, st.doorPt) > (inToilet(p) ? NUM.reach : NUM.actR + 26)) return fail('far');
        const tool = p.items.includes('ladder') ? 'ladder' : p.items.includes('wire') ? 'wire' : null;
        if (!tool) return fail('noitem');
        this._startGuide(p, { type: tool, dur: tool === 'ladder' ? NUM.guide.ladder : NUM.guide.wire, target: tg, raid: true });
        return;
      }
      case 'takeClimbed': { // 翻入后取纸（0.5s），不占坑
        if (p.climbed < 0 || p.climbed !== tg.idx || !st || !st.hasPaper) return fail('cond');
        this._startGuide(p, { type: 'takePaper', dur: NUM.guide.takePaper, target: tg, occId: st.occId, climbed: true });
        return;
      }
      case 'climbOut': { // 沿原路爬出（0.8s），完成采样后干净收场
        if (p.climbed < 0 || p.climbed !== tg.idx) return fail('cond');
        this._startGuide(p, { type: 'climbOut', dur: NUM.guide.climbOut, target: tg });
        return;
      }
      case 'wash': {
        if (!p.naked) return fail('cond');
        if (dist(p, SINK) > (inToilet(p) ? NUM.reach : NUM.actR + 26)) return fail('far');
        this._startGuide(p, { type: 'wash', dur: NUM.guide.wash, target: { kind: 'sink' } });
        return;
      }
    }
  }

  /* ---- 段②：结算 ---- */
  _resolve(p, g, st) {
    p.charging = null;
    switch (g.type) {
      case 'enterStall': {
        if (!st || st.occ || st.obstacle || st.lockBy >= 0 && st.lockBy !== p.id && this.t < st.lockUntil) return this._ev('intentFail', { pid: p.id, why: 'occupied', act: g.type });
        st.occ = p; st.occKind = 'player'; st.occId++; st.harass = 0; this.clearFake(st); p.atStall = st.idx;
        p.x = st.inPt.x; p.y = st.inPt.y;
        this._startRelief(p, 'poop');
        this._ev('enterStall', { pid: p.id, idx: st.idx }); return;
      }
      case 'poke': case 'bonk': {
        this._consume(p, g.type === 'poke' ? 'broom' : 'plunger');
        this._addHarass(st, 1, p.id, g.type); return;
      }
      case 'knock': {
        this._addHarass(st, 1, p.id, 'knock'); return;
      }
      case 'wire': case 'ladder': {
        this._consume(p, g.type); // 引导完成即耗（推门期取消不退）
        g.push = true; g.pushUntil = this.t + NUM.guide.push; p.charging = g; // 进入推门期
        this._ev('pushStart', { pid: p.id, type: g.type, idx: g.target.idx });
        return;
      }
      case 'sniff': {
        p.sniffLeft--;
        const truth = st.occ === 'dean' ? 'dean' : st.occ ? 'player' : 'none';
        const errP = p.items.includes('mask') ? NUM.sniff.errMask : NUM.sniff.errBare;
        let show = truth;
        if (this.rng() < errP) {
          if (truth === 'dean') show = 'player';           // 方向加权：主任绝不误报"无人"
          else if (truth === 'player') show = this.rng() < 0.5 ? 'dean' : 'none';
          else show = 'player';
        }
        this._ev('sniffResult', { pid: p.id, idx: st.idx, show, truthIsPlayer: truth === 'player' });
        // 传染（真实目标为准）
        if (truth === 'player' && !p.items.includes('mask') && this.rng() < NUM.sniff.infect) {
          const v = st.occ; const loss = (100 - v.endurance) * NUM.sniff.rate;
          p.endurance -= loss; this._ev('infect', { pid: p.id, vid: v.id, loss });
          if (p.endurance <= 0) this._finalize(p, 'blowout');
        }
        return;
      }
      case 'paper': {
        const occ = st.occ; if (!occ || occ === 'dean' || !occ.post) { this._ev('intentFail', { pid: p.id, why: 'target', act: 'paper' }); return; }
        this._consume(p, 'paper');
        occ.post = null; this._finalize(occ, 'done');
        if (!p.final) p.endurance = Math.min(100, p.endurance + 10); // 人情回血
        this._ev('paperDone', { pid: p.id, vid: occ.id }); return;
      }
      case 'takePaper': {
        if (!st || !st.hasPaper || st.obstacle || (!g.climbed && st.occ)) { this._ev('intentFail', { pid: p.id, why: 'target', act: 'takePaper' }); return; }
        st.hasPaper = false;
        if (g.climbed) { this._ev('paperGot', { pid: p.id, idx: st.idx }); p.hasClimbedPaper = true; return; } // 翻入取纸：等爬出才定型
        this.clearFake(st);
        this._cleanFinish(p, 'paper'); return;
      }
      case 'climbOut': {
        if (p.climbed !== g.target.idx || !p.hasClimbedPaper) { this._ev('intentFail', { pid: p.id, why: 'target', act: 'climbOut' }); return; }
        p.climbed = -1; p.hasClimbedPaper = false;
        this._ev('climbOut', { pid: p.id, idx: g.target.idx });
        this._cleanFinish(p, 'paper'); return; // 0 惩罚干净完成
      }
      case 'wash': { this._cleanFinish(p, 'wash', NUM.post.washPenalty); return; }
      case 'clear': {
        const kind = g.clearKind; if (kind === 'plunger') this._consume(p, 'plunger'); else this._consume(p, 'broom');
        st.obstacle = null; this.clearFake(st);
        if (kind === 'broom' && this.rng() < NUM.splash.broom) { p.endurance -= NUM.splash.dmg; this._ev('splash', { pid: p.id }); if (p.endurance <= 0) this._finalize(p, 'blowout'); }
        this._ev('cleared', { pid: p.id, idx: st.idx, kind }); this._noise(st.doorPt.x, st.doorPt.y, 'clear'); return;
      }
    }
  }
  _resolvePush(p, g, st) {
    p.charging = null;
    if (st.occ === 'dean') { this._ev('caught', { pid: p.id }); this._finalize(p, 'dead'); return; }
    if (g.raid) { // 裁决#19：光屁股「翻墙取纸」——不骚扰、不逼出、不改变占用
      if (st.occ && st.hasPaper && p.naked) { p.climbed = st.idx; this._ev('climbIn', { pid: p.id, idx: st.idx }); return; }
      this._ev('raidFail', { pid: p.id, idx: st.idx }); return;
    }
    if (st.occ && st.occ !== 'dean') { this._addHarass(st, 3, p.id, g.type); return; } // 普通进入类 = 骚扰+3
    this._ev('pushEmpty', { pid: p.id, idx: g.target.idx });
  }
  _startRelief(p, kind) {
    let total = NUM.relief.poop;
    if (kind === 'poop' && p.items.includes('comic')) total -= NUM.comicSave;
    p.state = 'relief'; p.relief = { kind, total, left: total };
    this._ev('reliefStart', { pid: p.id, kind });
  }
  _addHarass(st, add, byPid, srcType) {
    const occ = st.occ;
    if (occ && occ !== 'dean' && this.t < occ.immuneUntil) { this._ev('immune', { idx: st.idx }); return; }
    if (st.harass <= 0) st.c_first = { pid: byPid }; // 记录本轮首个贡献者（C3 优先锁归属）
    st.harass += add; st.lastH = this.t;
    this._ev('harass', { idx: st.idx, by: byPid, val: st.harass, src: srcType });
    this._noise(st.doorPt.x, st.doorPt.y, 'harass');
    // 主任激怒（隔门类：poke/bonk/knock；厕所内；主任在场）
    if (this.dean.active && ['poke', 'bonk', 'knock'].includes(srcType) && this.rng() < NUM.dean.anger) {
      const p = this.players[byPid];
      // 惩罚：没收一件武器 + 弹出厕所 + 忍耐-20
      const w = p.items.find(i => WEAPONS.has(i));
      if (w !== undefined) { p.items = p.items.filter(i => i !== w); delete (p._charges || (p._charges = {}))[w]; }
      p.endurance -= 20; p.staggerUntil = this.t + NUM.prot.staggerL;
      p.x = 1040; p.y = 320; p.charging = null;
      // 主任离场
      const dst = this.stalls[this.dean.stall]; if (dst && dst.occ === 'dean') { dst.occ = null; dst.occKind = null; dst.occId++; dst.harass = 0; this.clearFake(dst); }
      this.dean.active = false; this.dean.stall = -1;
      this._ev('deanAnger', { pid: byPid });
      if (p.endurance <= 0) this._finalize(p, 'blowout');
      return;
    }
    if (st.harass >= NUM.harass.need) this._evict(st, byPid);
  }
  _evict(st, byPid) {
    const occ = st.occ; if (!occ || occ === 'dean') { st.harass = 0; return; }
    // 进度 -50%、硬直、流失增、免疫、释放、优先锁（骚扰溢出仅一次逼出，余量清零）
    if (occ.relief) { const prog = occ.relief.total - occ.relief.left; occ.relief.left = occ.relief.total - Math.floor(prog / 2); }
    occ.staggerUntil = this.t + NUM.prot.staggerL;
    occ.drainBuffUntil = this.t + NUM.prot.evictDrain;
    occ.immuneUntil = this.t + NUM.prot.evictImmune;
    occ.x = st.doorPt.x; occ.y = st.doorPt.y - 8; occ.atStall = -1; occ.state = 'idle'; occ.post = null;
    st.occ = null; st.occKind = null; st.occId++; st.harass = 0; this.clearFake(st);
    st.lockBy = (st.c_first && st.c_first.pid) ?? byPid; st.c_first = null; // 优先锁给先启动者（C3）
    st.lockUntil = this.t + NUM.prot.lock;
    this._ev('evict', { idx: st.idx, by: byPid, vid: occ.id });
    this._noise(st.doorPt.x, st.doorPt.y, 'evict');
  }
  _noise(x, y, kind, mapId = 2) { this._ev('noise', { x, y, kind, mapId }); } // mapId 默认厕所图（其内部声源）
}

/* ================= 移动（浏览器/AI 共用） ================= */
function movePlayer(p, vx, vy, dt) {
  if (p.final || p.atStall >= 0 || p.charging && !p.charging.push && ['wire', 'ladder'].includes(p.charging.type)) return;
  if (p.charging) return; // 引导中不可移动（取消才行）
  if (p.staggerUntil > 0 && p._simT < p.staggerUntil) return;
  let sp = NUM.speed[p.moveMode] || NUM.speed.walk;
  if (p.naked) sp *= NUM.post.nakedMult; // 光屁股夹着走
  if (p.endurance < 30) sp *= 0.85; // 夹腿
  let nx = p.x + vx * sp * dt, ny = p.y + vy * sp * dt;
  if (p._sim && p._sim.phase === 'prep' && p.mapId === 0) nx = Math.min(nx, 1690); // 铃前老师堵门
  if (walkable(p.mapId, nx, p.y)) p.x = nx;
  if (walkable(p.mapId, p.x, ny)) p.y = ny;
  if (vx !== 0) p.dir = vx > 0 ? 1 : -1;
  // 连接口触发区检测（每帧，Sim 侧事务在 _timers 兜底同 tick 执行）
  if (p._sim && !p.final) p._sim.touchConnections(p);
}

/* ================= AI（只使用 L0/L1/L2 信息） ================= */
class Bot {
  constructor(sim, pid) { this.sim = sim; this.p = sim.players[pid]; this.wps = null; this.wi = 0; this.nextThink = 0; this.role = null; this.sniffInfo = {}; this.fetch = false; }
  think(tick) {
    const sim = this.sim, p = this.p;
    if (sim.phase !== 'run' || p.final || tick < this.nextThink) return;
    this.nextThink = tick + 10;
    if (!this.role) {
      this.role = p.debuff === 'poo' ? (sim.rng() < 0.7 ? 'A' : 'F') : (sim.rng() < 0.25 ? 'B' : 'F');
      this.wps = ROUTES[this.role === 'A' ? 'A' : this.role === 'B' ? 'B' : 'fast'].slice(); this.wi = 0;
    }
    // 顺路捡道具
    for (const it of sim.items) {
      if (it.taken || dist(p, it) > NUM.pickR - 2) continue;
      if (p.items.length >= 2) break;
      const want = (p.debuff === 'poo' && (it.kind === 'comic' || it.kind === 'paper')) ||
        (WEAPONS.has(it.kind) && !p.items.some(i => WEAPONS.has(i)) && (it.kind !== 'ladder' && it.kind !== 'wire' || sim.rng() < 0.6)) ||
        it.kind === 'mask' || it.kind === 'soda' || it.kind === 'poster';
      if (want) { sim.queue(p.id, 'pick', { id: it.id }); break; }
    }
    if (p.state === 'relief') {
      if (p.debuff === 'poo' && p.turboLeft > 0 && (p.relief.left > s(5) || p.endurance < 45)) sim.queue(p.id, 'turbo');
      return;
    }
    if (p.state === 'post' || p.naked) {
      if (p.state === 'post') { sim.queue(p.id, 'nakedOut'); return; } // 先光屁股出门
      if (p.climbed >= 0) { // 已翻入：取纸 → 爬出
        if (!p.hasClimbedPaper) sim.queue(p.id, 'takeClimbed', { idx: p.climbed });
        else sim.queue(p.id, 'climbOut', { idx: p.climbed });
        return;
      }
      const paperRoom = sim.stalls.find(st2 => st2.hasPaper && !st2.occ && !st2.obstacle);
      const raidRoom = sim.stalls.find(st2 => st2.hasPaper && st2.occ && st2.occ !== 'dean' && !st2.obstacle);
      const target = paperRoom || ((p.items.includes('ladder') || p.items.includes('wire')) ? raidRoom : null);
      if (target) {
        if (dist(p, target.doorPt) <= NUM.reach - 8) {
          if (target === paperRoom) sim.queue(p.id, 'takePaper', { idx: target.idx });
          else sim.queue(p.id, 'raidPaper', { idx: target.idx });
        } else { const ax = target.doorPt.x - p.x, ay = target.doorPt.y - p.y, ad = Math.hypot(ax, ay) || 1; movePlayer(p, ax / ad, ay / ad, (10 / TICK)); }
        return;
      }
      if (dist(p, SINK) <= NUM.reach - 8) { sim.queue(p.id, 'wash'); return; }
      const ax = SINK.x - p.x, ay = SINK.y - p.y, ad = Math.hypot(ax, ay) || 1;
      movePlayer(p, ax / ad, ay / ad, (10 / TICK));
      return;
    }
    // 在厕所：找位置/行动
    if (p.mapId === 2 && !p.items.includes('plunger') && this.sim.stalls.every(st2 => st2.obstacle === 'berry' || st2.occ || st2.obstacle && !p.items.includes('plunger')) && this.sim.stalls.some(st2 => st2.obstacle)) {
      const plungerLeft = this.sim.items.some(it => !it.taken && it.kind === 'plunger');
      if (plungerLeft && !this.sim.players.some(q => !q.final && q.items.includes('plunger'))) this.fetch = true;
    }
    if (this.fetch && !p.items.includes('plunger')) {
      const target = p.mapId === 2 ? { x: 100, y: 600 } : (this.sim.items.find(it => !it.taken && it.kind === 'plunger') || { x: 1300, y: 410 });
      if (p.mapId === 1 && dist(p, target) <= NUM.pickR + 10) { sim.queue(p.id, 'pick', { id: this.sim.items.find(it => !it.taken && it.kind === 'plunger').id }); return; }
      if (p.mapId === 1 && p.items.includes('plunger')) { this.fetch = false; }
      const ax2 = target.x - p.x, ay2 = target.y - p.y, ad2 = Math.hypot(ax2, ay2) || 1;
      movePlayer(p, ax2 / ad2, ay2 / ad2, (10 / TICK));
      return;
    }
    if (this.fetch && p.items.includes('plunger') && p.mapId === 1) { /* 已取得，继续赶路去厕所 */ this.fetch = false; }
    if (inToilet(p)) {
      if (p.charging) return;
      // 顺手贴假指示（低频，骗后进厕所的人）
      if (p.items.includes('poster') && sim.rng() < 0.08) { const st = sim.stalls[(sim.rng() * sim.stalls.length) | 0]; if (st) { sim.queue(p.id, 'poster', { idx: st.idx }); return; } }
      // 候选空房（含可清障房）：按距离排序，够近才交互，不够近就走过去
      const cand = [];
      for (const st of sim.stalls) {
        if (st.occ) continue;
        if (st.obstacle && !(p.items.includes('plunger') || (st.obstacle === 'anaconda' && p.items.includes('broom')))) continue;
        if (st.lockBy >= 0 && st.lockBy !== p.id && sim.t < st.lockUntil) continue;
        cand.push({ st, d: dist(p, st.doorPt) });
      }
      cand.sort((a, b) => a.d - b.d);
      const near = cand[0];
      if (near && near.d <= NUM.reach - 8) {
        sim.queue(p.id, near.st.obstacle ? 'clear' : 'enterStall', { idx: near.st.idx }); return;
      }
      // 红门（有人）：只挑够近的
      const reds = sim.stalls.filter(st => st.occ && st.idx !== this._myStall()).map(st => ({ st, d: dist(p, st.doorPt) })).sort((a, b) => a.d - b.d);
      const red = reds[0] && reds[0].d <= NUM.reach - 8 ? reds[0].st : null;
      if (red) {
        const known = this.sniffInfo[red.idx];
        if (!known && p.sniffLeft > 0 && sim.rng() < 0.5) { sim.queue(p.id, 'sniff', { idx: red.idx }); return; }
        const info = known || { show: 'player' };
        if (info.show !== 'dean' && sim.t >= (p.cds['knock'] || 0)) {
          if (p.items.includes('broom') && sim.t >= (p.cds[`poke${red.idx}`] || 0)) sim.queue(p.id, 'poke', { idx: red.idx });
          else if (p.items.includes('plunger')) sim.queue(p.id, 'bonk', { idx: red.idx });
          else sim.queue(p.id, 'knock', { idx: red.idx });
          return;
        }
      }
      // 递纸（听到喊声且够近）
      if (sim.lastShout && sim.t < sim.lastShout.until && p.items.includes('paper')) {
        const st = sim.stalls[sim.lastShout.stall];
        if (st && st.occ && st.occ.post && dist(p, st.doorPt) <= NUM.reach - 8) { sim.queue(p.id, 'paper', { idx: st.idx }); return; }
      }
      // 互殴（裁决#20）：走廊/厕所里 2m 内有敌人且 CD 好 → 出拳
      if (this.t >= p.beatCdUntil && p.state === 'idle' && !p.naked) {
        const foe = sim.players.find(q => q.id !== p.id && !q.final && q.mapId === p.mapId && q.atStall < 0 && dist(p, q) <= NUM.punch.range - 4);
        if (foe && sim.rng() < 0.12) { sim.queue(p.id, 'punch', { id: foe.id }); return; }
      }
      // 没有够近的目标 → 朝最近的空房门移动（全速，每 0.5s 一次 think）
      const goal = near ? near.st.doorPt : reds.length ? reds[0].st.doorPt : { x: 1250, y: 320 };
      const ax = goal.x - p.x, ay = goal.y - p.y, ad = Math.hypot(ax, ay) || 1;
      if (ad > 12) movePlayer(p, ax / ad, ay / ad, (10 / TICK));
      return;
    }
    // 赶路（含"最后一段进厕所"）：所有路径的终点都在厕所内部，wi 走完后继续补位到门内安全点
    // ── 三图分段赶路（MAP-INTERACTION §5）──
    let goal = null;
    if (p.mapId === 0) goal = { x: 1725, y: 530 };                       // 教室出口触发区
    else if (p.mapId === 1) {
      goal = (this.wps && this.wi < this.wps.length) ? this.wps[this.wi] : { x: 2325, y: 610 }; // 走完路径→东井厕所门触发区
    } else if (p.mapId === 2) goal = null;                              // 厕所内逻辑已在前分支
    if (goal) {
      if (dist(p, goal) < 16) {
        if (p.mapId === 1 && this.wps && this.wi < this.wps.length) { this.wi++; return; }
      }
      const dx = goal.x - p.x, dy = goal.y - p.y, d = Math.hypot(dx, dy) || 1;
      movePlayer(p, dx / d, dy / d, (10 / TICK));
    }
  }
  _myStall() { return this.p.atStall; }
  onSniffResult(ev) { if (ev.pid === this.p.id) this.sniffInfo[ev.idx] = { show: ev.show }; }
}


/* 界面文案统一中文；本地化另立项 */
/* ================= 浏览器端（渲染/输入/音频） ================= */
let PFX = null; // pixelfx bundle（真实像素特效），异步加载；失败时降级
if (typeof window !== 'undefined') {
  import('./pixelfx-bundle.js').then(m => { PFX = m; }).catch(() => { PFX = null; });
}
if (typeof window !== 'undefined') (function () {
  const qs = new URLSearchParams(location.search);
  const seed = qs.has('seed') ? (parseInt(qs.get('seed')) >>> 0) : (Date.now() & 0x7fffffff);
  const sim = new Sim(seed); const bots = sim.players.filter(p => p.bot).map(p => new Bot(sim, p.id));
  const you = sim.players[0];
  you.bot = false; bots.forEach(b => b.p.bot = true);
  // 强制你为随机 debuff（已在分配中）

  const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  const fx = []; const floats = []; const onomats = [];
  let audioOn = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? false : true;

  // ── pixelfx 真实特效池（画布上的一次成像，非几何占位）──
  const pfxCache = document.createElement('canvas'); // 离屏 frame
  const pfxItems = []; // {mod, opts, x, y, t, dur, fm, scale}
  function spawnPfx(mod, x, y, opts = {}, fm = you.mapId, scale = 1.5) {
    if (!PFX || !mod || !mod.meta) return false;
    const W = Math.ceil(mod.meta.size[0] * scale), H = Math.ceil(mod.meta.size[1] * scale);
    pfxItems.push({ mod, opts: { ...opts, x: Math.round(mod.meta.size[0] / 2), y: Math.round(mod.meta.size[1] / 2), seed: (sim.t * 7 + pfxItems.length) | 0 }, x, y, fm, W, H, scale, t: 0, dur: mod.meta.duration, frame: PFX.createFrame(mod.meta.size[0], mod.meta.size[1]), img: null, cv: document.createElement('canvas') });
    return true;
  }
  function drawPfx(dt) {
    if (!PFX) return;
    for (let i = pfxItems.length - 1; i >= 0; i--) {
      const it = pfxItems[i]; it.t += dt;
      if (it.fm !== you.mapId) continue; // 跨图零可见
      if (it.t >= it.dur) { pfxItems.splice(i, 1); continue; }
      const inst = PFX.createFx(it.mod, it.opts);
      inst.update(it.t);
      PFX.clearFrame(it.frame);
      inst.draw(it.frame, 'back'); inst.draw(it.frame, 'front');
      if (!it.img) {
        it.cv.width = it.mod.meta.size[0]; it.cv.height = it.mod.meta.size[1];
        it.img = it.cv.getContext('2d').createImageData(it.cv.width, it.cv.height);
      }
      PFX.composite(it.frame, it.img.data, null);
      it.cv.getContext('2d').putImageData(it.img, 0, 0);
      ctx.drawImage(it.cv, Math.round(it.x - it.W / 2), Math.round(it.y - it.H / 2), it.W, it.H);
    }
  }
  function addFx(x, y, kind, color, n = 14) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 80; fx.push({ fm: curMapFx, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.5, kind, color, rot: Math.random() * 6 }); } }
  function banner(txt, cls = '', dur = 2.4) {
    const host = document.getElementById('banners'); if (!host) return;
    const d = document.createElement('div'); d.className = 'banner ' + cls; d.textContent = txt;
    host.appendChild(d); setTimeout(() => d.remove(), dur * 1000);
  }
  function float(x, y, txt, color = '#fff') { floats.push({ fm: curMapFx, x, y, txt, color, life: 1.6 }); }
  function onomat(x, y, txt, color = PAL.onomat) { onomats.push({ fm: curMapFx, x, y, txt, color, life: 0.85, t: 0 }); } // 3px 黑描边拟声字，弹入+定格

  /* ---- 音效（WebAudio 合成） ---- */
  let AC = null;
  function beep(freq, dur, type = 'square', vol = 0.08) {
    if (!audioOn) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(AC.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
      o.stop(AC.currentTime + dur + 0.02);
    } catch (e) { }
  }
  const SND = {
    bell: () => { beep(880, .35, 'square', .1); setTimeout(() => beep(1320, .4, 'square', .1), 180); },
    deanIn: () => { beep(140, .5, 'sawtooth', .12); setTimeout(() => beep(110, .6, 'sawtooth', .12), 250); },
    deanOut: () => beep(660, .3, 'sine', .08),
    evict: () => { beep(180, .2, 'sawtooth', .1); setTimeout(() => beep(90, .3, 'sawtooth', .1), 120); },
    blowout: () => { beep(200, .6, 'sawtooth', .14); setTimeout(() => beep(120, .7, 'sawtooth', .12), 200); },
    done: () => { beep(784, .15, 'sine', .1); setTimeout(() => beep(1046, .25, 'sine', .1), 140); },
    caught: () => { beep(440, .2, 'square', .12); setTimeout(() => beep(233, .6, 'square', .12), 200); },
    pick: () => beep(1200, .08, 'sine', .07),
    noise: () => beep(300 + Math.random() * 200, .06, 'triangle', .04),
    anger: () => { beep(160, .4, 'sawtooth', .13); },
  };

  /* ---- 事件表现 ---- */
  const seenTips = {};
  function ev0Tick() { return sim.t <= 2; }
  function tipOnce(key, zh, cls, dur) { if (seenTips[key]) return; seenTips[key] = 1; banner(zh, cls || 'ok', dur || 3.2); }
  function uiSkill(k, extra) { if (window.UI) window.UI.skill(k, extra); }
  function consumeEvents() {
    curMapFx = you.mapId; // 切图首帧即按新图给特效打标
    if (sim.phase === 'prep' && ev0Tick()) tipOnce('start', '💡 铃前可在教室自由走动，出不去门。先熟悉按键！', 'big', 4.5);
    for (const ev of sim.events) {
      const p = sim.players[ev.pid] || null;
      if (ev.type === 'uiSkill' && ev.pid === 0) uiSkill(ev.key);
      if (ev.type === 'switchMap' && ev.to === 2 && ev.pid === 0) tipOnce('toilet', '💡 5 间隔间：绿灯空房可进，红灯要闯；卷纸挂墙是明牌', 'warn', 4.2);
      if (ev.type === 'postStuck' && ev.pid === 0) tipOnce('post', '💡 没纸？光屁股出门去别间取纸，或洗手台优雅结束(+5s)', 'warn', 4.2);
      if (ev.type === 'punchHit' && ev.vid === 0) tipOnce('punched', '💡 挨揍 8 次会被打出屎！P 键还手，击退不硬直', 'danger', 3.8);
      if (ev.type === 'bell' && ev.kind === 'pre') tipOnce('prebell', '💡 预备铃：全员忍耐流失 ×1.5，别再闲逛了', 'warn', 3.2);
      switch (ev.type) {
        case 'bell':
          if (ev.kind === 'start') { banner('叮铃铃——下课！', 'big', 2); SND.bell(); }
          if (ev.kind === 'pre') { banner('上课预备铃！忍耐流失 ×1.5', 'warn', 2.5); SND.bell(); }
          if (ev.kind === 'soft') { banner('上课铃倒计时！流失 ×2', 'danger', 3); SND.bell(); }
          break;
        case 'deanIn': uiSkill('dean'); banner('！！主任来了！！', 'danger', 2.6); SND.deanIn(); if (PFX) spawnPfx(PFX.exclamation, 550, 300, { palette: ['#1a0e14', '#7f1d1d', '#dc2626', '#fca5a5', '#fff7ed'] }); break;
        case 'deanOut': banner('主任哼着歌走了~', 'ok', 2); SND.deanOut(); break;
        case 'deanAnger': banner(`${(sim.players[ev.pid] || {}).name || '?'} 被主任没收道具轰出厕所！`, 'warn', 2.5); addFx(1150, 320, 'smoke', '#b91c1c', 22); SND.anger(); break;
        case 'harass': { const st = sim.stalls[ev.idx]; if (PFX) spawnPfx(PFX.hitSpark, st.doorPt.x, st.doorPt.y - 10, {}, 2, 0.8); float(st.doorPt.x - 20, st.doorPt.y - 14, `骚扰 ${ev.val}/3`, '#fdba74'); SND.noise(); break; }
        case 'evict': { const st = sim.stalls[ev.idx]; if (PFX) spawnPfx(PFX.groundSlam, st.doorPt.x, st.doorPt.y + 30, {}, 2, 1.1); addFx(st.doorPt.x, st.doorPt.y - 20, 'launch', '#f97316', 20); float(st.doorPt.x, st.doorPt.y - 40, '被逼出来了！', '#fb923c'); SND.evict(); break; }
        case 'final':
          if (ev.kind === 'blowout' && PFX) spawnPfx(PFX.cartoonPow, p.x, p.y, { text: '炸裆！', palette: ['#1a0e14', '#6e1a12', '#8d5a3a', '#c8361a', '#f47a24', '#ffc23c', '#fff07a', '#ffffff'] }, p.mapId, 1.8);
          if (ev.kind === 'done' && PFX) spawnPfx(PFX.confetti, p.x, p.y - 30, {}, p.mapId, 1.2);
          if (ev.kind === 'done') { addFx(p.x, p.y, 'confetti', '#4ade80', 24); float(p.x, p.y - 30, `${p.name} 完成！${ev.time.toFixed(1)}s`, '#86efac'); SND.done(); }
          if (ev.kind === 'blowout') { addFx(p.x, p.y, 'smoke', '#9ca3af', 30); float(p.x, p.y - 30, `${p.name} 炸裆！`, '#f87171'); SND.blowout(); }
          if (ev.kind === 'dead') { addFx(p.x, p.y, 'smoke', '#7f1d1d', 26); float(p.x, p.y - 30, `${p.name} 被主任抓获！`, '#fca5a5'); SND.caught(); }
          break;
        case 'sniffResult': { const st = sim.stalls[ev.idx]; const m = { none: '没味儿~', player: '有人！(玩家)', dean: '主任？！' }; float(st.doorPt.x - 24, st.doorPt.y - 30, `👃${m[ev.show]}`, '#a5f3fc'); beep(520, .12, 'sine', .06); break; }
        case 'infect': float(p.x, p.y - 40, `被传染 -${ev.loss.toFixed(0)}`, '#a3e635'); break;
        case 'caught': banner('你被主任当场抓获……判负！', 'danger', 3); break;
        case 'postStuck': if (ev.pid === 0) showPostUI(true); float(p.x, p.y - 30, '没纸了！！光屁股出门找纸/洗手', '#fbbf24'); break;
        case 'nakedOut': { uiSkill('naked'); if (ev.pid === 0) showPostUI(false); float(p.x, p.y - 30, '光着屁股出来了！', '#f472b6'); addFx(p.x, p.y, 'smoke', '#fbcfe8', 10); banner('10s 内：去有纸隔间取纸 / 洗手台优雅结束', 'warn', 2.4); break; }
        case 'paperGot': { uiSkill('takePaper'); float(p.x, p.y - 30, '取到纸！', '#86efac'); if (!p.hasClimbedPaper) banner('体面人！', 'ok', 1.6); break; }
        case 'climbIn': { uiSkill('raid'); const st = sim.stalls[ev.idx]; float(st.doorPt.x, st.doorPt.y - 30, '翻进去了！别惊动里面', '#c084fc'); banner('梯子架好 → 取纸 → 原路爬出', 'warn', 2); break; }
        case 'climbOut': { uiSkill('climbOut'); float(p.x, p.y - 30, '爬出来！干净完成', '#86efac'); banner('神不知鬼不觉', 'ok', 1.6); break; }
        case 'raidFail': float(p.x, p.y - 40, '里面没纸/没人了…', '#fca5a5'); break;
        case 'switchMap': if (ev.pid === 0) { cam.x = you.x; cam.y = you.y; banner(`🚪 进入【${MAPS[ev.to].name}】`, 'ok', 1.2); beep(150, .12, 'sine', .07); } break;
        case 'punchHit': { const v = sim.players[ev.vid]; if (PFX) spawnPfx(PFX.cartoonPow, v.x, v.y - 16, { text: '砰！', palette: ['#1a0e14', '#6e1a12', '#c8361a', '#f47a24', '#ffc23c', '#fff07a', '#ffffff'] }, v.mapId, 0.9); float(v.x, v.y - 26, `砰！(揍${ev.beaten}/8)`, '#fdba74'); onomat(v.x, v.y - 44, '砰！', PAL.onomat); addFx(v.x, v.y, 'ripple', '#fdba74', 6); beep(180, .08, 'square', .09); break; }
        case 'punchMiss': float(p.x, p.y - 30, '挥空了…', '#d1d5db'); break;
        case 'beatenOut': if (PFX) spawnPfx(PFX.cartoonPow, p.x, p.y, { text: '被打出屎！', palette: ['#1a0e14', '#6e1a12', '#c8361a', '#f47a24', '#ffc23c', '#fff07a', '#ffffff'] }, p.mapId, 1.6); banner(`${(sim.players[ev.pid]||{}).name}${' 被打出屎了！！'}`, 'danger', 2.8); addFx(p.x, p.y, 'smoke', '#8d5a3a', 26); SND.blowout(); break;
        case 'washDone': { uiSkill('wash'); float(p.x, p.y - 30, '洗手！优雅结束(+5s)', '#a5f3fc'); banner('讲卫生 · 优雅结束', 'ok', 1.8); break; }
        case 'shout': float(p.x, p.y - 40, '谁有纸！！', '#fde047'); SND.noise(); break;
        case 'paperDone': uiSkill('paper'); banner(`${p.name} 递纸！人情+`, 'ok', 2); break;
        case 'pushStart': banner('推门中……听到动静可取消！(X)', 'warn', 2); beep(90, .3, 'sawtooth', .07); break;
        case 'pushCancel': banner('你缩回了手……保命要紧', 'ok', 1.6); break;
        case 'pushEmpty': float(1150, 400, '门后居然没人', '#ccc'); break;
        case 'turbo': uiSkill('turbo'); float(p.x, p.y - 30, '涡轮增压！！', '#f472b6'); SND.noise(); if (PFX) spawnPfx(PFX.chargeUp, p.x, p.y - 30, {}, 2, 1.2); break;
        case 'cleared': float(sim.stalls[ev.idx].doorPt.x, sim.stalls[ev.idx].doorPt.y - 30, '疏通！', '#a7f3d0'); break;
        case 'splash': float(p.x, p.y - 30, '溅了一身 -5', '#a16207'); break;
        case 'pick': float(p.x, p.y - 24, `+${ITEM_DEFS[ev.kind].name}`, '#e5e7eb'); SND.pick(); break;
        case 'poster': { const st = sim.stalls[ev.idx]; float(st.doorPt.x - 30, st.doorPt.y - 26, ev.shown ? '贴:有人!' : '贴:没人~', '#c084fc'); break; }
        case 'flushFake': { const st = sim.stalls[ev.idx]; if (ev.pid === 0) { const m = { dean: '……门缝是干的（主任？！）', player: '……门缝是干的（有人在骗人？）', none: '冲水声~ 空的' }; float(st.doorPt.x - 40, st.doorPt.y - 36, m[ev.truth], '#a5f3fc'); } break; }
        case 'giveup': float(p.x, p.y - 24, '弃坑…', '#d1d5db'); break;
        case 'intentFail': if (ev.pid === 0 && ev.why && ev.why !== 'busy') { const m = { far: '太远了', occupied: '已被占用', dirty: '堵了，需要工具', lock: '被优先锁占用', cd: '冷却中', noitem: '没有道具', full: '拿不下了(≤2件)', weapon1: '武器只能带1件', used: '用过一次了', cond: '现在不行', target: '目标无效', armor: '对方霸体中' }; float(you.x, you.y - 46, m[ev.why] || ev.why, '#fca5a5'); } break;
        case 'noise': {
          if (dist(you, ev) < 240) {
            const lv = SONAR_LV[ev.kind] || 2;
            addFx(ev.x, ev.y, 'sonar' + lv, PAL.sonar[lv], lv === 4 ? 12 : 6);
            if (ONOMAT[ev.kind]) onomat(ev.x, ev.y - 28, ONOMAT[ev.kind], lv === 4 ? PAL.occRed : PAL.onomat);
          }
          SND.noise(); break;
        }
      }
    }
    sim.events.length = 0;
  }

  /* ---- 输入 ---- */
  const keys = {};
  window.addEventListener('keydown', e => {
    if (e.repeat) return; keys[e.key.toLowerCase()] = true;
    const k = e.key.toLowerCase();
    if (k === 'q') doInteract();
    if (k === 'e') doSkill();
    if (k === 'f') doItem();
    if (k === 'r') doFlushFake();
    if (k === 'p') doPunch();
    if (k === 'x' || k === 'escape') doCancel();
    if (k === '1' && you.state === 'post') sim.queue(0, 'shout');
    if (k === '2' && you.state === 'post') sim.queue(0, 'break');
    if (k === '3' && you.state === 'post') { sim.queue(0, 'nakedOut'); showPostUI(false); }
  });
  window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

  let joy = { on: false, dx: 0, dy: 0 };
  const joyEl = document.getElementById('joy'), knob = document.getElementById('knob');
  function joyStart(e) { joy.on = true; joyMove(e); }
  function joyMove(e) {
    if (!joy.on) return; const t = e.touches ? e.touches[0] : e;
    const r = joyEl.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy), m = r.width / 2;
    if (d > m) { dx = dx / d * m; dy = dy / d * m; }
    joy.dx = dx / m; joy.dy = dy / m;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  }
  function joyEnd() { joy.on = false; joy.dx = joy.dy = 0; knob.style.transform = 'translate(0,0)'; }
  joyEl.addEventListener('touchstart', e => { e.preventDefault(); joyStart(e); }, { passive: false });
  joyEl.addEventListener('touchmove', e => { e.preventDefault(); joyMove(e); }, { passive: false });
  joyEl.addEventListener('touchend', joyEnd); joyEl.addEventListener('touchcancel', joyEnd);
  joyEl.addEventListener('mousedown', joyStart); window.addEventListener('mousemove', joyMove); window.addEventListener('mouseup', joyEnd);
  // touch 按钮：touchend 触发（点按=松开时执行，符合手游手感），并阻止 300ms click 延迟与滚动
  const bindTap = (id, fn) => {
    const el = document.getElementById(id);
    let fired = false;
    el.addEventListener('touchend', e => { e.preventDefault(); fired = true; fn(); }, { passive: false });
    el.addEventListener('click', e => { if (fired) { fired = false; e.preventDefault(); return; } fn(); });
  };
  bindTap('btnQ', doInteract);
  bindTap('btnE', doSkill);
  bindTap('btnF', doItem);
  bindTap('btnX', doCancel);
  bindTap('btnRun', () => cycleMode());
  bindTap('btnR', doFlushFake);
  bindTap('btnP', doPunch);
  function cycleMode() {
    const order = ['walk', 'run', 'sneak']; const m = { 走: 'run', 跑: 'sneak', 潜: 'walk' };
    const el = document.getElementById('btnRun');
    const next = m[el.textContent] || 'run'; el.textContent = { walk: '走', run: '跑', sneak: '潜' }[next];
    sim.queue(0, 'move', { mode: next });
  }

  function doCancel() {
    if (you.charging) { sim.cancel(0); }
    else if (you.state === 'relief' || you.state === 'post') sim.queue(0, 'giveup');
  }
  function doItem() {
    if (you.items.includes('soda')) { sim.queue(0, 'soda'); return; }
    if (you.items.includes('poster')) {
      let best = null, bd = 1e9;
      for (const st of sim.stalls) { const d = dist(you, st.doorPt); if (d < bd) { bd = d; best = st; } }
      if (best && bd <= NUM.reach) sim.queue(0, 'poster', { idx: best.idx });
      else float(you.x, you.y - 40, '靠近隔间门再贴', '#fca5a5');
      return;
    }
    float(you.x, you.y - 40, '没有可用消耗道具', '#d1d5db');
  }
  function doPunch() {
    if (you.final || you.state !== 'idle' || you.charging) return;
    let best = null, bd = 1e9;
    for (const q of sim.players) { if (q.id === 0 || q.final || q.mapId !== you.mapId) continue; const d = dist(you, q); if (d < bd) { bd = d; best = q; } }
    if (best && bd <= NUM.punch.range) sim.queue(0, 'punch', { id: best.id });
    else float(you.x, you.y - 40, '敌人不在拳程内(P)', '#fca5a5');
  }
  function doNakedInteract() {
    if (you.climbed >= 0) {
      if (!you.hasClimbedPaper) sim.queue(0, 'takeClimbed', { idx: you.climbed });
      else sim.queue(0, 'climbOut', { idx: you.climbed });
      return;
    }
    let best = null, bd = 1e9;
    for (const st of sim.stalls) if (st.hasPaper && !st.occ && !st.obstacle) { const d = dist(you, st.doorPt); if (d < bd) { bd = d; best = st; } }
    if (best && bd <= NUM.reach) { sim.queue(0, 'takePaper', { idx: best.idx }); return; }
    // 有人的有纸房：持梯子/铁丝直接翻入取纸（裁决#19：不骚扰不逼出）
    const raid = sim.stalls.find(st => st.hasPaper && st.occ && st.occ !== 'dean' && !st.obstacle && dist(you, st.doorPt) <= NUM.reach);
    if (raid && (you.items.includes('ladder') || you.items.includes('wire'))) { sim.queue(0, 'raidPaper', { idx: raid.idx }); return; }
    if (dist(you, SINK) <= NUM.reach) { sim.queue(0, 'wash'); return; }
    float(you.x, you.y - 40, '找有纸隔间(空房直接进/有人需梯子或铁丝)或洗手台', '#fca5a5');
  }
  function doFlushFake() {
    if (you.naked) { doNakedInteract(); return; }
    let best = null, bd = 1e9;
    for (const st of sim.stalls) { const d = dist(you, st.doorPt); if (d < bd) { bd = d; best = st; } }
    if (best && bd <= NUM.reach) sim.queue(0, 'flushFake', { idx: best.idx });
    else float(you.x, you.y - 40, '靠近隔间门', '#fca5a5');
  }
  function doSkill() {
    if (you.state === 'relief' && you.relief.kind === 'poop') { sim.queue(0, 'turbo'); return; }
    // 嗅闻最近门
    let best = null, bd = 1e9;
    for (const st of sim.stalls) { const d = dist(you, st.doorPt); if (d < bd) { bd = d; best = st; } }
    if (best && bd <= NUM.sniff.range) sim.queue(0, 'sniff', { idx: best.idx });
    else float(you.x, you.y - 40, '要靠近隔间门嗅闻', '#fca5a5');
  }
  function doInteract() {
    if (you.final || you.charging || you.state === 'relief' || you.state === 'post') return;
    if (you.naked) { doNakedInteract(); return; }
    // 有人隔间：红门优先走既定闯入/骚扰流程，绝不"直接进"
    let stNear = null, sd = 1e9;
    for (const s2 of sim.stalls) { const d = dist(you, s2.doorPt); if (d < sd) { sd = d; stNear = s2; } }
    if (stNear && sd <= NUM.reach && stNear.occ && !you.naked) {
      if (stNear.occ !== 'dean' && stNear.occ.post && you.items.includes('paper')) { sim.queue(0, 'paper', { idx: stNear.idx }); return; }
      if (you.items.includes('wire')) sim.queue(0, 'wire', { idx: stNear.idx });
      else if (you.items.includes('ladder')) sim.queue(0, 'ladder', { idx: stNear.idx });
      else if (you.items.includes('broom')) sim.queue(0, 'poke', { idx: stNear.idx });
      else if (you.items.includes('plunger')) sim.queue(0, 'bonk', { idx: stNear.idx });
      else sim.queue(0, 'knock', { idx: stNear.idx });
      return;
    }
    // 拾取
    let best = null, bd = 1e9;
    for (const it of sim.items) { if (it.taken) continue; const d = dist(you, it); if (d < bd) { bd = d; best = it; } }
    if (best && bd <= NUM.pickR) { sim.queue(0, 'pick', { id: best.id }); return; }
    // 隔间
    let st = null; bd = 1e9;
    for (const s2 of sim.stalls) { const d = dist(you, s2.doorPt); if (d < bd) { bd = d; st = s2; } }
    if (st && bd <= NUM.actR + 26) {
      if (st.occ && st.occ !== 'dean' && st.occ.post && you.items.includes('paper')) { sim.queue(0, 'paper', { idx: st.idx }); return; }
      if (!st.occ) {
        if (st.obstacle) { sim.queue(0, 'clear', { idx: st.idx }); return; }
        sim.queue(0, 'enterStall', { idx: st.idx }); return;
      }
      // 红门：按持有武器
      if (you.items.includes('wire')) sim.queue(0, 'wire', { idx: st.idx });
      else if (you.items.includes('ladder')) sim.queue(0, 'ladder', { idx: st.idx });
      else if (you.items.includes('broom')) sim.queue(0, 'poke', { idx: st.idx });
      else if (you.items.includes('plunger')) sim.queue(0, 'bonk', { idx: st.idx });
      else sim.queue(0, 'knock', { idx: st.idx });
      return;
    }
    float(you.x, you.y - 40, '这里没什么可交互的', '#d1d5db');
  }

  /* ---- POST UI ---- */
  const postUI = document.getElementById('postUI');
  function showPostUI(show) { postUI.style.display = show ? 'flex' : 'none'; }
  const bindPost = (id, act) => {
    const el = document.getElementById(id); let fired = false;
    el.addEventListener('touchend', e => { e.preventDefault(); fired = true; sim.queue(0, act); showPostUI(false); }, { passive: false });
    el.addEventListener('click', e => { if (fired) { fired = false; return; } sim.queue(0, act); showPostUI(false); });
  };
  bindPost('btnShout', 'shout');
  bindPost('btnNaked', 'nakedOut');
  bindPost('btnBreak', 'break');

  /* ---- 渲染 ---- */
  const cam = { x: 750, y: 310 };
  let curMapFx = 0; // 特效归属图（创建时打标）
  // 竖屏窄视口：逻辑视口 900×620（角色 1.2× 由 CSS 缩放承担）
  function syncViewport() {
    const portrait = window.innerHeight > window.innerWidth;
    const w = portrait ? 900 : 1500, h = 620;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  window.addEventListener('resize', syncViewport);
  syncViewport();
  let viewMap = 0; // 实际渲染的图（定型观战时跟随对象所在图）
  function drawCam(dtSec) {
    const map = MAPS[you.mapId];
    const vw = cv.width, vh = cv.height;
    // 定型后观战：自动跟随一名存活玩家（单机最小实现；联机版走 follow 协议）
    let spectate = null;
    if (you.final) spectate = sim.players.find(q => !q.final) || null;
    const focus = spectate || you;
    const curMap = spectate ? spectate.mapId : you.mapId;
    const map2 = MAPS[curMap];
    const tx = focus.final ? focus.x : focus.x + focus.dir * 40; // 朝向预偏移 40px
    const ty = focus.y;
    // 80px 死区：玩家在镜头中心 80px 内不推动镜头（防小碎步抖屏）
    const dx = tx - cam.x, dy = ty - cam.y;
    const goalX = Math.abs(dx) > 80 ? tx - Math.sign(dx) * 80 : cam.x;
    const goalY = Math.abs(dy) > 80 ? ty - Math.sign(dy) * 80 : cam.y;
    const k = 1 - Math.pow(0.88, dtSec * 60);
    cam.x += (goalX - cam.x) * k; cam.y += (goalY - cam.y) * k;
    // 视口中心对准的"世界坐标"：图小于视口时让图居中(cam=图中心)；图大于视口时钳制跟随
    cam.x = map.W <= vw ? map.W / 2 : clamp(cam.x, vw / 2, map.W - vw / 2);
    cam.y = map.H <= vh ? map.H / 2 : clamp(cam.y, vh / 2, map.H - vh / 2);
    curMapFx = you.mapId;
    viewMap = curMap; // 观战时渲染被跟随者所在图
  }
  function drawConnZone(c, active) {
    const t = sim.t / TICK;
    ctx.globalAlpha = active ? 0.35 + 0.2 * Math.sin(t * 3) : 0.12;
    ctx.fillStyle = active ? '#38bdf8' : '#64748b';
    ctx.fillRect(c.trig.x, c.trig.y, c.trig.w, c.trig.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = active ? '#38bdf8' : '#475569'; ctx.lineWidth = 2;
    ctx.strokeRect(c.trig.x, c.trig.y, c.trig.w, c.trig.h);
    ctx.fillStyle = PAL.ink; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(c.label + (active ? ' →' : ''), c.trig.x + c.trig.w / 2, c.trig.y - 6);
  }
  function draw(now, dtSec) {
    const A = window.ART; if (!A) return;
    drawCam(dtSec || 0.016);
    const map = MAPS[viewMap];
    const tSec = sim.t / TICK;
    const vw = cv.width, vh = cv.height;
    const l = cam.x - vw / 2, tp = cam.y - vh / 2; // 视口在世界中的 AABB
    const vis = (x, y, pad = 0) => x >= l - pad && x <= l + vw + pad && y >= tp - pad && y <= tp + vh + pad;
    const baseFloor = (THEME0 => THEME0)({ 0: '#E8D8B0', 1: '#D9D2BE', 2: '#BFE3DD' }[viewMap] || '#1a1812');
    ctx.fillStyle = baseFloor; ctx.fillRect(0, 0, vw, vh); // 整图底色（消灭黑边）
    ctx.fillStyle = '#0E0C0A33';
    ctx.save(); ctx.translate(vw / 2 - cam.x, vh / 2 - cam.y);

    // ── 地面：按地图主题逐房间绘制（32px 棋盘砖+墙裙）──
    const THEMES = {
      floorClass: { base: '#E8D8B0', alt: '#DFCFA4', line: '#CBB98C', wall: '#CBB98C', wallEdge: '#8A7F6A' },
      floorFast: { base: '#D9D2BE', alt: '#CFC8B2', line: '#BDB59F', wall: '#BDB59F', wallEdge: '#8A7F6A' },
      floorA: { base: '#F2C078', alt: '#E8B068', line: '#D99A4E', wall: '#D99A4E', wallEdge: '#8A5A3B' },
      floorB: { base: '#A3B18A', alt: '#98A780', line: '#7C9070', wall: '#7C9070', wallEdge: '#5F3A24' },
      toilet: { base: '#BFE3DD', alt: '#B2DAD3', line: '#8FC9C1', wall: '#8FC9C1', wallEdge: '#5F8A83' },
    };
    for (const r of map.rooms) {
      if (r.x + r.w < l - 32 || r.x > l + vw + 32 || r.y + r.h < tp - 32 || r.y > tp + vh + 32) continue; // AABB 相交
      A.floor(ctx, r, THEMES[r.floor || map.floor] || THEMES.floorFast, tSec);
      if (r.label) A.label(ctx, r.label, r.x + r.w / 2, r.y + 28, { size: 14, color: '#FFF7ED' });
    }
    // 场景布景
    if (viewMap === 0) { A.desks(ctx, 200, 520, 8); A.label(ctx, '老师还在拖堂…', 900, 100, { size: 18, color: '#FDE047' }); }
    if (viewMap === 1) { A.lockers(ctx, 400, 168, 5); A.lockers(ctx, 400, 968, 5); A.label(ctx, '← 教室              厕所 →', 750, 92, { size: 15, color: '#FFF7ED' }); }
    if (viewMap === 2) A.tilesWall(ctx, 60, 60, 1680, 30);
    A.label(ctx, '【' + map.name + '】', cam.x, tp + 34, { size: 17, color: '#FDE047' });

    // ── 连接口门牌 ──
    for (const c of CONNECTIONS) if (c.from === viewMap && vis(c.trig.x, c.trig.y, 100)) {
      A.gate(ctx, c, !(c.lock === 'bell' && sim.phase === 'prep') && sim.t >= you.switchCdUntil, tSec);
    }

    // ── 厕所专属设施 ──
    if (viewMap === 2) {
      if (vis(SINK.x, SINK.y, 60)) A.sink(ctx, SINK.x, SINK.y, tSec);
      for (const st of sim.stalls) {
        if (!vis(st.x, st.y, 130)) continue;
        A.door(ctx, st, sim.shownOcc(st), tSec);
      }
    }

    // ── 道具（真实图标，非色点）──
    for (const it of sim.items) {
      if (it.taken || it.mapId !== viewMap || !vis(it.x, it.y, 24)) continue;
      A.item(ctx, it.kind, it.x, it.y, tSec);
      A.label(ctx, ITEM_DEFS[it.kind].name, it.x, it.y + 22, { size: 9, lw: 3 });
    }

    // ── 角色（专属造型/动作/状态）+ 头顶信息条 ──
    for (const p of sim.players) {
      if (p.mapId !== viewMap || !vis(p.x, p.y, 70)) continue;
      ctx.save(); ctx.globalAlpha = p.final ? .38 : 1;
      ctx.translate(p.x, p.y);
      A.character(ctx, p, tSec);
      ctx.restore();
      if (p.final) continue;
      const nm = p.name + (p.endurance < 30 ? '(夹腿)' : '');
      A.label(ctx, nm, p.x, p.y - 40, { size: 11, lw: 4, color: p.id === 0 ? '#FDE047' : '#FFF7ED' });
      // 忍耐条（描边块）
      const bw = 34, e = clamp(p.endurance, 0, 100) / 100;
      A.px(ctx, p.x - bw / 2, p.y - 36, bw, 6, '#00000066');
      A.px(ctx, p.x - bw / 2, p.y - 36, bw * e, 6, e > .5 ? '#4ADE80' : e > .3 ? '#FBBF24' : '#EF4444');
      A.outline(ctx, p.x - bw / 2, p.y - 36, bw, 6, '#1F1A17', 1);
      if (p.beaten > 0) A.label(ctx, `揍${p.beaten}/8`, p.x - 34, p.y - 42, { size: 9, lw: 3, color: '#FB923C' });
      // 状态 chips
      let chip = '';
      if (p.state === 'relief') chip = '排便中 ' + Math.ceil(p.relief.left / TICK) + 's';
      else if (p.state === 'post') chip = '没纸!';
      else if (p.naked) chip = '光屁股 ' + Math.max(0, (p.post.autoAt - sim.t) / TICK).toFixed(0) + 's';
      else if (p.climbed >= 0) chip = p.hasClimbedPaper ? '爬出(Q)' : '取纸(Q)';
      else if (p.charging) chip = p.charging.push ? '推门! X撤' : ({ wire: '撬锁', ladder: '翻墙', poke: '捅门', bonk: '拍晕', knock: '拍门', sniff: '嗅闻', paper: '递纸', clear: '疏通', takePaper: '取纸', climbOut: '爬出', wash: '洗手', punch: '出拳!', enterStall: '进入' }[p.charging.type] || p.charging.type) + '…';
      if (chip) A.bubble(ctx, p.x, p.y + 44, chip, { size: 10, bg: '#26221ADD', border: p.charging && p.charging.push ? '#EF4444' : '#8A5A3B' });
      // 排便进度条
      if (p.state === 'relief' && p.relief) {
        const pr = 1 - p.relief.left / p.relief.total;
        A.px(ctx, p.x - 20, p.y + 26, 40, 6, '#00000066'); A.px(ctx, p.x - 20, p.y + 26, 40 * pr, 6, '#38BDF8'); A.outline(ctx, p.x - 20, p.y + 26, 40, 6, '#1F1A17', 1);
      }
      // 占坑侠
      if (p.atStall >= 0 && p.state !== 'relief' && sim.t - (p.enterT || 0) > s(15)) A.shameSign(ctx, p.x, p.y - 56, tSec);
      // 霸体/激怒环
      if (sim.t < p.armorUntil || sim.t < p.rageUntil) { ctx.strokeStyle = sim.t < p.rageUntil ? '#F97316' : '#38BDF8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, 7); ctx.stroke(); }
    }

    // ── 几何降级特效 + 拟声字 + 场景内 tips ──
    for (const e of fx) {
      if (e.fm !== undefined && e.fm !== viewMap || !vis(e.x, e.y, 90)) continue;
      ctx.globalAlpha = clamp(e.life, 0, 1);
      if (e.kind === 'ripple') { ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, (1.6 - e.life) * 26, 0, 7); ctx.stroke(); }
      else { ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(e.x, e.y, 4 + (1 - e.life) * 5, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    for (const f of floats) { if (f.fm !== undefined && f.fm !== viewMap || !vis(f.x, f.y, 40)) continue; A.label(ctx, f.txt, f.x, f.y - (1.6 - f.life) * 14, { size: 12, lw: 4, color: f.color }); }
    for (const o of onomats) { if (o.fm !== undefined && o.fm !== viewMap || !vis(o.x, o.y, 80)) continue; A.onomat(ctx, o); }
    // 引导提示（键盘/触屏上下文提示）
    const hint = (() => {
      if (sim.phase === 'prep') return 'WASD/摇杆 自由走动 · 铃响后走到右侧出口';
      if (viewMap === 0) return '→ 走向教室出口';
      if (viewMap === 1) return 'Q 拾道具 · P 出拳 · → 走到厕所门';
      if (you.state === 'post') return '1 喊话 · 2 破罐(+5s) · 3 光屁股出门';
      if (you.naked) return 'Q 取纸/翻入 · R 洗手(+5s) · 10s 内解决';
      if (you.charging && you.charging.push) return 'X 松手保命！(主任间有咳嗽预警)';
      return 'Q 交互 · E 嗅闻/涡轮 · F 道具 · R 冲水 · P 出拳';
    })();
    A.bubble(ctx, cam.x, tp + vh - 18, hint, { size: 11, bg: '#1F1A17DD', border: '#FDE047' });
    const tipEl = document.getElementById('tipbar'); if (tipEl) tipEl.textContent = hint;
    // ── 就近交互提示（不按键也能知道 Q 会做什么）──
    if (!you.final && viewMap === you.mapId) {
      let nt = null, nd = 1e9;
      for (const it of sim.items) if (!it.taken && it.mapId === viewMap) { const d = dist(you, it); if (d < nd) { nd = d; nt = it; } }
      if (nt && nd <= NUM.reach) A.bubble(ctx, nt.x, nt.y - 24, 'Q 拾取 ' + ITEM_DEFS[nt.kind].name, { size: 10, bg:'#26221ADD', border:'#4ADE80' });
      if (viewMap === 2) {
        for (const st of sim.stalls) {
          const d = dist(you, st.doorPt); if (d > NUM.reach || !vis(st.x, st.y, 130)) continue;
          let msg = '';
          if (st.occ === 'dean') msg = '⚠ 疑似主任 · Q 有风险';
          else if (st.occ && st.occ !== you) msg = st.obstacle ? 'Q 骚扰/翻入' : 'Q 骚扰(有人)';
          else if (st.obstacle) msg = 'Q 清障(需工具)';
          else if (st.hasPaper) msg = 'Q 进入(有纸✓)';
          else msg = 'Q 进入(没纸!)';
          A.bubble(ctx, st.x + st.w/2, st.y - 34, msg, { size: 10, bg:'#1F1A17DD', border: st.occ==='dean'?'#EF4444':'#FDE047' });
        }
        if (you.naked && dist(you, SINK) <= NUM.reach) A.bubble(ctx, SINK.x, SINK.y - 50, 'R 洗手 · 优雅 +5s', { size: 10, bg:'#1F1A17DD', border:'#38BDF8' });
      }
    }

    drawPfx(dtSec || 0.016);
    if (sim.dean.active && viewMap === 2) { ctx.fillStyle = PAL.deanFog + '22'; ctx.fillRect(l, tp, vw, vh); }
    ctx.restore();
  }

  function updateHud() {
    document.getElementById('timer').textContent = sim.phase === 'prep' ? `${'准备'} ${Math.ceil(sim.prepLeft / TICK)}s` : `${Math.max(0, Math.ceil((NUM.bells.cap - sim.t) / TICK))}s`;
    document.getElementById('dbf').textContent = '💩大肠翻滚';
    const eb = document.getElementById('ebar'); eb.style.width = clamp(you.endurance, 0, 100) + '%';
    eb.style.background = you.endurance > 50 ? '#4ade80' : you.endurance > 30 ? '#fbbf24' : '#ef4444';
    document.getElementById('etxt').textContent = Math.max(0, Math.ceil(you.endurance));
    const items = you.items.map(k => `<span class="itm" style="border-color:${ITEM_DEFS[k].color}">${ITEM_DEFS[k].name}${(you._charges && you._charges[k]) ? '×' + you._charges[k] : ''}</span>`).join('');
    document.getElementById('items').innerHTML = items;
    document.getElementById('skills').textContent = `嗅闻${you.sniffLeft} ${you.debuff === 'poo' ? '涡轮' + you.turboLeft : ''} 拳${sim.t < you.beatCdUntil ? Math.ceil((you.beatCdUntil - sim.t) / TICK) + 's' : '就绪'}`;
    if (you.state === 'post' && you.post && !you.post.hasPaper && postUI.style.display === 'none' && !you.post.shouted) showPostUI(true);
    if (you.state !== 'post' && postUI.style.display !== 'none') showPostUI(false);
    if (you.naked && you.post) {
      const left = Math.max(0, (you.post.autoAt - sim.t) / TICK).toFixed(1);
      document.getElementById('skills').textContent = you.climbed >= 0
        ? `🪜 已翻入 ${left}s：${you.hasClimbedPaper ? '按 Q 原路爬出(0s)' : '按 Q 取纸'}`
        : `🩲 光屁股 ${left}s：空房取纸(0s) / 梯子翻入有人的纸房 / 洗手(+5s) / 超时(+8s)`;
    }
    if (sim.phase === 'end') showEnd();
  }

  function showEnd() {
    const ov = document.getElementById('endUI'); if (ov.style.display === 'flex') return;
    ov.style.display = 'flex';
    const mk = () => {
      const list = sim.players.slice().sort((a, b) => {
        if (a.final.kind === 'done' && b.final.kind !== 'done') return -1;
        if (b.final.kind === 'done' && a.final.kind !== 'done') return 1;
        if (a.final.kind === 'done' && b.final.kind === 'done') return a.final.time - b.final.time;
        return b.final.time - a.final.time;
      });
      const medal = ['🥇', '🥈', '🥉'];
      return list.map((p, i) => `<div class="row ${p.id === 0 ? 'me' : ''}">${medal[i] || ''} ${p.name} <b>${p.final.kind === 'done' ? p.final.time.toFixed(1) + 's' : p.final.kind === 'blowout' ? '炸裆' : '被抓'}</b></div>`).join('');
    };
    document.getElementById('boards').innerHTML =
      `<div class="board"><h3>${'💩 屎王榜 · 下课总排名'}</h3>${mk()}</div>`;
  }
  document.getElementById('btnAgain').addEventListener('click', () => location.reload());

  /* ---- 主循环 ---- */
  let last = performance.now(), acc = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    while (acc >= TICK_MS / 1000) {
      acc -= TICK_MS / 1000;
      sim.t_internal = sim.t;
      // 你移动
      if (!you.final) { // 备战阶段同样可自由移动（铃前出口被老师堵住）
        let vx = 0, vy = 0;
        if (keys['w'] || keys['arrowup']) vy -= 1;
        if (keys['s'] || keys['arrowdown']) vy += 1;
        if (keys['a'] || keys['arrowleft']) vx -= 1;
        if (keys['d'] || keys['arrowright']) vx += 1;
        if (joy.on) { vx = joy.dx; vy = joy.dy; }
        you.moveMode = keys['shift'] ? 'run' : keys['control'] ? 'sneak' : you.moveMode === 'run' && !keys['shift'] ? 'walk' : you.moveMode;
        if (vx || vy) { const d = Math.hypot(vx, vy); you._simT = sim.t; movePlayer(you, vx / d, vy / d, TICK_MS / 1000); }
        // 键盘模式覆盖（不触碰触屏按钮设定的模式）
        if (keys['shift']) you.moveMode = 'run';
        else if (keys['control']) you.moveMode = 'sneak';
        else if (you._kbdMode) { you.moveMode = 'walk'; you._kbdMode = false; }
        if (keys['shift'] || keys['control']) you._kbdMode = true;
      }
      // AI
      for (const b of bots) { b.p._simT = sim.t; b.think(sim.t); b.onSniffResult; }
      sim.tick();
      for (const ev of sim.events) if (ev.type === 'sniffResult') bots.forEach(b => ev.pid === b.p.id && b.onSniffResult(ev));
    }
    consumeEvents();
    // fx 更新
    for (let i = fx.length - 1; i >= 0; i--) { const e = fx[i]; e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.94; e.vy *= 0.94; e.life -= dt; if (e.life <= 0) fx.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) { floats[i].life -= dt; if (floats[i].life <= 0) floats.splice(i, 1); }
    for (let i = onomats.length - 1; i >= 0; i--) { onomats[i].life -= dt; onomats[i].t += dt; if (onomats[i].life <= 0) onomats.splice(i, 1); }
    draw(now, dt); updateHud();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.addEventListener('pointerdown', () => { if (!AC && audioOn) beep(1, 0.01, 'sine', 0.001); }, { once: true });
})();

/* ================= 无头测试（node game.js test） ================= */
if (typeof window === 'undefined' && process.argv[2] === 'test') (function () {
  let pass = 0, fail = 0;
  const T = (name, fn) => {
    try { fn(); console.log('PASS', name); pass++; }
    catch (e) { console.log('FAIL', name, '--', e.message); fail++; }
  };
  const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'assert'}: ${a} != ${b}`); };
  const ok = (c, msg) => { if (!c) throw new Error(msg || 'assert false'); };

  function mkSim(seed) { const sim = new Sim(seed); sim.phase = 'run'; sim.bellT = sim.t; sim.players.forEach(p => { p.mapId = 2; }); return sim; } // 协议单测默认置于厕所图（三图版契约）
  function place(sim, pid, x, y) { const p = sim.players[pid]; p.x = x; p.y = y; }
  function step(sim, n = 1) { for (let i = 0; i < n; i++) sim.tick(); }
  const hasEv = (sim, type, pred) => sim.events.some(e => e.type === type && (!pred || pred(e)));

  // T1 C1：完成 vs 打断同 tick → 完成优先，打断意图失效且不消耗
  T('C1 完成优先于打断', () => {
    const sim = mkSim(1); const A = sim.players[0], B = sim.players[1];
    A.debuff = 'poo'; place(sim, 0, sim.stalls[0].inPt.x, sim.stalls[0].inPt.y);
    const st = sim.stalls[0]; st.obstacle = null; st.occ = A; st.occKind = 'player'; st.occId++; A.atStall = 0;
    sim._startRelief(A, 'poop'); st.hasPaper = true; A.relief.left = 31; // 与 poke 同刻( t=31 )完成
    B.items.push('broom'); B._charges = { broom: 2 }; place(sim, 1, st.doorPt.x, st.doorPt.y);
    sim.queue(1, 'poke', { idx: 0 });
    sim.tick(); // t=1：poke 受理 startT=1 resolveT=31
    step(sim, 30); // t=31：段① relief 完成→finalize → 段② poke 目标失效中断
    ok(A.final && A.final.kind === 'done', 'A 应完成而非被打断: ' + JSON.stringify(A.final));
    ok(!B.charging, 'poke 引导应结束');
    ok(hasEv(sim, 'guideAbort', e => e.pid === 1 && e.reason === 'target'), 'poke 应中断');
    eq(B._charges.broom, 2, 'broom 不应消耗（完成优先）');
  });

  // T2 C2：双人同 tick 进同一空隔间 → actor_id 小者得
  T('C2 同tick双进一间先序者得', () => {
    const sim = mkSim(2); const st = sim.stalls[1]; st.obstacle = null;
    place(sim, 0, st.doorPt.x, st.doorPt.y); place(sim, 1, st.doorPt.x, st.doorPt.y + 5);
    sim.queue(1, 'enterStall', { idx: 1 }); sim.queue(0, 'enterStall', { idx: 1 });
    step(sim, 11);
    ok(st.occ === sim.players[0], 'pid 0 应获胜, occ=' + (st.occ && st.occ.id));
    ok(hasEv(sim, 'intentFail', e => e.pid === 1 && e.why === 'occupied') || hasEv(sim, 'guideAbort', e => e.pid === 1), '后序者应失败/中断');
  });

  // T3 C3：翻墙(40t)+撬锁(24t) 同刻完成 → 骚扰 +3+3 叠加、单次逼出、优先锁给先启动者
  T('C3 骚扰溢出单次逼出+优先锁', () => {
    const sim = mkSim(3); const st = sim.stalls[2]; st.obstacle = null;
    const A = sim.players[0], B = sim.players[1], V = sim.players[2];
    st.occ = V; st.occKind = 'player'; st.occId++; V.atStall = 2; V.x = st.inPt.x; V.y = st.inPt.y; sim._startRelief(V, 'poop');
    A.items.push('ladder'); B.items.push('wire'); // 翻墙 +3 / 撬锁 +3
    place(sim, 0, st.doorPt.x, st.doorPt.y); place(sim, 1, st.doorPt.x + 10, st.doorPt.y);
    sim.queue(0, 'ladder', { idx: 2 }); step(sim, 16); // t=1→41
    sim.queue(1, 'wire', { idx: 2 }); step(sim, 65);   // 含 40t 推门期：两次 +3 都落地
    ok(!st.occ, '应已逼出');
    eq(st.harass, 0, '逼出后骚扰清零');
    ok(st.lockBy === 0, '优先锁应给先启动的翻墙(0), lockBy=' + st.lockBy);
    eq(sim.events.filter(e => e.type === 'evict' && e.idx === 2).length, 1, '骚扰溢出只触发一次逼出');
  });

  // T4 C4：双递纸同刻 → 先启动者成功，后者退纸
  T('C4 双递纸先启动者得', () => {
    const sim = mkSim(4); const st = sim.stalls[0]; st.obstacle = null;
    const A = sim.players[0], B = sim.players[1], V = sim.players[2];
    st.occ = V; st.occKind = 'player'; st.occId++; V.atStall = 0; V.x = st.inPt.x; V.y = st.inPt.y;
    V.state = 'post'; V.post = { hasPaper: false, shouted: true, autoAt: sim.t + 200 };
    A.items.push('paper'); B.items.push('paper');
    place(sim, 0, st.doorPt.x, st.doorPt.y); place(sim, 1, st.doorPt.x + 8, st.doorPt.y);
    sim.queue(0, 'paper', { idx: 0 }); step(sim, 5);
    sim.queue(1, 'paper', { idx: 0 }); step(sim, 26);
    ok(V.final && V.final.kind === 'done', 'V 应完成');
    eq(B.items.filter(i => i === 'paper').length, 1, 'B 的纸应退还');
  });

  // T5：尿线删除回归——不存在 enterUrinal/shove 意图
  T('尿线已删除：无池位/无推搡意图', () => {
    const sim = mkSim(5);
    eq(sim.urinals, undefined, '不应存在 urinals');
    ok(sim.players.every(p => p.debuff === 'poo'), '全员应为大肠翻滚');
    eq(sim.stalls.length, 5, '应扩为 5 间隔间');
    const A = sim.players[0], V = sim.players[1];
    V.atStall = 0; sim.stalls[0].occ = V;
    sim.queue(0, 'enterUrinal', { idx: 0 }); sim.queue(0, 'shove', { id: 1 });
    step(sim, 2);
    ok(!A.charging, '旧意图不应被受理');
    eq(V.relief, null, '不应产生任何排便');
  });

  // T6 C6：逼出瞬间第三方在途引导 → 目标失效中断回滚
  T('C6 逼出使在途引导失效', () => {
    const sim = mkSim(6); const st = sim.stalls[0]; st.obstacle = null;
    const A = sim.players[0], B = sim.players[1], V = sim.players[2];
    st.occ = V; st.occKind = 'player'; st.occId++; V.atStall = 0; V.x = st.inPt.x; V.y = st.inPt.y; sim._startRelief(V, 'poop');
    A.items.push('plunger'); A._charges = { plunger: 2 }; B.items.push('broom'); B._charges = { broom: 2 };
    place(sim, 0, st.doorPt.x, st.doorPt.y); place(sim, 1, st.doorPt.x + 10, st.doorPt.y);
    sim.queue(0, 'bonk', { idx: 0 }); // t0→10 骚扰+1 → 需要3，先补2
    st.harass = 2; st.lastH = sim.t;
    sim.queue(1, 'poke', { idx: 0 }); // t0→30 在途
    step(sim, 11); // bonk 在 t10 结算 → harass 3 → 逼出 → poke occId 失效
    ok(!st.occ, '应已逼出');
    ok(!B.charging || B.charging === null, 'poke 应被中断');
    ok(hasEv(sim, 'guideAbort', e => e.pid === 1), '应有中断事件');
    eq(B._charges.broom, 2, 'broom 应回滚');
  });

  // T7 C7：主任入住 tick == 嗅闻完成 tick → 入住先（段①）、嗅闻中断且次数保留
  T('C7 主任入住先于嗅闻完成', () => {
    const sim = mkSim(7); const st = sim.stalls[0]; st.obstacle = null; st.occ = null;
    const A = sim.players[0];
    place(sim, 0, st.doorPt.x, st.doorPt.y);
    for (let i = 1; i < sim.stalls.length; i++) sim.stalls[i].obstacle = i % 2 ? 'berry' : 'anaconda'; // 主任唯一候选 = 0 号间
    sim.dean.active = false; sim.dean.planned = true; sim.dean.spawnAt = 31; // 与嗅闻 resolve 同刻
    sim.queue(0, 'sniff', { idx: 0 }); // t=1 startT=1 resolveT=31
    sim.tick(); step(sim, 30); // t=31：段① 主任入住(occId++) → 段② 嗅闻失效中断
    ok(sim.dean.active && st.occ === 'dean', '主任应已入住 0 号间');
    ok(hasEv(sim, 'guideAbort', e => e.pid === 0 && e.reason === 'target'), '嗅闻应中断');
    eq(A.sniffLeft, 1, '嗅闻次数应保留');
  });

  // T8：撬主任窝 → 推门完成判负；推门期取消 → 保命但道具已耗
  T('T8 推门期取消保命', () => {
    const sim = mkSim(8); const st = sim.stalls[0]; st.obstacle = null;
    const A = sim.players[0]; A.items.push('ladder'); A._charges = { ladder: 1 };
    place(sim, 0, st.doorPt.x, st.doorPt.y);
    st.occ = 'dean'; st.occKind = 'dean'; sim.dean.active = true; sim.dean.stall = 0; sim.dean.leaveAt = 999999;
    sim.queue(0, 'ladder', { idx: 0 });
    step(sim, 41); // 引导40t 完成 → 道具消耗 + 进推门期
    ok(A.charging && A.charging.push, '应处于推门期');
    eq(A.items.includes('ladder'), false, '梯子应已消耗');
    sim.cancel(0); step(sim, 2);
    ok(!A.final, '取消应保命');
    // 变体：不取消 → 判负
    const sim2 = mkSim(9); const st2 = sim2.stalls[1]; st2.obstacle = null;
    const A2 = sim2.players[0]; A2.items.push('ladder'); A2._charges = { ladder: 1 };
    place(sim2, 0, st2.doorPt.x, st2.doorPt.y);
    st2.occ = 'dean'; st2.occKind = 'dean'; sim2.dean.active = true; sim2.dean.stall = 1; sim2.dean.leaveAt = 999999;
    sim2.queue(0, 'ladder', { idx: 1 }); step(sim2, 82);
    ok(A2.final && A2.final.kind === 'dead', '推门完成应判负');
  });

  // T9：KNOCK 中断 → 半额 CD
  T('T9 knock中断半额CD', () => {
    const sim = mkSim(10); const st = sim.stalls[0]; st.obstacle = null;
    const A = sim.players[0], V = sim.players[1];
    st.occ = V; st.occKind = 'player'; V.atStall = 0;
    place(sim, 0, st.doorPt.x, st.doorPt.y);
    sim.queue(0, 'knock', { idx: 0 }); step(sim, 3);
    sim.cancel(0); step(sim, 1);
    ok(A.cds['knock'] && A.cds['knock'] - sim.t < NUM.cd.knock, 'CD 应为半额(<10s)，实际剩 ' + (A.cds['knock'] - sim.t) + 't');
  });

  // T10：嗅闻中断 → 次数保留
  T('T10 嗅闻中断次数保留', () => {
    const sim = mkSim(11); const st = sim.stalls[0]; st.obstacle = null;
    const A = sim.players[0], V = sim.players[1];
    st.occ = V; st.occKind = 'player'; st.occId++; V.atStall = 0;
    place(sim, 0, st.doorPt.x, st.doorPt.y);
    sim.queue(0, 'sniff', { idx: 0 }); step(sim, 3);
    sim._evict(sim.stalls[0], 2); // 占用翻转
    step(sim, 1);
    eq(A.sniffLeft, 1, '嗅闻次数应保留');
  });

  // T11 C10：断线 → 在途引导中断回滚、忍耐继续扣
  T('C10 断线回滚', () => {
    const sim = mkSim(12); const st = sim.stalls[0]; st.obstacle = null;
    const A = sim.players[0]; A.items.push('wire'); A._charges = { wire: 1 };
    place(sim, 0, st.doorPt.x, st.doorPt.y);
    const V = sim.players[1]; st.occ = V; st.occKind = 'player'; st.occId++; V.atStall = 0;
    sim.queue(0, 'wire', { idx: 0 }); step(sim, 3);
    sim.drop(0); step(sim, 1);
    ok(!A.charging, '引导应中断');
    eq(A.items.includes('wire'), true, '铁丝应回滚');
    const e0 = A.endurance; step(sim, 20); ok(A.endurance < e0, '断线期间忍耐照扣');
  });

  // T13：20 种子全 AI 完整对局回归——不允许全员炸裆/软锁
  T('多种子完整对局冒烟', () => {
    let totalDone = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const sim = mkSim(seed * 100 + 7);
      const bs = sim.players.map(p => new Bot(sim, p.id));
      sim.players[0].bot = true;
      let ticks = 0;
      while (sim.phase !== 'end' && ticks < (NUM.bells.cap + 40) * TICK) { // 局长上限 480s，留 40s 余量
        ticks++;
        for (const b of bs) { b.p._simT = sim.t; b.think(sim.t); }
        sim.tick();
        for (const ev of sim.events) if (ev.type === 'sniffResult') bs.forEach(b => { if (ev.pid === b.p.id) b.onSniffResult(ev); });
        sim.events.length = 0;
      }
      ok(sim.phase === 'end', `seed ${seed} 应正常结束`);
      totalDone += sim.players.filter(p => p.final && p.final.kind === 'done').length;
      ok(sim.players.every(p => p.final), `seed ${seed} 全员应定型`);
    }
    ok(totalDone >= 6, `至少 6 人次完成排便（实际 ${totalDone}）——防 AI 全员炸裆回归`);
  });

  // T14：假指示贴 + 冲水伪装的信息层闭环
  T('假指示贴/冲水伪装闭环', () => {
    const sim = mkSim(202); const st = sim.stalls[1]; st.obstacle = null; st.occ = null;
    const A = sim.players[0], B = sim.players[1];
    place(sim, 0, st.doorPt.x, st.doorPt.y); place(sim, 1, st.doorPt.x + 5, st.doorPt.y);
    A.items.push('poster');
    sim.queue(0, 'poster', { idx: 1 }); step(sim, 1);
    ok(sim.shownOcc(st), '空房应被贴成假红');
    sim.queue(1, 'enterStall', { idx: 1 }); step(sim, 11);
    ok(st.occ === B, '合法性按真值：假红空房仍可进入');
    eq(sim.t < st.fakeUntil, false, '服务器事件即复位');
    ok(sim.shownOcc(st) === true, '复位后按真值: 已被占用');
    // 冲水伪装：只认信息层绿标；假贴绿标主任间 → 无声失败但单播真值
    const st2 = sim.stalls[2]; st2.obstacle = null; st2.occ = 'dean'; st2.fakeOcc = false; st2.fakeUntil = sim.t + 100;
    sim.dean.active = true; sim.dean.stall = 2; sim.dean.leaveAt = 999999;
    place(sim, 0, st2.doorPt.x, st2.doorPt.y);
    sim.queue(0, 'flushFake', { idx: 2 }); step(sim, 1);
    ok(hasEv(sim, 'flushFake', e => e.pid === 0 && e.truth === 'dean'), '操作者应收到主任真值（单播）');
    ok(!A.final, '冲水伪装不判负');
  });

  // T15：裁决#18 光屁股善后——取纸/洗手/超时三分支
  T('光屁股善后：取纸=0s / 洗手=+5s / 超时=+8s', () => {
    // 取纸：空的有纸房
    const a = mkSim(301); const P = a.players[0];
    const st0 = a.stalls[0], st1 = a.stalls[1];
    st0.obstacle = null; st0.hasPaper = false; st1.obstacle = null; st1.hasPaper = true;
    st0.occ = P; st0.occKind = 'player'; st0.occId++; P.atStall = 0; P.x = st0.inPt.x; P.y = st0.inPt.y;
    a._startRelief(P, 'poop'); P.relief.left = 1;
    a.tick(); // 进 POST
    ok(P.state === 'post' && !P.final, '应卡在 POST');
    a.queue(0, 'nakedOut'); a.tick();
    ok(P.naked && P.atStall < 0, '应光屁股出门进入移动态');
    P.x = st1.doorPt.x; P.y = st1.doorPt.y; // 走到有纸房
    a.queue(0, 'takePaper', { idx: 1 }); a.tick();
    step(a, NUM.guide.takePaper + 1); // 0.5s 引导
    ok(P.final && P.final.kind === 'done', '取纸应干净完成');
    eq(st1.hasPaper, false, '纸应被取走');
    // 洗手：+5s
    const b = mkSim(302); const Q = b.players[0];
    const bs0 = b.stalls[0]; bs0.obstacle = null; bs0.hasPaper = false; bs0.occ = Q; bs0.occKind = 'player'; bs0.occId++; Q.atStall = 0;
    b._startRelief(Q, 'poop'); Q.relief.left = 1;
    b.tick(); b.queue(0, 'nakedOut'); b.tick();
    Q.x = SINK.x; Q.y = SINK.y;
    b.queue(0, 'wash'); b.tick(); step(b, NUM.guide.wash + 1);
    ok(Q.final && Q.final.kind === 'done', '洗手应优雅结束');
    ok(hasEv(b, 'washDone'), '应有洗手事件');
    // 超时：+8s 自动破罐
    const c = mkSim(303); const R = c.players[0];
    const cs0 = c.stalls[0]; cs0.obstacle = null; cs0.hasPaper = false; cs0.occ = R; cs0.occKind = 'player'; cs0.occId++; R.atStall = 0;
    c._startRelief(R, 'poop'); R.relief.left = 1;
    c.tick(); c.queue(0, 'nakedOut'); c.tick();
    step(c, NUM.post.autoBreak + 2);
    ok(R.final && R.final.kind === 'done', '超时应自动结束');
    ok(hasEv(c, 'final', e => e.pid === 0), '应有定型事件');
  });

  // T16：裁决#19 翻入有人的有纸隔间取纸（不骚扰、不逼出、占用不变）
  T('翻入取纸：无骚扰/无逼出/爬出完成', () => {
    const sim = mkSim(401); const A = sim.players[0], V = sim.players[1];
    const st = sim.stalls[2]; st.obstacle = null; st.hasPaper = true;
    st.occ = V; st.occKind = 'player'; st.occId++; V.atStall = 2; V.x = st.inPt.x; V.y = st.inPt.y; sim._startRelief(V, 'poop');
    // A 进入光屁股态（用无纸隔间走一遍）
    const s0 = sim.stalls[0]; s0.obstacle = null; s0.hasPaper = false; s0.occ = A; s0.occKind = 'player'; s0.occId++; A.atStall = 0;
    sim._startRelief(A, 'poop'); A.relief.left = 1; sim.tick();
    sim.queue(0, 'nakedOut'); sim.tick();
    A.items.push('ladder'); A.x = st.doorPt.x; A.y = st.doorPt.y;
    const occBefore = st.occ, harassBefore = st.harass, reliefLeftBefore = V.relief.left;
    sim.queue(0, 'raidPaper', { idx: 2 });
    step(sim, NUM.guide.ladder + NUM.guide.push + 2); // 翻墙 2s + 推门 2s
    ok(A.climbed === 2, '应已翻入, climbed=' + A.climbed);
    eq(st.occ, occBefore, '原占用者不受影响');
    eq(st.harass, harassBefore, '不产生骚扰值');
    eq(V.relief.left, reliefLeftBefore - (NUM.guide.ladder + NUM.guide.push + 2), '占用者排便进度正常推进（未被打断/逼出）');
    ok(!A.final, '取纸前不定型');
    sim.queue(0, 'takeClimbed', { idx: 2 }); step(sim, NUM.guide.takePaper + 2);
    ok(A.hasClimbedPaper && st.hasPaper === false, '应取到纸');
    ok(!A.final, '爬出前仍不定型');
    sim.queue(0, 'climbOut', { idx: 2 }); step(sim, NUM.guide.climbOut + 2);
    ok(A.final && A.final.kind === 'done', '爬出后干净完成');
    eq(st.occ, V, '隔间仍归原占用者');
  });

  // T17：三地图切图事务（ABORT 回滚 / 落点 / 防横跳冷却 / 铃前阻挡）
  T('三地图连接口与切图事务', () => {
    const sim = mkSim(501); const A = sim.players[0];
    // 铃前：教室出口阻挡（x 不超过 1690）
    A.mapId = 0; A.x = 1660; A.y = 530; sim.phase = 'prep'; A._simT = sim.t;
    movePlayer(A, 1, 0, 1);
    ok(A.x <= 1690, '铃前老师堵门');
    // 铃后：走入出口触发区 → 切图到 map1
    sim.phase = 'run'; sim.bellT = sim.t; A.x = 1720; A.y = 530;
    sim.touchConnections(A);
    eq(A.mapId, 1, '应切到教室外');
    eq(A.x, CONNECTIONS[0].land.x, '落点正确');
    ok(A.switchCdUntil > sim.t, '应有 1.5s 防横跳冷却');
    // 冷却内再次踩触发区不生效
    A.x = 1720; A.y = 530; const mapBefore = A.mapId;
    sim.touchConnections(A);
    eq(A.mapId, mapBefore, '冷却内不反横跳');
    // 在途引导切图 → ABORT 回滚（铁丝保留）
    step(sim, s(1.6));
    A.items.push('wire');
    A.mapId = 2; A.x = sim.stalls[0].doorPt.x; A.y = sim.stalls[0].doorPt.y;
    sim.stalls[0].obstacle = null; sim.stalls[0].occ = sim.players[1]; sim.stalls[0].occKind = 'player'; sim.stalls[0].occId++;
    sim.queue(0, 'wire', { idx: 0 }); sim.tick();
    ok(A.charging && A.charging.type === 'wire', '引导应在途');
    sim.switchMap(A, { from: 2, to: 1, land: { x: 1300, y: 410 } });
    ok(!A.charging, '切图应中断引导');
    eq(A.items.includes('wire'), true, '道具应全额回滚');
  });

  // T18：跨图零可见（事件流按同图过滤）
  T('跨图信息隔离', () => {
    const sim = mkSim(502); const A = sim.players[0], B = sim.players[1];
    A.mapId = 0; B.mapId = 2;
    sim._noise(B.x, B.y, 'turbo');
    const ev = sim.events.find(e => e.type === 'noise');
    ok(ev, 'noise 应生成');
    // 渲染/订阅层契约：同图检查（noise 已有 mapId 字段由调用方打标；此处验证 Sim 不跨图授权交互）
    B.atStall = 0; sim.stalls[0].occ = B; sim.stalls[0].occKind = 'player';
    place(sim, 0, sim.stalls[0].doorPt.x, sim.stalls[0].doorPt.y);
    sim.queue(0, 'knock', { idx: 0 }); sim.tick();
    ok(!A.charging, '跨图玩家不可对隔间发起意图');
    ok(sim.events.some(e => e.type === 'intentFail'), '应被明确拒绝');
  });

  // T12：主任激怒 → 惩罚不判负、主任离场
  T('T12 主任激怒惩罚', () => {
    const sim = mkSim(13); const st = sim.stalls[0]; st.obstacle = null;
    const A = sim.players[0], V = sim.players[1];
    st.occ = V; st.occKind = 'player'; st.occId++; V.atStall = 0; V.x = st.inPt.x; V.y = st.inPt.y; sim._startRelief(V, 'poop');
    A.items.push('broom'); A._charges = { broom: 2 };
    place(sim, 0, st.doorPt.x, st.doorPt.y);
    const dstall = sim.stalls[1]; dstall.obstacle = null; dstall.occ = 'dean'; dstall.occKind = 'dean'; sim.dean.active = true; sim.dean.stall = 1; sim.dean.leaveAt = 999999;
    sim.rng = () => 0; // 30% 必中
    sim.queue(0, 'poke', { idx: 0 }); step(sim, 32);
    ok(!A.final, '激怒不判负');
    ok(!sim.dean.active, '主任应离场');
    ok(hasEv(sim, 'deanAnger'), '应有激怒事件');
    ok(A.x < 1060, '应被弹出厕所');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
