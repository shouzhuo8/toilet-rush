/* 课间特急：厕所攻防战 — 可玩原型 v0.1
 * 单机 20Hz 权威模拟（与 ARCH-9.5 结算协议同构）+ 4 个 AI + 双端输入 + 无头测试
 * 规则来源：GDD-PVP.md v0.3；结算协议：arch/ARCH-9.5-引导结算协议.md
 */
'use strict';

/* ================= 配置（GDD §15 数值速查表同源） ================= */
const TICK = 20, TICK_MS = 1000 / TICK;
const s = (sec) => Math.round(sec * TICK); // 秒 → tick

const NUM = {
  drain: { pee: 0.9, poo: 1.2 },
  runMult: 1.5, sneakMult: 0.5,
  speed: { run: 60, walk: 43, sneak: 21.6 }, // px/s（≈12px/m）
  relief: { urinal: s(6), stallPee: s(12), poop: s(14) },
  turboSave: s(5), comicSave: s(2),
  guide: { wire: s(1.2), ladder: s(2), poke: s(1.5), bonk: s(0.5), knock: s(1.5),
           sniff: s(1.5), paper: s(1.5), clearPA: s(3), clearPB: s(5), clearBA: s(8),
           push: s(2), enter: s(0.5) },
  cd: { shove: s(8), pokeDoor: s(3), knock: s(10), knockAbort: s(5), reenter: s(3) },
  harass: { need: 3, decay: s(6) },
  prot: { superarmor: s(2), rage: s(10), evictImmune: s(10), lock: s(2),
          staggerS: s(1.5), staggerL: s(2), evictDrain: s(5) },
  dean: { prob: 0.6, spawnMin: s(20), spawnMax: s(55), stayMin: s(10), stayMax: s(20), anger: 0.30 },
  stall: { obstacle: 0.35, paper: 0.70 },
  bells: { pre: s(90), preMult: 1.5, cap: s(180), softAt: 3, softT: s(45), softMult: 3 },
  post: { autoBreak: s(10), penalty: s(5) },
  sniff: { errBare: 0.10, errMask: 0.15, infect: 0.45, rate: 0.30, range: 52 },
  shoveMax: 3, soda: { dur: s(20), mult: 0.5 },
  splash: { broom: 0.30, dmg: 5 },
  actR: 48, pickR: 26, // 交互/拾取半径
};

/* ================= 工具 ================= */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================= 地图 ================= */
const ROOMS = [
  { id: 'class', x: 40, y: 140, w: 280, h: 340, label: '教室' },
  { id: 'wjunc', x: 320, y: 100, w: 60, h: 440 },
  { id: 'fast', x: 380, y: 270, w: 620, h: 80, label: '走廊(快速路)' },
  { id: 'rB', x: 380, y: 100, w: 620, h: 80, label: '道具路B' },
  { id: 'rA', x: 380, y: 460, w: 620, h: 80, label: '道具路A' },
  { id: 'ejunc', x: 1000, y: 100, w: 60, h: 440 },
  { id: 'toilet', x: 1060, y: 100, w: 400, h: 440, label: '厕所' },
];
function walkable(x, y) { for (const r of ROOMS) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true; return false; }
function inToilet(p) { const r = ROOMS[6]; return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

const URINALS = [{ x: 1150 }, { x: 1262 }, { x: 1374 }].map((u, i) => ({ idx: i, x: u.x, y: 150, doorY: 175, occ: null }));
const STALLS = [{ x: 1120 }, { x: 1245 }, { x: 1370 }].map((u, i) => ({ idx: i, x: u.x, y: 440, w: 100, h: 90, doorPt: { x: u.x + 50, y: 415 }, inPt: { x: u.x + 50, y: 485 }, occ: null, occId: 0, occKind: null, obstacle: null, hasPaper: false, harass: 0, lastH: -9999, lockBy: -1, lockUntil: 0 }));
const SINK = { x: 1085, y: 305 };
const SPAWNS = [0, 1, 2, 3, 4].map(i => ({ x: 90 + i * 48, y: 320 }));
const ROUTES = {
  fast: [{ x: 350, y: 310 }, { x: 390, y: 310 }, { x: 990, y: 310 }, { x: 1030, y: 320 }, { x: 1090, y: 320 }],
  A: [{ x: 350, y: 500 }, { x: 390, y: 500 }, { x: 990, y: 500 }, { x: 1030, y: 480 }, { x: 1030, y: 320 }, { x: 1090, y: 320 }],
  B: [{ x: 350, y: 140 }, { x: 390, y: 140 }, { x: 990, y: 140 }, { x: 1030, y: 160 }, { x: 1030, y: 320 }, { x: 1090, y: 320 }],
};
const ITEM_DEFS = {
  mask: { name: '口罩', color: '#8ecae6' }, broom: { name: '扫把', color: '#bdb76b' },
  wire: { name: '铁丝', color: '#b0b0b8' }, ladder: { name: '梯子', color: '#c68b59' },
  plunger: { name: '搋子', color: '#8d5a3a' }, paper: { name: '卫生纸', color: '#f4f0e6' },
  comic: { name: '漫画书', color: '#ff9f68' }, soda: { name: '憋气糖', color: '#90e0a0' },
};
const WEAPONS = new Set(['broom', 'wire', 'ladder', 'plunger']);

/* ================= Sim（权威模拟 + ARCH-9.5 三段流水） ================= */
class Sim {
  constructor(seed) {
    this.rng = mulberry32(seed >>> 0); this.seed = seed >>> 0;
    this.t = 0; this.phase = 'prep'; this.prepLeft = s(10);
    this.G = 1; this.softUntil = -1; this.finalCount = 0;
    this.events = []; this.pending = []; this.iidSeq = 1;
    this.bellT = 0; this.lastShout = null;

    // debuff 3+2 分配（裁决#1）
    const peeCount = this.rng() < 0.5 ? 3 : 2;
    const debuffs = []; for (let i = 0; i < 5; i++) debuffs.push(i < peeCount ? 'pee' : 'poo');
    for (let i = debuffs.length - 1; i > 0; i--) { const j = (this.rng() * (i + 1)) | 0; [debuffs[i], debuffs[j]] = [debuffs[j], debuffs[i]]; }
    const NAMES = ['你', '王小明', '李铁蛋', '张翠花', '赵大宝'];
    const COLORS = ['#3aa0ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#c084fc'];
    this.players = NAMES.map((n, i) => ({
      id: i, name: n, color: COLORS[i], debuff: debuffs[i],
      x: SPAWNS[i].x, y: SPAWNS[i].y, dir: 1,
      endurance: 100, moveMode: 'walk', sneaking: false,
      state: 'idle', // idle|relief|post|stagger —— FINAL 由 final 字段表达
      relief: null, // {kind,total,left}
      post: null, // {shouted, autoAt}
      final: null, // {kind:'done'|'blowout'|'dead', time}
      staggerUntil: 0, armorUntil: 0, rageUntil: 0, immuneUntil: 0,
      drainBuffUntil: 0, sodaUntil: 0, reenterCDUntil: 0,
      shoveCount: 0, items: [], sniffLeft: 1, turboLeft: 1,
      cds: {}, charging: null, bot: i > 0,
      atStall: -1, atUrinal: -1,
    }));

    // 障碍 + 纸（裁决#4 保底 1 间）
    this.stalls = STALLS.map(() => null);
    const obRoll = STALLS.map(() => this.rng() < NUM.stall.obstacle);
    if (!obRoll.some(v => v)) obRoll[(this.rng() * 3) | 0] = true;
    STALLS.forEach((st, i) => {
      this.stalls[i] = { ...st, obstacle: obRoll[i] ? (this.rng() < 0.5 ? 'anaconda' : 'berry') : null, hasPaper: this.rng() < NUM.stall.paper };
    });
    this.urinals = URINALS.map(u => ({ ...u }));

    // 道具
    let itemId = 1; this.items = [];
    const put = (kind, x, y) => this.items.push({ id: itemId++, kind, x, y, taken: false });
    put('mask', 470, 500); put('mask', 560, 500); put('wire', 650, 500); put('paper', 740, 500); put('comic', 830, 500); put('soda', 920, 500);
    put('broom', 470, 140); put('broom', 560, 140); put('ladder', 650, 140); put('plunger', 740, 140); put('paper', 830, 140);
    put('plunger', SINK.x, SINK.y); put('paper', SINK.x + 35, SINK.y);

    // 主任
    this.dean = { active: false, stall: -1, planned: this.rng() < NUM.dean.prob, spawnAt: -1, leaveAt: -1, secondDone: false };
    if (this.dean.planned) this.dean.spawnAt = NUM.dean.spawnMin + ((this.rng() * (NUM.dean.spawnMax - NUM.dean.spawnMin)) | 0);
  }

  /* ---- 对外 API ---- */
  queue(pid, type, target) { const iid = this.iidSeq++; this.pending.push({ iid, pid, type, target }); return iid; }
  cancel(pid) { const g = this.players[pid].charging; if (g) g.cancelReq = true; }
  drop(pid) { const p = this.players[pid]; if (p.charging) this._abortGuide(p, p.charging, 'drop'); } // C10：断线=目标失效
  get alivePlayers() { return this.players.filter(p => !p.final); }

  _ev(type, data) { this.events.push({ ...data, t: this.t, type }); } // type 恒为事件名（载荷字段不可覆盖）
  _canSee(p, pt) { return dist(p, pt) <= NUM.actR + 26 || inToilet(p) && inToilet(pt); }

  /* ---- 引导系统（ARCH-9.5） ---- */
  _startGuide(p, g) {
    p.charging = g; g.startT = this.t;
    g.resolveT = this.t + g.dur; g.cancelReq = false;
    if (g.type === 'wire' || g.type === 'ladder') { g.occId = this.stalls[g.target.idx].occId; }
    else if (g.type === 'poke' || g.type === 'bonk' || g.type === 'knock' || g.type === 'sniff' || g.type === 'paper') { g.occId = this.stalls[g.target.idx].occId; }
    this._ev('guideStart', { pid: p.id, act: g.type, dur: g.dur });
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
    if (this.softUntil > 0 && t >= this.softUntil) { this.softUntil = -1; this._forceEnd(); }
    if (t >= NUM.bells.cap) this._forceEnd();

    // 主任
    const d = this.dean;
    if (!d.active && d.spawnAt > 0 && t >= d.spawnAt) {
      const free = this.stalls.filter(st => !st.occ && !st.obstacle);
      if (free.length) {
        const st = free[(this.rng() * free.length) | 0];
        d.active = true; d.stall = st.idx; st.occ = 'dean'; st.occKind = 'dean'; st.occId++; st.harass = 0;
        d.leaveAt = t + NUM.dean.stayMin + ((this.rng() * (NUM.dean.stayMax - NUM.dean.stayMin)) | 0);
        d.spawnAt = -1;
        this._ev('deanIn', {});
      } else { d.spawnAt = t + s(5); } // 候选为空：5s 重 roll
    }
    if (d.active && t >= d.leaveAt) {
      const st = this.stalls[d.stall]; st.occ = null; st.occKind = null; st.occId++; st.harass = 0;
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
        p.endurance -= NUM.drain[p.debuff] * mult * this.G / TICK;
        if (p.endurance <= 0) this._finalize(p, 'blowout');
      }
      // 排便进度
      if (p.state === 'relief' && p.relief) {
        p.relief.left--;
        if (p.relief.left <= 0) this._reliefDone(p);
      }
      // POST 挂起超时
      if (p.state === 'post' && p.post && !p.post.hasPaper) {
        if (t >= p.post.autoAt) this._breakFinish(p, true);
      }
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
    if (p.relief.kind === 'poop') {
      const st = this.stalls[p.atStall];
      if (st && st.hasPaper) { st.hasPaper = false; this._finalize(p, 'done'); }
      else { p.state = 'post'; p.post = { hasPaper: false, shouted: false, autoAt: this.t + NUM.post.autoBreak }; this._ev('postStuck', { pid: p.id }); }
    } else this._finalize(p, 'done');
  }
  _breakFinish(p, auto) {
    if (!p.post) return;
    p.post = null; this._finalize(p, 'done', NUM.post.penalty);
  }
  _finalize(p, kind, penalty = 0) {
    if (p.final) return;
    p.charging = null; p.state = 'idle'; p.relief = null; p.post = null;
    if (p.atStall >= 0) { const st = this.stalls[p.atStall]; if (st.occ === p) { st.occ = null; st.occKind = null; st.occId++; st.harass = 0; } p.atStall = -1; }
    if (p.atUrinal >= 0) { const u = this.urinals[p.atUrinal]; if (u.occ === p) u.occ = null; p.atUrinal = -1; }
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
    const st = tg.idx !== undefined ? this.stalls[tg.idx] : null;

    const fail = (why) => this._ev('intentFail', { pid: it.pid, why, act: t });
    const cdKey = (k) => `${k}`;
    const cdOf = (k) => (p.cds[cdKey(k)] || 0) > this.t;

    switch (t) {
      case 'pick': {
        const item = this.items.find(i => i.id === tg.id && !i.taken);
        if (!item || dist(p, item) > NUM.pickR) return fail('far');
        if (p.items.length >= 2) return fail('full');
        if (WEAPONS.has(item.kind) && p.items.some(i => WEAPONS.has(i))) return fail('weapon1');
        item.taken = true; p.items.push(item.kind);
        if (item.kind === 'broom' || item.kind === 'plunger') p._charges = { ...p._charges, [item.kind]: 2 };
        this._ev('pick', { pid: p.id, kind: item.kind }); return;
      }
      case 'move': { p.moveMode = tg.mode; return; }
      case 'enterStall': {
        if (!st || dist(p, st.doorPt) > NUM.actR + 30) return fail('far');
        if (this.t < p.reenterCDUntil) return fail('cd');
        if (st.occ || st.obstacle) return fail(st.obstacle ? 'dirty' : 'occupied');
        if (st.lockBy >= 0 && st.lockBy !== p.id && this.t < st.lockUntil) return fail('lock');
        this._startGuide(p, { type: 'enterStall', dur: NUM.guide.enter, target: tg, occId: st.occId });
        return;
      }
      case 'enterUrinal': {
        const u = this.urinals[tg.idx]; if (!u || dist(p, { x: u.x, y: u.doorY }) > NUM.actR + 20) return fail('far');
        if (u.occ) return fail('occupied');
        this._startGuide(p, { type: 'enterUrinal', dur: NUM.guide.enter, target: { kind: 'urinal', idx: tg.idx } });
        return;
      }
      case 'shove': {
        const v = this.players[tg.id]; if (!v || v.final || v.atUrinal < 0) return fail('target');
        if (dist(p, v) > NUM.actR + 20) return fail('far');
        if (cdOf(`shove${v.id}`)) return fail('cd');
        if (this.t < v.armorUntil || this.t < v.rageUntil) return fail('armor'); // C5：霸体内丢弃且 CD 不扣
        p.cds[`shove${v.id}`] = this.t + NUM.cd.shove;
        v.shoveCount++;
        if (v.shoveCount > NUM.shoveMax) v.rageUntil = this.t + NUM.prot.rage;
        v.armorUntil = this.t + NUM.prot.superarmor;
        if (v.relief) { v.relief.left = v.relief.total; } // 进度清零
        v.staggerUntil = this.t + NUM.prot.staggerS;
        this._ev('shove', { pid: p.id, vid: v.id });
        this._noise(v.x, v.y, 'shove'); return;
      }
      case 'poke': case 'bonk': case 'knock': {
        if (!st || !st.occ || dist(p, st.doorPt) > NUM.actR + 26) return fail('far');
        if (t === 'poke') { if (!this._hasWeapon(p, 'broom')) return fail('noitem'); if (cdOf(`poke${tg.idx}`)) return fail('cd'); }
        if (t === 'bonk') { if (!this._hasWeapon(p, 'plunger')) return fail('noitem'); if (cdOf(`poke${tg.idx}`)) return fail('cd'); }
        if (t === 'knock') { if (cdOf('knock')) return fail('cd'); p.cds['knock'] = this.t + NUM.cd.knock; }
        if (t === 'poke') p.cds[`poke${tg.idx}`] = this.t + NUM.cd.pokeDoor;
        this._startGuide(p, { type: t, dur: t === 'poke' ? NUM.guide.poke : t === 'bonk' ? NUM.guide.bonk : NUM.guide.knock, target: tg });
        return;
      }
      case 'wire': case 'ladder': {
        if (!st || !st.occ || dist(p, st.doorPt) > NUM.actR + 26) return fail('far');
        if (!this._hasWeapon(p, t)) return fail('noitem');
        this._startGuide(p, { type: t, dur: t === 'wire' ? NUM.guide.wire : NUM.guide.ladder, target: tg });
        return;
      }
      case 'sniff': {
        if (p.sniffLeft <= 0) return fail('used');
        if (!st || dist(p, st.doorPt) > NUM.sniff.range) return fail('far');
        this._startGuide(p, { type: 'sniff', dur: NUM.guide.sniff, target: tg });
        return;
      }
      case 'paper': {
        if (!st || !st.occ || dist(p, st.doorPt) > NUM.actR + 26) return fail('far');
        if (!p.items.includes('paper')) return fail('noitem');
        const occ = st.occ; if (occ === 'dean' || !occ.post) return fail('target');
        this._startGuide(p, { type: 'paper', dur: NUM.guide.paper, target: tg });
        return;
      }
      case 'clear': {
        if (!st || !st.obstacle || st.occ || dist(p, st.doorPt) > NUM.actR + 26) return fail('far');
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
      case 'giveup': {
        if (p.state === 'relief' || p.state === 'post') {
          if (p.relief) p.relief.left = p.relief.total; // 进度清零
          p.post = null; p.state = 'idle'; p.reenterCDUntil = this.t + NUM.cd.reenter;
          if (p.atStall >= 0) { const st2 = this.stalls[p.atStall]; if (st2.occ === p) { st2.occ = null; st2.occKind = null; st2.occId++; st2.harass = 0; } p.x = st2.doorPt.x; p.y = st2.doorPt.y - 6; p.atStall = -1; }
          if (p.atUrinal >= 0) { const u = this.urinals[p.atUrinal]; if (u.occ === p) u.occ = null; p.atUrinal = -1; p.y = u.doorY + 8; }
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
    }
  }

  /* ---- 段②：结算 ---- */
  _resolve(p, g, st) {
    p.charging = null;
    switch (g.type) {
      case 'enterStall': {
        if (!st || st.occ || st.obstacle || st.lockBy >= 0 && st.lockBy !== p.id && this.t < st.lockUntil) return this._ev('intentFail', { pid: p.id, why: 'occupied', act: g.type });
        st.occ = p; st.occKind = 'player'; st.occId++; st.harass = 0; p.atStall = st.idx;
        p.x = st.inPt.x; p.y = st.inPt.y;
        this._startRelief(p, p.debuff === 'poo' ? 'poop' : 'stallPee');
        this._ev('enterStall', { pid: p.id, idx: st.idx }); return;
      }
      case 'enterUrinal': {
        const u = this.urinals[g.target.idx]; if (u.occ) return this._ev('intentFail', { pid: p.id, why: 'occupied', type: g.type });
        u.occ = p; p.atUrinal = u.idx; p.x = u.x; p.y = u.doorY;
        this._startRelief(p, 'urinal'); this._ev('enterUrinal', { pid: p.id, idx: u.idx }); return;
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
        if (!p.final) { p.endurance = Math.min(100, p.endurance + 10); } // 未定型：人情回血
        this._ev('paperDone', { pid: p.id, vid: occ.id }); return;
      }
      case 'clear': {
        const kind = g.clearKind; if (kind === 'plunger') this._consume(p, 'plunger'); else this._consume(p, 'broom');
        st.obstacle = null;
        if (kind === 'broom' && this.rng() < NUM.splash.broom) { p.endurance -= NUM.splash.dmg; this._ev('splash', { pid: p.id }); if (p.endurance <= 0) this._finalize(p, 'blowout'); }
        this._ev('cleared', { pid: p.id, idx: st.idx, kind }); this._noise(st.doorPt.x, st.doorPt.y, 'clear'); return;
      }
    }
  }
  _resolvePush(p, g, st) {
    p.charging = null;
    if (st.occ === 'dean') { this._ev('caught', { pid: p.id }); this._finalize(p, 'dead'); return; }
    if (st.occ && st.occ !== 'dean') { this._addHarass(st, 3, p.id, g.type); return; } // 进入类 = 骚扰+3
    this._ev('pushEmpty', { pid: p.id, idx: g.target.idx });
  }
  _startRelief(p, kind) {
    let total = kind === 'urinal' ? NUM.relief.urinal : kind === 'stallPee' ? NUM.relief.stallPee : NUM.relief.poop;
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
      const dst = this.stalls[this.dean.stall]; if (dst && dst.occ === 'dean') { dst.occ = null; dst.occKind = null; dst.occId++; dst.harass = 0; }
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
    st.occ = null; st.occKind = null; st.occId++; st.harass = 0;
    st.lockBy = (st.c_first && st.c_first.pid) ?? byPid; st.c_first = null; // 优先锁给先启动者（C3）
    st.lockUntil = this.t + NUM.prot.lock;
    this._ev('evict', { idx: st.idx, by: byPid, vid: occ.id });
    this._noise(st.doorPt.x, st.doorPt.y, 'evict');
  }
  _noise(x, y, kind) { this._ev('noise', { x, y, kind }); }
}

/* ================= 移动（浏览器/AI 共用） ================= */
function movePlayer(p, vx, vy, dt) {
  if (p.final || p.atStall >= 0 || p.atUrinal >= 0 || p.charging && !p.charging.push && ['wire', 'ladder'].includes(p.charging.type)) return;
  if (p.charging) return; // 引导中不可移动（取消才行）
  if (p.staggerUntil > 0 && p._simT < p.staggerUntil) return;
  let sp = NUM.speed[p.moveMode] || NUM.speed.walk;
  if (p.endurance < 30) sp *= 0.85; // 夹腿
  const nx = p.x + vx * sp * dt, ny = p.y + vy * sp * dt;
  if (walkable(nx, p.y)) p.x = nx;
  if (walkable(p.x, ny)) p.y = ny;
  if (vx !== 0) p.dir = vx > 0 ? 1 : -1;
}

/* ================= AI（只使用 L0/L1/L2 信息） ================= */
class Bot {
  constructor(sim, pid) { this.sim = sim; this.p = sim.players[pid]; this.wps = null; this.wi = 0; this.nextThink = 0; this.role = null; this.sniffInfo = {}; }
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
      if (it.taken || dist(p, it) > 30) continue;
      if (p.items.length >= 2) break;
      const want = (p.debuff === 'poo' && (it.kind === 'comic' || it.kind === 'paper')) ||
        (WEAPONS.has(it.kind) && !p.items.some(i => WEAPONS.has(i)) && (it.kind !== 'ladder' && it.kind !== 'wire' || sim.rng() < 0.6)) ||
        it.kind === 'mask' || it.kind === 'soda';
      if (want) { sim.queue(p.id, 'pick', { id: it.id }); break; }
    }
    if (p.state === 'relief') {
      if (p.debuff === 'poo' && p.turboLeft > 0 && (p.relief.left > s(5) || p.endurance < 45)) sim.queue(p.id, 'turbo');
      return;
    }
    if (p.state === 'post') {
      if (p.post.shouted && sim.rng() < 0.4) sim.queue(p.id, 'break');
      else sim.queue(p.id, 'shout');
      return;
    }
    // 在厕所：找位置/行动
    if (inToilet(p)) {
      if (p.charging) return;
      // 小便优先
      if (p.debuff === 'pee') {
        const u = sim.urinals.find(u => !u.occ);
        if (u) { sim.queue(p.id, 'enterUrinal', { idx: u.idx }); return; }
      }
      const free = sim.stalls.find(st => !st.occ && !st.obstacle && !(st.lockBy >= 0 && st.lockBy !== p.id && sim.t < st.lockUntil));
      if (free) {
        sim.queue(p.id, 'enterStall', { idx: free.idx }); return;
      }
      // 清障
      const dirty = sim.stalls.find(st => st.obstacle && !st.occ);
      if (dirty && (p.items.includes('plunger') || dirty.obstacle === 'anaconda' && p.items.includes('broom'))) { sim.queue(p.id, 'clear', { idx: dirty.idx }); return; }
      // 红门处理
      const red = sim.stalls.find(st => st.occ && st.idx !== this._myStall());
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
        if (info.show === 'dean') this.sniffInfo[red.idx] = { show: 'dean' }; // 记住别碰
      }
      // 递纸（听到喊声）
      if (sim.lastShout && sim.t < sim.lastShout.until && p.items.includes('paper') && sim.rng() < 0.5) {
        const st = sim.stalls[sim.lastShout.stall];
        if (st && st.occ && st.occ.post && dist(p, st.doorPt) < NUM.actR + 26) { sim.queue(p.id, 'paper', { idx: st.idx }); return; }
      }
      return; // 原地等
    }
    // 赶路
    if (this.wps && this.wi < this.wps.length) {
      const w = this.wps[this.wi];
      if (dist(p, w) < 14) { this.wi++; return; }
      const dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy) || 1;
      movePlayer(p, dx / d, dy / d, 0.5 * (10 / TICK));
    }
  }
  _myStall() { return this.p.atStall; }
  onSniffResult(ev) { if (ev.pid === this.p.id) this.sniffInfo[ev.idx] = { show: ev.show }; }
}

/* ================= 浏览器端（渲染/输入/音频） ================= */
if (typeof window !== 'undefined') (function () {
  const qs = new URLSearchParams(location.search);
  const seed = qs.has('seed') ? (parseInt(qs.get('seed')) >>> 0) : (Date.now() & 0x7fffffff);
  const sim = new Sim(seed); const bots = sim.players.filter(p => p.bot).map(p => new Bot(sim, p.id));
  const you = sim.players[0];
  you.bot = false; bots.forEach(b => b.p.bot = true);
  // 强制你为随机 debuff（已在分配中）

  const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  const fx = []; const floats = [];
  let audioOn = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? false : true;

  function addFx(x, y, kind, color, n = 14) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 80; fx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.5, kind, color, rot: Math.random() * 6 }); } }
  function banner(txt, cls = '', dur = 2.4) {
    const host = document.getElementById('banners'); if (!host) return;
    const d = document.createElement('div'); d.className = 'banner ' + cls; d.textContent = txt;
    host.appendChild(d); setTimeout(() => d.remove(), dur * 1000);
  }
  function float(x, y, txt, color = '#fff') { floats.push({ x, y, txt, color, life: 1.6 }); }

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
    shove: () => beep(220, .12, 'square', .09),
    evict: () => { beep(180, .2, 'sawtooth', .1); setTimeout(() => beep(90, .3, 'sawtooth', .1), 120); },
    blowout: () => { beep(200, .6, 'sawtooth', .14); setTimeout(() => beep(120, .7, 'sawtooth', .12), 200); },
    done: () => { beep(784, .15, 'sine', .1); setTimeout(() => beep(1046, .25, 'sine', .1), 140); },
    caught: () => { beep(440, .2, 'square', .12); setTimeout(() => beep(233, .6, 'square', .12), 200); },
    pick: () => beep(1200, .08, 'sine', .07),
    noise: () => beep(300 + Math.random() * 200, .06, 'triangle', .04),
    anger: () => { beep(160, .4, 'sawtooth', .13); },
  };

  /* ---- 事件表现 ---- */
  function consumeEvents() {
    for (const ev of sim.events) {
      const p = sim.players[ev.pid] || null;
      switch (ev.type) {
        case 'bell':
          if (ev.kind === 'start') { banner('叮铃铃——下课！', 'big', 2); SND.bell(); }
          if (ev.kind === 'pre') { banner('上课预备铃！忍耐流失 ×1.5', 'warn', 2.5); SND.bell(); }
          if (ev.kind === 'soft') { banner('上课铃倒计时 45s！流失 ×3', 'danger', 3); SND.bell(); }
          break;
        case 'deanIn': banner('！！主任来了！！', 'danger', 2.6); SND.deanIn(); break;
        case 'deanOut': banner('主任哼着歌走了~', 'ok', 2); SND.deanOut(); break;
        case 'deanAnger': banner(`${(sim.players[ev.pid] || {}).name || '?'} 被主任没收道具轰出厕所！`, 'warn', 2.5); addFx(1150, 320, 'smoke', '#b91c1c', 22); SND.anger(); break;
        case 'shove': float(p.x, p.y - 20, '哎哟！', '#fca5a5'); SND.shove(); break;
        case 'harass': { const st = sim.stalls[ev.idx]; float(st.doorPt.x - 20, st.doorPt.y - 14, `骚扰 ${ev.val}/3`, '#fdba74'); SND.noise(); break; }
        case 'evict': { const st = sim.stalls[ev.idx]; addFx(st.doorPt.x, st.doorPt.y - 20, 'launch', '#f97316', 20); float(st.doorPt.x, st.doorPt.y - 40, '被逼出来了！', '#fb923c'); SND.evict(); break; }
        case 'final':
          if (ev.kind === 'done') { addFx(p.x, p.y, 'confetti', '#4ade80', 24); float(p.x, p.y - 30, `${p.name} 完成！${ev.time.toFixed(1)}s`, '#86efac'); SND.done(); }
          if (ev.kind === 'blowout') { addFx(p.x, p.y, 'smoke', '#9ca3af', 30); float(p.x, p.y - 30, `${p.name} 炸裆！`, '#f87171'); SND.blowout(); }
          if (ev.kind === 'dead') { addFx(p.x, p.y, 'smoke', '#7f1d1d', 26); float(p.x, p.y - 30, `${p.name} 被主任抓获！`, '#fca5a5'); SND.caught(); }
          break;
        case 'sniffResult': { const st = sim.stalls[ev.idx]; const m = { none: '没味儿~', player: '有人！(玩家)', dean: '主任？！' }; float(st.doorPt.x - 24, st.doorPt.y - 30, `👃${m[ev.show]}`, '#a5f3fc'); beep(520, .12, 'sine', .06); break; }
        case 'infect': float(p.x, p.y - 40, `被传染 -${ev.loss.toFixed(0)}`, '#a3e635'); break;
        case 'caught': banner('你被主任当场抓获……判负！', 'danger', 3); break;
        case 'postStuck': if (ev.pid === 0) showPostUI(true); float(p.x, p.y - 30, '没纸了！！', '#fbbf24'); break;
        case 'shout': float(p.x, p.y - 40, '谁有纸！！', '#fde047'); SND.noise(); break;
        case 'paperDone': banner(`${p.name} 递纸！人情+`, 'ok', 2); break;
        case 'pushStart': banner('推门中……听到动静可取消！(X)', 'warn', 2); beep(90, .3, 'sawtooth', .07); break;
        case 'pushCancel': banner('你缩回了手……保命要紧', 'ok', 1.6); break;
        case 'pushEmpty': float(1150, 400, '门后居然没人', '#ccc'); break;
        case 'turbo': float(p.x, p.y - 30, '涡轮增压！！', '#f472b6'); SND.noise(); break;
        case 'cleared': float(sim.stalls[ev.idx].doorPt.x, sim.stalls[ev.idx].doorPt.y - 30, '疏通！', '#a7f3d0'); break;
        case 'splash': float(p.x, p.y - 30, '溅了一身 -5', '#a16207'); break;
        case 'pick': float(p.x, p.y - 24, `+${ITEM_DEFS[ev.kind].name}`, '#e5e7eb'); SND.pick(); break;
        case 'giveup': float(p.x, p.y - 24, '弃坑…', '#d1d5db'); break;
        case 'intentFail': if (ev.pid === 0 && ev.why && ev.why !== 'busy') { const m = { far: '太远了', occupied: '已被占用', dirty: '堵了，需要工具', lock: '被优先锁占用', cd: '冷却中', noitem: '没有道具', full: '拿不下了(≤2件)', weapon1: '武器只能带1件', used: '用过一次了', cond: '现在不行', target: '目标无效', armor: '对方霸体中' }; float(you.x, you.y - 46, m[ev.why] || ev.why, '#fca5a5'); } break;
        case 'noise': { if (dist(you, ev) < 240) addFx(ev.x, ev.y, 'ripple', '#67e8f9', 6); SND.noise(); break; }
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
    if (k === 'f') sim.queue(0, 'soda');
    if (k === 'x' || k === 'escape') doCancel();
    if (k === '1' && you.state === 'post') sim.queue(0, 'shout');
    if (k === '2' && you.state === 'post') sim.queue(0, 'break');
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
  bindTap('btnF', () => sim.queue(0, 'soda'));
  bindTap('btnX', doCancel);
  bindTap('btnRun', () => cycleMode());
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
    // 拾取
    let best = null, bd = 1e9;
    for (const it of sim.items) { if (it.taken) continue; const d = dist(you, it); if (d < bd) { bd = d; best = it; } }
    if (best && bd <= NUM.pickR) { sim.queue(0, 'pick', { id: best.id }); return; }
    // 小便池
    for (const u of sim.urinals) {
      if (dist(you, { x: u.x, y: u.doorY }) <= NUM.actR + 14) {
        if (u.occ && u.occ !== you && !u.occ.final) { sim.queue(0, 'shove', { id: u.occ.id }); return; }
        if (!u.occ && you.debuff === 'pee') { sim.queue(0, 'enterUrinal', { idx: u.idx }); return; }
      }
    }
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
  document.getElementById('btnShout').addEventListener('click', () => { sim.queue(0, 'shout'); showPostUI(false); });
  document.getElementById('btnBreak').addEventListener('click', () => { sim.queue(0, 'break'); showPostUI(false); });

  /* ---- 渲染 ---- */
  function draw(now) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    // 房间
    for (const r of ROOMS) {
      ctx.fillStyle = r.id === 'toilet' ? '#cfe8e4' : r.id === 'class' ? '#f3e9d2' : '#e8e2d0';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#8a7f6a'; ctx.lineWidth = 4; ctx.strokeRect(r.x, r.y, r.w, r.h);
      if (r.label) { ctx.fillStyle = '#8a7f6a'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(r.label, r.x + r.w / 2, r.y + 16); }
    }
    // 厕所门缺口
    ctx.fillStyle = '#cfe8e4'; ctx.fillRect(1058, 290, 6, 62);
    // 小便池
    for (const u of sim.urinals) {
      ctx.fillStyle = '#dbe9ee'; ctx.fillRect(u.x - 28, 112, 56, 34);
      ctx.strokeStyle = '#7ba3b5'; ctx.strokeRect(u.x - 28, 112, 56, 34);
      ctx.fillStyle = '#7ba3b5'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('池' + (u.idx + 1), u.x, 132);
    }
    // 隔间
    for (const st of sim.stalls) {
      ctx.fillStyle = '#d6e5e0'; ctx.fillRect(st.x, st.y, st.w, st.h);
      ctx.strokeStyle = '#6b8f86'; ctx.lineWidth = 3; ctx.strokeRect(st.x, st.y, st.w, st.h);
      // 占用指示（视觉层）
      const occ = st.occ;
      ctx.beginPath(); ctx.arc(st.x + st.w / 2, st.y - 12, 8, 0, 7);
      ctx.fillStyle = occ ? '#ef4444' : '#22c55e'; ctx.fill();
      if (occ) { ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('有', st.x + st.w / 2, st.y - 8); }
      if (st.obstacle) { ctx.fillStyle = '#b45309'; ctx.font = '11px sans-serif'; ctx.fillText(st.obstacle === 'anaconda' ? '🐍巨蟒' : '🍓草莓塔', st.x + st.w / 2, st.y + 22); }
      if (st.hasPaper && !occ) { ctx.fillStyle = '#fff'; ctx.fillRect(st.x + st.w - 16, st.y + 8, 10, 10); ctx.strokeStyle = '#999'; ctx.strokeRect(st.x + st.w - 16, st.y + 8, 10, 10); }
      // 骚扰值
      for (let i = 0; i < st.harass && i < 3; i++) { ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(st.x + 10 + i * 12, st.y - 12, 4, 0, 7); ctx.fill(); }
      // 主任涂装
      if (occ === 'dean') { ctx.fillStyle = '#1f2937'; ctx.fillRect(st.x + 30, st.y + 26, 40, 44); ctx.fillStyle = '#dc2626'; ctx.fillRect(st.x + 46, st.y + 34, 8, 20); }
    }
    // 道具
    for (const it of sim.items) {
      if (it.taken) continue;
      ctx.fillStyle = ITEM_DEFS[it.kind].color;
      ctx.beginPath(); ctx.arc(it.x, it.y, 8, 0, 7); ctx.fill();
      ctx.strokeStyle = '#555'; ctx.stroke();
      ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ITEM_DEFS[it.kind].name[0], it.x, it.y + 3);
    }
    // 玩家
    for (const p of sim.players) {
      if (p.atStall >= 0 && p.final) { } // 已离场
      const x = p.x, y = p.y;
      ctx.globalAlpha = p.final ? 0.35 : 1;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fillStyle = p.final ? '#666' : p.color; ctx.fill();
      ctx.strokeStyle = p.id === 0 ? '#000' : '#00000055'; ctx.lineWidth = p.id === 0 ? 3 : 1.5; ctx.stroke();
      if (!p.final) {
        // 眼睛
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x + p.dir * 3 - 2, y - 3, 1.6, 0, 7); ctx.arc(x + p.dir * 3 + 3, y - 3, 1.6, 0, 7); ctx.fill();
        // debuff 标记
        ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(p.debuff === 'pee' ? '💧' : '💩', x, y + 24);
        // 名字 + 忍耐
        ctx.fillStyle = '#111'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(p.name + (p.endurance < 30 ? '(夹腿)' : ''), x, y - 26);
        const w = 30, e = clamp(p.endurance, 0, 100) / 100;
        ctx.fillStyle = '#00000033'; ctx.fillRect(x - w / 2, y - 22, w, 4);
        ctx.fillStyle = e > 0.5 ? '#4ade80' : e > 0.3 ? '#fbbf24' : '#ef4444'; ctx.fillRect(x - w / 2, y - 22, w * e, 4);
        // 状态
        if (p.state === 'relief') { const pr = 1 - p.relief.left / p.relief.total; ctx.fillStyle = '#00000044'; ctx.fillRect(x - 18, y + 28, 36, 5); ctx.fillStyle = '#38bdf8'; ctx.fillRect(x - 18, y + 28, 36 * pr, 5); }
        if (p.state === 'post') { ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('没纸!', x, y + 40); }
        if (p.staggerUntil > sim.t) { ctx.fillStyle = '#f87171'; ctx.font = '10px sans-serif'; ctx.fillText('晕', x + 16, y - 12); }
        if (sim.t < p.armorUntil || sim.t < p.rageUntil) { ctx.strokeStyle = sim.t < p.rageUntil ? '#f97316' : '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.stroke(); }
        // 引导条
        if (p.charging && !p.charging.push) {
          const g = p.charging, pr = clamp((sim.t - g.startT) / (g.resolveT - g.startT), 0, 1);
          ctx.fillStyle = '#00000044'; ctx.fillRect(x - 18, y - 36, 36, 5);
          ctx.fillStyle = '#a78bfa'; ctx.fillRect(x - 18, y - 36, 36 * pr, 5);
          ctx.fillStyle = '#7c3aed'; ctx.font = '9px sans-serif'; ctx.fillText({ wire: '撬锁..', ladder: '翻墙..', poke: '捅..', bonk: '拍..', knock: '拍门..', sniff: '闻..', paper: '递纸..', clear: '疏通..', enterStall: '进入..', enterUrinal: '站位..' }[g.type] || g.type, x, y - 40);
        }
        if (p.charging && p.charging.push) {
          const pr = clamp((p.charging.pushUntil - sim.t) / NUM.guide.push, 0, 1);
          ctx.fillStyle = '#00000066'; ctx.fillRect(x - 20, y - 40, 40, 6);
          ctx.fillStyle = '#ef4444'; ctx.fillRect(x - 20, y - 40, 40 * pr, 6);
          ctx.fillStyle = '#111'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('推门!(X撤)', x, y - 46);
        }
      }
      ctx.globalAlpha = 1;
    }
    // 特效
    for (const e of fx) {
      ctx.globalAlpha = clamp(e.life, 0, 1);
      if (e.kind === 'ripple') { ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, (1.6 - e.life) * 26, 0, 7); ctx.stroke(); }
      else { ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(e.x, e.y, 4 + (1 - e.life) * 5, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    for (const f of floats) { ctx.globalAlpha = clamp(f.life, 0, 1); ctx.fillStyle = f.color; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.txt, f.x, f.y - (1.6 - f.life) * 14); ctx.globalAlpha = 1; }
    // 主任在场红雾
    if (sim.dean.active) { ctx.fillStyle = 'rgba(185,28,28,0.07)'; ctx.fillRect(0, 0, cv.width, cv.height); }
  }

  function updateHud() {
    document.getElementById('timer').textContent = sim.phase === 'prep' ? `准备 ${Math.ceil(sim.prepLeft / TICK)}s` : `${Math.max(0, Math.ceil((NUM.bells.cap - sim.t) / TICK))}s`;
    document.getElementById('dbf').textContent = you.debuff === 'pee' ? '💧无尽尿意' : '💩大肠翻滚';
    const eb = document.getElementById('ebar'); eb.style.width = clamp(you.endurance, 0, 100) + '%';
    eb.style.background = you.endurance > 50 ? '#4ade80' : you.endurance > 30 ? '#fbbf24' : '#ef4444';
    document.getElementById('etxt').textContent = Math.max(0, Math.ceil(you.endurance));
    const items = you.items.map(k => `<span class="itm" style="border-color:${ITEM_DEFS[k].color}">${ITEM_DEFS[k].name}${(you._charges && you._charges[k]) ? '×' + you._charges[k] : ''}</span>`).join('');
    document.getElementById('items').innerHTML = items;
    document.getElementById('skills').textContent = `嗅闻${you.sniffLeft} ${you.debuff === 'poo' ? '涡轮' + you.turboLeft : ''}`;
    if (you.state === 'post' && you.post && !you.post.hasPaper && postUI.style.display === 'none' && !you.post.shouted) showPostUI(true);
    if (you.state !== 'post' && postUI.style.display !== 'none') showPostUI(false);
    if (sim.phase === 'end') showEnd();
  }

  function showEnd() {
    const ov = document.getElementById('endUI'); if (ov.style.display === 'flex') return;
    ov.style.display = 'flex';
    const mk = (db) => {
      const list = sim.players.filter(p => p.debuff === db).sort((a, b) => {
        if (a.final.kind === 'done' && b.final.kind !== 'done') return -1;
        if (b.final.kind === 'done' && a.final.kind !== 'done') return 1;
        if (a.final.kind === 'done' && b.final.kind === 'done') return a.final.time - b.final.time;
        return b.final.time - a.final.time;
      });
      const medal = ['🥇', '🥈', '🥉'];
      return list.map((p, i) => `<div class="row ${p.id === 0 ? 'me' : ''}">${medal[i] || ''} ${p.name} <b>${p.final.kind === 'done' ? p.final.time.toFixed(1) + 's' : p.final.kind === 'blowout' ? '炸裆' : '被抓'}</b></div>`).join('');
    };
    document.getElementById('boards').innerHTML =
      `<div class="board"><h3>尿王榜 💧</h3>${mk('pee')}</div><div class="board"><h3>屎王榜 💩</h3>${mk('poo')}</div>`;
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
      if (sim.phase === 'run' && !you.final) {
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
    draw(now); updateHud();
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

  function mkSim(seed) { const sim = new Sim(seed); sim.phase = 'run'; sim.bellT = sim.t; return sim; }
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

  // T5 C5：霸体内推搡 → 丢弃且 CD 不扣
  T('C5 霸体推搡CD不扣', () => {
    const sim = mkSim(5); const A = sim.players[0], V = sim.players[1];
    V.debuff = 'pee'; const u = sim.urinals[0]; u.occ = V; V.atUrinal = 0; V.x = u.x; V.y = u.doorY; sim._startRelief(V, 'urinal');
    place(sim, 0, u.x - 30, u.doorY);
    sim.queue(0, 'shove', { id: 1 }); step(sim, 2);
    ok(V.shoveCount === 1, '第一次应命中');
    V.armorUntil = sim.t + 40;
    const cdBefore = sim.players[0].cds['shove1'];
    sim.queue(0, 'shove', { id: 1 }); step(sim, 2);
    eq(V.shoveCount, 1, '霸体期应丢弃');
    eq(sim.players[0].cds['shove1'], cdBefore, '霸体拒绝不得刷新 CD');
    ok(V.relief.left <= V.relief.total && V.relief.left > 0, '霸体期进度不应被清零');
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
    sim.stalls[1].obstacle = 'berry'; sim.stalls[2].obstacle = 'anaconda'; // 主任唯一候选 = 0 号间
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
