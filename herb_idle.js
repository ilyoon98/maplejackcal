// 약초 방치 게임 화면. 규칙·확률·시세는 herb_idle_core.js가 맡고 여기서는 그리기·입력·저장만 한다.
//
// 게임 시간은 벽시계로 흘린다. 프레임마다 지난 시간만큼 advance()하므로 탭을 숨겼다 오거나
// 창을 닫았다 열어도 같은 규칙으로 따라잡는다(최대 8시간). 20초 넘게 비웠으면 정산 창을 띄운다.
(function () {
  'use strict';
  const Core = window.HerbIdleCore;
  const { C, ITEMS, KEYS, SELL, BUY, WORLD, PLATFORMS, HERBS, STATIONS } = Core;
  const STORE_KEY = 'herbIdleGame';
  const AWAY_MIN = 60;     // 이보다 오래(초) 비웠다 오면 정산 창
  const QUIET_MIN = 2;     // 이보다 길게 밀린 시간은 효과 없이 조용히 따라잡는다
  const LOG_MAX = 40;
  const TAB = Math.random().toString(36).slice(2, 10);
  const FONT = '"Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif';
  const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  // 큰 금액은 "1억 2,345만"처럼 줄인다.
  function short(n) {
    if (!Number.isFinite(n)) return '-';
    const neg = n < 0;
    n = Math.round(Math.abs(n));
    let s;
    if (n >= 1e8) {
      const eok = Math.floor(n / 1e8), man = Math.round((n % 1e8) / 1e4);
      s = fmt(eok) + '억' + (man ? ' ' + fmt(man) + '만' : '');
    } else if (n >= 1e4) {
      const man = Math.floor(n / 1e4), won = n % 1e4;
      s = fmt(man) + '만' + (won ? ' ' + fmt(won) : '');
    } else s = fmt(n);
    return (neg ? '-' : '') + s;
  }
  const pct = r => (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r * 100).toFixed(1) + '%';
  // 받침이 있으면 a(이·을), 없으면 b(가·를)
  function josa(word, a, b) {
    const c = word.charCodeAt(word.length - 1) - 0xAC00;
    return word + (c >= 0 && c < 11172 && c % 28 ? a : b);
  }
  function dur(sec) {
    const m = Math.floor(sec / 60), h = Math.floor(m / 60);
    if (h) return h + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '');
    return m ? m + '분' : Math.max(1, Math.round(sec)) + '초';
  }
  const hhmm = ms => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

  const ICON = { seed: '쥬니퍼베리씨앗.webp', oil: '쥬니퍼베리씨앗오일.webp', elixir: '소형재물획득의비약.webp',
    crystal: '최상급아이템결정.webp', stone: '현자의돌.webp', powder: '보라색가루.webp' };
  // 기록에는 거래와 시세 소식만 남긴다. 가공·채집 소식은 화면 안 알림으로만 보여 준다.
  const LOG_KINDS = ['sell', 'buy', 'news'];
  const IMG = {};
  Object.keys(ICON).forEach(k => { const im = new Image(); im.src = 'icons/craft/' + ICON[k]; IMG[k] = im; });
  const herbImg = new Image();
  herbImg.src = 'icons/craft/보라약초.webp';
  const ready = im => im.complete && im.naturalWidth > 0;

  // ---------------------------------------------------------------- 상태 · 저장

  let S = null;              // 게임 상태
  let log = [];              // [{at, kind, text}], 최신이 앞
  let wallAt = Date.now();   // S를 이 벽시계 시각까지 흘렸다
  let paused = false;        // 다른 탭이 이어받으면 멈춘다
  let savedAt = 0;
  let hudDirty = true, marketDirty = true, logDirty = true, newsFresh = false;
  let me = null;             // 불러온 내 캐릭터 {name, world, level, cls, image}
  let look = null;           // 그릴 준비가 끝난 캐릭터 이미지 {frames, anchor, headTop}

  const newSeed = () => (Math.random() * 4294967296) >>> 0;

  function readSave() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!d || d.v !== 1) return null;
      const game = Core.normalize(d.game);
      if (!game) return null;
      const now = Date.now();
      const wall = typeof d.wall === 'number' && d.wall <= now ? d.wall : now;
      const logs = Array.isArray(d.log)
        ? d.log.filter(l => l && typeof l.text === 'string' && typeof l.at === 'number' && LOG_KINDS.indexOf(l.kind) >= 0).slice(0, LOG_MAX) : [];
      return { game, wall, log: logs };
    } catch (e) { return null; }
  }
  function save() {
    if (paused || !S) return;
    savedAt = Date.now();
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, owner: TAB, wall: wallAt, game: S, log })); } catch (e) {}
  }

  function addLog(text, kind) {
    log.unshift({ at: Date.now(), kind: kind || '', text });
    if (log.length > LOG_MAX) log.length = LOG_MAX;
    logDirty = true;
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------------------------------------------------------------- 문장

  const WHY = {
    oil: { seed: () => '씨앗이 6개 있어야 오일을 만들 수 있어요 (지금 ' + fmt(S.inv.seed) + '개)',
      meso: () => '허브 오일병 살 메소(1,000)가 모자라요. 먼저 조금 팔아 주세요' },
    alchemy: { oil: () => '오일이 5개 있어야 연금술을 할 수 있어요 (지금 ' + fmt(S.inv.oil) + '개)',
      crystal: () => '최상급 아이템 결정 자동 구매에 실패했어요',
      stone: () => '현자의 돌 자동 구매에 실패했어요',
      meso: () => '최상결·현자의 돌과 포션 빈병을 살 메소가 모자라요' }
  };
  const STOP_WHY = {
    seed: '씨앗이 떨어져서 약초 캐기로 돌아왔어요',
    oil: '오일이 떨어져서 약초 캐기로 돌아왔어요',
    crystal: '최상급 아이템 결정이 떨어져서 약초 캐기로 돌아왔어요',
    stone: '현자의 돌이 떨어져서 약초 캐기로 돌아왔어요',
    meso: '메소가 모자라서 약초 캐기로 돌아왔어요'
  };
  const newsHit = n => Object.keys(n.hit).map(k => ITEMS[k].short + (n.hit[k] > 0 ? '▲' : '▼')).join(' ');

  // advance()가 알려 주는 사건. 화면에 보이는 동안만 효과를 붙인다.
  function onEvent(e) {
    switch (e.type) {
      case 'gather': fxGather(e); break;
      case 'oil': fxOil(e); break;
      case 'alchemy': fxAlchemy(); break;
      default: quietEvent(e); return;
    }
    hudDirty = true;
  }
  function quietEvent(e) {
    if (e.type === 'stop') {
      if (STOP_WHY[e.reason]) toast(STOP_WHY[e.reason]);
    } else if (e.type === 'autoBuy') {
      const names = e.items.map(row => ITEMS[row.key].short + ' ' + fmt(row.qty) + '개').join(' · ');
      addLog('🛒 연금술 재료 자동 구매 · ' + names + ' · -' + short(e.cost), 'buy');
      toast('연금술 재료 자동 구매 · ' + names + ' (-' + short(e.cost) + ' 메소)');
      pulseMeso();
    } else if (e.type === 'news') {
      addLog('📰 ' + e.news.text + ' (' + newsHit(e.news) + ')', 'news');
      newsFresh = true;
    } else if (e.type === 'tick') {
      marketDirty = true;
    }
    hudDirty = true;
  }

  // ---------------------------------------------------------------- 캔버스

  const stage = $('stage'), canvas = $('scene'), ctx = canvas.getContext('2d');
  let dpr = 1, scale = 1, viewW = WORLD.w, camX = 0, bg = null, stageW = 0;

  // 넓으면 밭 전체, 좁으면(모바일) 캐릭터를 따라가며 일부만 보여 준다.
  function resize(force) {
    const w = stage.clientWidth;
    if (!w || (w === stageW && !force)) return;
    stageW = w;
    viewW = w >= 720 ? WORLD.w : Math.min(WORLD.w, Math.max(440, w / 0.66));
    scale = w / viewW;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const h = Math.round(WORLD.h * scale);
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    bg = paintBackground();
    if (S) camX = camTarget();
  }
  function camTarget() {
    if (viewW >= WORLD.w) return 0;
    return clamp(Core.posAt(S.actor, S.t).x - viewW / 2, 0, WORLD.w - viewW);
  }

  // 작은 그리기 도구
  function rr(x, y, w, h, r, g) {
    g = g || ctx;
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fill();
  }
  function circ(x, y, r, g) { g = g || ctx; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  function ell(x, y, rx, ry, g) { g = g || ctx; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  function line(x1, y1, x2, y2, g) { g = g || ctx; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }

  // 고정된 배경(하늘·산·땅·발판)은 크기가 바뀔 때만 한 번 그려 둔다.
  function paintBackground() {
    const k = scale * dpr, G = WORLD.ground;
    const c = document.createElement('canvas');
    c.width = Math.ceil(WORLD.w * k);
    c.height = Math.ceil(WORLD.h * k);
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    let gr = g.createLinearGradient(0, 0, 0, G);
    gr.addColorStop(0, '#100d2a'); gr.addColorStop(0.5, '#251c4d'); gr.addColorStop(0.85, '#4a3068'); gr.addColorStop(1, '#6a3f6e');
    g.fillStyle = gr; g.fillRect(0, 0, WORLD.w, G + 10);
    gr = g.createRadialGradient(470, G + 40, 20, 470, G + 40, 560);
    gr.addColorStop(0, 'rgba(255,160,120,.3)'); gr.addColorStop(1, 'rgba(255,160,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, WORLD.w, G);
    gr = g.createRadialGradient(818, 70, 8, 818, 70, 72);
    gr.addColorStop(0, 'rgba(255,244,214,.42)'); gr.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = gr; g.fillRect(740, 0, 160, 150);
    g.fillStyle = '#fbf2d5'; circ(818, 70, 19, g);
    g.fillStyle = 'rgba(205,190,160,.45)'; circ(811, 64, 4, g); circ(824, 77, 3, g); circ(823, 61, 2, g);
    ridge(g, '#2c2253', G - 92, [[0.006, 26, 0.3], [0.017, 12, 1.7], [0.041, 5, 0.6]]);
    ridge(g, '#211a42', G - 50, [[0.009, 20, 2.1], [0.023, 9, 0.4], [0.05, 4, 1.1]]);
    gr = g.createLinearGradient(0, G, 0, WORLD.h);
    gr.addColorStop(0, '#5a3b29'); gr.addColorStop(1, '#24170f');
    g.fillStyle = gr; g.fillRect(0, G, WORLD.w, WORLD.h - G);
    g.fillStyle = 'rgba(120,88,64,.5)';
    for (let i = 0; i < 26; i++) ell((i * 157.3) % WORLD.w, G + 18 + ((i * 41.7) % 40), 3 + (i % 3), 2 + (i % 2), g);
    grass(g, 0, WORLD.w, G);
    PLATFORMS.forEach(p => platform(g, p));
    return c;
  }
  function ridge(g, color, y0, waves) {
    g.beginPath();
    g.moveTo(0, WORLD.ground + 2);
    for (let x = 0; x <= WORLD.w; x += 8) {
      let y = y0;
      waves.forEach(w => { y -= Math.sin(x * w[0] + w[2]) * w[1]; });
      g.lineTo(x, y);
    }
    g.lineTo(WORLD.w, WORLD.ground + 2);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }
  function grass(g, x1, x2, y) {
    g.fillStyle = '#2f5f28'; g.fillRect(x1, y + 2, x2 - x1, 4);
    g.fillStyle = '#4c9a3d'; g.fillRect(x1, y - 4, x2 - x1, 7);
    g.fillStyle = '#6cc155';
    for (let x = x1 + 2, i = 0; x < x2 - 2; x += 5, i++) {
      const h = 3 + ((i * 7) % 4);
      g.beginPath(); g.moveTo(x - 2, y - 3); g.lineTo(x, y - 3 - h); g.lineTo(x + 2, y - 3); g.fill();
    }
  }
  function platform(g, p) {
    const w = p.x2 - p.x1, y = p.y;
    g.fillStyle = '#5b3d2a';
    g.beginPath();
    g.moveTo(p.x1, y);
    g.lineTo(p.x2, y);
    g.quadraticCurveTo(p.x2 + 2, y + 16, p.x2 - 14, y + 20);
    g.lineTo(p.x1 + 14, y + 20);
    g.quadraticCurveTo(p.x1 - 2, y + 16, p.x1, y);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(p.x1 + 12, y + 14, w - 24, 6);
    g.strokeStyle = '#3d2a1d'; g.lineWidth = 1.4;
    for (let x = p.x1 + 24; x < p.x2 - 16; x += 37) {
      g.beginPath(); g.moveTo(x, y + 19); g.quadraticCurveTo(x + 4, y + 27, x - 2, y + 34); g.stroke();
    }
    grass(g, p.x1 - 3, p.x2 + 3, y);
  }

  // 반짝이는 별과 반딧불은 매 프레임 그린다. 위치는 매번 같게 고정.
  const STARS = [];
  for (let i = 0; STARS.length < 44; i++) {
    const x = (i * 211.7) % WORLD.w, y = 10 + ((i * 97.3) % 170);
    if (Math.hypot(x - 818, y - 70) > 40) STARS.push({ x, y, r: 0.7 + (i % 3) * 0.35, p: i * 1.37, s: 0.5 + (i % 5) * 0.22 });
  }
  const FLIES = Array.from({ length: 12 }, (_, i) => ({ x: 60 + (i * 83.3) % 860, y: 150 + (i * 47.9) % 150, p: i * 2.1, s: 0.35 + (i % 4) * 0.12 }));

  // ---------------------------------------------------------------- 효과

  const drops = [], floats = [], parts = [];
  const amb = { oil: 0, drip: 0, alch: 0, bubble: 0 };
  function addPart(o) {
    if (parts.length > 280) return;
    parts.push(Object.assign({ kind: 'dot', age: 0, life: 0.8, vx: 0, vy: 0, g: 0, size: 2, color: '#fff', rot: 0, vr: 0 }, o));
  }
  function sparks(x, y, color, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(30, spread || 90);
      addPart({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 60, life: rnd(0.5, 0.9), size: rnd(1.4, 2.4), color });
    }
  }
  function floatText(text, x, y, color, icon, big) {
    floats.push({ text, x, y, color, icon, big, age: 0, life: big ? 1.5 : 1.2 });
    if (floats.length > 24) floats.shift();
  }
  function clearFx() { drops.length = 0; floats.length = 0; parts.length = 0; }

  function fxGather(e) {
    const p = HERBS[e.herb];
    for (let i = 0; i < 7; i++) {
      addPart({ kind: 'leaf', x: p.x + rnd(-8, 8), y: p.y - rnd(10, 34), vx: rnd(-55, 55), vy: rnd(-100, -30), g: 170, life: rnd(0.7, 1.1),
        color: i % 3 ? '#5cb85c' : '#a48cf0', size: rnd(1.8, 3), rot: rnd(0, 6), vr: rnd(-9, 9) });
    }
    if (!e.seeds) return;
    for (let i = 0; i < e.seeds; i++) {
      drops.push({ x: p.x + rnd(-4, 4), y: p.y - 26, vx: rnd(-70, 70), vy: rnd(-240, -170), g: p.y, st: 'air', age: 0, rest: 0, k: 0, sx: 0, sy: 0 });
    }
    const big = e.seeds >= 4;
    floatText('+' + e.seeds, p.x, p.y - 62, big ? '#ffd65a' : '#d6ff9a', 'seed', big);
    if (big) sparks(p.x, p.y - 34, '#ffd65a', 12, 120);
  }
  function fxOil(e) {
    const st = STATIONS.oil;
    if (e.ok) {
      floatText('+1', st.x - 34, st.y - 46, '#d7b8ff', 'oil');
      sparks(st.x - 42, st.y - 14, '#c79bff', 6);
    } else {
      // 보라색 가루가 솥에서 펑 터져 심마니를 덮친다 → 기절
      floatText('꽝! 기절', st.x + 30, st.y - 86, '#d9c8ff', 'powder', true);
      for (let i = 0; i < 16; i++) {
        const a = rnd(-Math.PI, 0), v = rnd(40, 120);
        addPart({ kind: 'smoke', x: st.x + rnd(-6, 6), y: st.y - 58, vx: Math.cos(a) * v + 25, vy: Math.sin(a) * v, g: -10,
          life: rnd(0.9, 1.5), size: rnd(3, 6), color: i % 3 ? '#9b6bd6' : '#c9a6ff' });
      }
      sparks(st.stand, st.y - 40, '#c9a6ff', 10, 90);
    }
  }
  function fxAlchemy() {
    const st = STATIONS.alchemy;
    floatText('+' + C.ALCH_YIELD, st.x, st.y - 70, '#a6ecff', 'elixir', true);
    addPart({ kind: 'ring', x: st.x, y: st.y - 1, life: 0.7, size: 70, color: '#9fe3ff' });
    sparks(st.x, st.y - 44, '#9fe3ff', 16, 120);
  }

  function updateFx(dt) {
    const ap = Core.posAt(S.actor, S.t);
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.age += dt;
      if (d.st === 'air') {
        d.vy += 780 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.y >= d.g) {
          d.y = d.g;
          if (d.vy > 150) { d.vy *= -0.32; d.vx *= 0.5; } else d.st = 'rest';
        }
      } else if (d.st === 'rest') {
        d.rest += dt;
        if (d.rest > 0.3) { d.st = 'fly'; d.sx = d.x; d.sy = d.y; }
      } else {
        d.k += dt / 0.32;
        const e = Math.min(1, d.k) ** 2;
        d.x = d.sx + (ap.x - d.sx) * e;
        d.y = d.sy + (ap.y - 28 - d.sy) * e - Math.sin(Math.min(1, d.k) * Math.PI) * 18;
        if (d.k >= 1) { drops.splice(i, 1); addPart({ kind: 'spark', x: ap.x, y: ap.y - 28, life: 0.35, size: 2.4, color: '#d6ff9a' }); continue; }
      }
      if (d.age > 4) drops.splice(i, 1);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].age += dt;
      if (floats[i].age >= floats[i].life) floats.splice(i, 1);
    }
    // 작업대가 돌아가는 동안 연기·물방울·반짝이
    const working = S.actor.phase === 'work';
    if (working && S.mode === 'oil') {
      const st = STATIONS.oil;
      amb.oil += dt;
      while (amb.oil > 0.22) {
        amb.oil -= 0.22;
        addPart({ kind: 'smoke', x: st.x + rnd(-9, 9), y: st.y - 62, vx: rnd(-6, 6), vy: rnd(-32, -18), life: 1.4, size: rnd(2.5, 4.5), color: '#d9d0ee' });
      }
      amb.drip += dt;
      if (amb.drip > 0.45) { amb.drip = 0; addPart({ kind: 'drip', x: st.x - 42, y: st.y - 28, vy: 10, g: 260, life: 0.22, size: 1.6, color: '#c79bff' }); }
    } else if (working && S.mode === 'alchemy') {
      const st = STATIONS.alchemy;
      amb.alch += dt;
      while (amb.alch > 0.09) {
        amb.alch -= 0.09;
        addPart({ kind: 'spark', x: st.x + rnd(-42, 42), y: st.y - rnd(0, 6), vy: rnd(-55, -25), life: rnd(0.6, 1), size: rnd(1.2, 2.2), color: '#9fe3ff' });
      }
      amb.bubble += dt;
      if (amb.bubble > 0.3) {
        amb.bubble = 0;
        const fx = [[-6, '#7fe6f5'], [10, '#ffa6d2'], [24, '#ffe28a']][Math.floor(rnd(0, 3))];
        addPart({ kind: 'bubble', x: st.x + fx[0] + rnd(-1.5, 1.5), y: st.y - 56, vx: rnd(-4, 4), vy: rnd(-22, -12), life: 0.9, size: rnd(1.4, 2.2), color: fx[1] });
      }
    }
  }

  // ---------------------------------------------------------------- 장면 그리기

  function draw(now, dt) {
    const k = scale * dpr;
    const target = camTarget();
    camX += (target - camX) * Math.min(1, dt * 5);
    if (Math.abs(target - camX) < 0.3) camX = target;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bg) ctx.drawImage(bg, Math.round(-camX * k), 0);
    ctx.setTransform(k, 0, 0, k, -camX * k, 0);
    ctx.imageSmoothingEnabled = true;
    drawSky(now);
    drawRoutes(now);
    drawOil(now);
    drawAlchemy(now);
    drawHerbs(now);
    drawDrops();
    drawActor(now);
    drawParts();
    drawFloats();
  }

  function drawSky(now) {
    ctx.fillStyle = '#fff';
    STARS.forEach(s => {
      ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(now * s.s + s.p));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    });
    if (!REDUCED) {
      FLIES.forEach(f => {
        const x = f.x + Math.sin(now * f.s + f.p) * 26, y = f.y + Math.sin(now * f.s * 1.7 + f.p * 2) * 10;
        const a = 0.35 + 0.65 * Math.max(0, Math.sin(now * 1.2 + f.p));
        ctx.globalAlpha = a * 0.22; ctx.fillStyle = '#d9c4ff'; circ(x, y, 4.5);
        ctx.globalAlpha = a; ctx.fillStyle = '#f6efff'; circ(x, y, 1.2);
      });
    }
    ctx.globalAlpha = 1;
  }

  // 층 이동 경로를 덩굴 사다리처럼 보여 줘서 캐릭터의 점프·오르기 동작이 장면 안에서 읽히게 한다.
  function drawRoutes(now) {
    const ladder = (x, top, bottom) => {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(now * 1.8 + x) * 0.05;
      ctx.strokeStyle = '#8269b8'; ctx.lineWidth = 3;
      line(x - 8, top, x - 8, bottom); line(x + 8, top, x + 8, bottom);
      ctx.strokeStyle = '#b49adb'; ctx.lineWidth = 2;
      for (let y = top + 9; y < bottom; y += 15) line(x - 7, y, x + 7, y);
      ctx.restore();
    };
    ladder(240, 246, WORLD.ground);
    ladder(748, 204, WORLD.ground);
  }

  function sign(x, y, text, on) {
    ctx.save();
    ctx.font = '700 11px ' + FONT;
    const w = ctx.measureText(text).width + 18;
    ctx.fillStyle = on ? 'rgba(52,34,100,.92)' : 'rgba(16,12,36,.78)';
    rr(x - w / 2, y - 9.5, w, 19, 6);
    ctx.strokeStyle = on ? '#ffd65a' : 'rgba(255,214,90,.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = on ? '#ffe9a8' : '#d9d2ee';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }
  function floorGlow(x, y, rx, color) {
    const gr = ctx.createRadialGradient(x, y, 2, x, y, rx);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.3); ctx.translate(-x, -y);
    ctx.fillStyle = gr; circ(x, y, rx);
    ctx.restore();
  }
  function flame(x, y, w, h, now) {
    const f = 0.85 + 0.12 * Math.sin(now * 17) + 0.07 * Math.sin(now * 29);
    ctx.fillStyle = '#ff7a2f';
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.6, y - h * f * 0.7, x, y - h * f);
    ctx.quadraticCurveTo(x + w * 0.6, y - h * f * 0.7, x + w, y); ctx.fill();
    ctx.fillStyle = '#ffd65a';
    ctx.beginPath(); ctx.moveTo(x - w * 0.5, y); ctx.quadraticCurveTo(x - w * 0.3, y - h * f * 0.4, x, y - h * f * 0.62);
    ctx.quadraticCurveTo(x + w * 0.3, y - h * f * 0.4, x + w * 0.5, y); ctx.fill();
  }

  function drawOil(now) {
    const st = STATIONS.oil, chosen = S.mode === 'oil', active = chosen && S.actor.phase === 'work';
    if (chosen) floorGlow(st.x + 10, st.y, 80, 'rgba(180,140,255,.35)');
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.fillStyle = '#41445a'; rr(-30, -30, 60, 30, 5);
    ctx.fillStyle = '#555a73'; rr(-32, -33, 64, 7, 3);
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
    [-24, -14].forEach((yy, r) => {
      line(-30, yy, 30, yy);
      for (let x = -30 + (r ? 10 : 0); x < 30; x += 20) line(x, yy, x, yy + 10);
    });
    ctx.fillStyle = '#160f1c';
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-11, -8); ctx.arc(0, -8, 11, Math.PI, 0); ctx.lineTo(11, 0); ctx.fill();
    flame(0, -1, active ? 9 : 5, active ? 15 : 6, now);
    ctx.fillStyle = '#8c4f24'; ell(0, -45, 25, 16);
    ctx.fillStyle = '#b8733a'; ell(0, -46, 23.5, 14.5);
    ctx.fillStyle = 'rgba(255,220,170,.35)'; ell(-9, -51, 7, 3.5);
    ctx.fillStyle = '#6e3a18'; ell(0, -58, 17, 4.4);
    ctx.fillStyle = active ? '#a46be8' : '#7d4fc4'; ell(0, -58, 14.5, 3);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#6a3a18'; ctx.lineWidth = 3.6;
    ctx.beginPath(); ctx.moveTo(-20, -53); ctx.quadraticCurveTo(-40, -64, -42, -40); ctx.lineTo(-42, -29); ctx.stroke();
    ctx.strokeStyle = '#b06d36'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = 'rgba(200,190,255,.16)'; circ(-42, -11, 10.5); ctx.fillRect(-45, -27, 6, 9);
    ctx.fillStyle = '#8e4fd1';
    ctx.beginPath(); ctx.arc(-42, -11, 9.6, 0.1, Math.PI - 0.1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(235,225,255,.75)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(-42, -11, 10.5, -1.25, Math.PI + 1.25, true); ctx.stroke();
    line(-45, -20.5, -45, -27); line(-39, -20.5, -39, -27);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ell(-46, -15, 1.8, 3.4);
    ctx.restore();
    sign(st.x, st.y - 94, '씨앗 오일 제련', chosen);
  }

  function flask(x, y, color, shape) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(220,240,255,.16)';
    ctx.strokeStyle = 'rgba(230,245,255,.8)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (shape === 0) { ctx.arc(0, -7, 7, 0, Math.PI * 2); ctx.rect(-2, -19, 4, 6); }
    else if (shape === 1) { ctx.moveTo(-2.5, -20); ctx.lineTo(-2.5, -13); ctx.lineTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(2.5, -13); ctx.lineTo(2.5, -20); ctx.closePath(); }
    else { ctx.rect(-3, -13, 6, 13); }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    if (shape === 0) ctx.arc(0, -7, 6.2, 0.15, Math.PI - 0.15);
    else if (shape === 1) { ctx.moveTo(-5.4, -6); ctx.lineTo(-7.4, -0.6); ctx.lineTo(7.4, -0.6); ctx.lineTo(5.4, -6); }
    else ctx.rect(-2.4, -7, 4.8, 6.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawAlchemy(now) {
    const st = STATIONS.alchemy, chosen = S.mode === 'alchemy', active = chosen && S.actor.phase === 'work';
    ctx.save();
    ctx.translate(st.x, st.y);
    const glow = active ? 0.95 : chosen ? 0.5 : 0.22;
    if (active) { ctx.fillStyle = 'rgba(127,214,255,.13)'; ell(0, -1, 47, 10.5); }
    ctx.strokeStyle = 'rgba(127,214,255,' + glow + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, -1, 47, 10.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([5, 6]);
    ctx.lineDashOffset = -now * (active ? 30 : 5);
    ctx.beginPath(); ctx.ellipse(0, -1, 38, 7.8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#5e3b20'; ctx.fillRect(-29, -31, 4.5, 31); ctx.fillRect(24.5, -31, 4.5, 31);
    ctx.fillStyle = '#4a2e18'; ctx.fillRect(-27, -13, 54, 3);
    ctx.fillStyle = '#8a5a33'; rr(-36, -37, 72, 7.5, 3);
    ctx.fillStyle = '#a8713f'; rr(-36, -37, 72, 2.6, 1.5);
    ctx.fillStyle = '#5d3699'; rr(-33, -43, 16, 6, 1.5);
    ctx.fillStyle = '#efe3c4'; ctx.fillRect(-31.5, -41.3, 13, 1.2); ctx.fillRect(-31.5, -39.2, 13, 1.2);
    flask(-6, -37, '#5fd3e8', 0);
    flask(10, -37, '#ff8ac2', 1);
    flask(24, -37, '#ffd65a', 2);
    ctx.restore();
    sign(st.x, st.y - 94, '연금술', chosen);
  }

  const HERB_H = 50, HERB_W = HERB_H * 67 / 77;
  const backOut = k => { const c = 1.9; k -= 1; return 1 + (c + 1) * k * k * k + c * k * k; };
  function leaf(x, y, rot, len, wid) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ell(len / 2, 0, len / 2, wid / 2); ctx.restore();
  }
  function drawHerbs(now) {
    const a = S.actor;
    S.herbs.forEach((h, i) => {
      const p = HERBS[i];
      if (h.readyAt > S.t) {
        // 다시 자라는 중: 꽃 없는 새싹이 커지다 끝에 봉오리가 맺힌다
        const span = h.cutAt >= 0 ? h.readyAt - h.cutAt : 1;
        const gr = h.cutAt >= 0 ? clamp((S.t - h.cutAt) / span, 0, 1) : 0;
        ctx.save();
        ctx.translate(p.x, p.y + 1);
        ctx.scale(0.4 + gr * 0.6, 0.4 + gr * 0.6);
        ctx.strokeStyle = '#2f7d36'; ctx.lineWidth = 2; line(0, 0, 0, -15);
        ctx.fillStyle = '#5cb85c'; leaf(0, -6, -2.5, 10, 4.5); leaf(0, -10, -0.6, 10, 4.5);
        if (gr > 0.7) { ctx.fillStyle = '#9b7fe8'; circ(0, -17, 1 + 2.4 * (gr - 0.7) / 0.3); }
        ctx.restore();
        return;
      }
      const since = S.t - h.readyAt;
      const sc = h.cutAt >= 0 && since < 0.45 ? 0.5 + 0.5 * backOut(since / 0.45) : 1;
      const digging = a.phase === 'work' && a.herb === i;
      const rot = Math.sin(now * 1.5 + i * 1.9) * 0.03 + (digging ? Math.sin(now * 30) * 0.05 : 0);
      ctx.save();
      ctx.translate(p.x, p.y + 2);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      if (ready(herbImg)) {
        ctx.drawImage(herbImg, -HERB_W / 2, -HERB_H, HERB_W, HERB_H);
      } else {
        ctx.fillStyle = '#4caf50'; leaf(0, -2, -2.4, 14, 6); leaf(0, -2, -0.7, 14, 6);
        ctx.fillStyle = '#9b7fe8'; circ(-6, -30, 7); circ(8, -24, 6); circ(0, -40, 8);
      }
      ctx.restore();
    });
  }

  function drawDrops() {
    if (!ready(IMG.seed)) return;
    ctx.imageSmoothingEnabled = false;
    drops.forEach(d => ctx.drawImage(IMG.seed, d.x - 7.5, d.y - 15, 15, 15));
    ctx.imageSmoothingEnabled = true;
  }

  function drawParts() {
    parts.forEach(p => {
      const k = p.age / p.life;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.kind === 'leaf') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ell(0, 0, p.size * 1.7, p.size * 0.8); ctx.restore();
      } else if (p.kind === 'dirt') {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.kind === 'smoke') {
        ctx.globalAlpha = Math.max(0, 0.45 * (1 - k));
        circ(p.x, p.y, p.size * (1 + k * 1.8));
      } else if (p.kind === 'ring') {
        ctx.lineWidth = 2.4 * (1 - k);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * (0.25 + k), p.size * 0.22 * (0.25 + k), 0, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'bubble') {
        ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = Math.max(0, (1 - k) * 0.3); circ(p.x, p.y, p.size * 2.4);
        ctx.globalAlpha = Math.max(0, 1 - k); circ(p.x, p.y, p.size * 0.7);
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    floats.forEach(f => {
      const k = f.age / f.life;
      const y = f.y - 30 * (1 - (1 - k) * (1 - k));
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = (f.big ? '800 17px ' : '800 13px ') + FONT;
      const s = f.big ? 18 : 14, tw = ctx.measureText(f.text).width;
      const icon = f.icon && ready(IMG[f.icon]) ? IMG[f.icon] : null;
      let x = f.x - ((icon ? s + 3 : 0) + tw) / 2;
      if (icon) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(icon, x, y - s / 2, s, s);
        ctx.imageSmoothingEnabled = true;
        x += s + 3;
      }
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = 'rgba(14,10,32,.9)';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    });
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- 캐릭터

  const SKIN = '#ffdcb8', HAIR = '#5b3824', SHIRT = '#f3e7cc', OVER = '#3f8a5f', OVER_D = '#2e6a48';
  let swing = { start: -1, idx: -1 }, tele = { start: -1, half: false };

  function rake(hx, hy, th) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(th);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#6e4522'; ctx.lineWidth = 3.2; line(-9, 0, 26, 0);
    ctx.strokeStyle = '#b8823f'; ctx.lineWidth = 1.8; line(-9, 0, 26, 0);
    ctx.strokeStyle = '#8b939f'; ctx.lineWidth = 1.3;
    for (let i = -2; i <= 2; i++) { const a = i * 0.24; line(26, 0, 26 + Math.cos(a) * 10, Math.sin(a) * 10); }
    ctx.strokeStyle = '#dfe5ee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(26, 0, 3.6, -0.75, 0.75); ctx.stroke();
    ctx.restore();
  }
  function arm(sx, sy, a, back) {
    const hx = sx + Math.cos(a) * 9, hy = sy + Math.sin(a) * 9;
    ctx.lineCap = 'round';
    ctx.strokeStyle = back ? '#d8cbae' : SHIRT; ctx.lineWidth = 4; line(sx, sy, hx, hy);
    ctx.fillStyle = back ? '#ecc49f' : SKIN; circ(hx, hy, 2.3);
    return { x: hx, y: hy };
  }
  function legs(sw) {
    [[-3.5, sw], [3.5, -sw]].forEach(l => {
      ctx.save();
      ctx.translate(l[0], -12);
      ctx.rotate(l[1] * 0.5);
      ctx.fillStyle = '#355f8c'; rr(-2.6, 0, 5.2, 10, 2);
      ctx.fillStyle = '#3a281d'; rr(-2.8, 8.6, 6.6, 3.6, 1.6);
      ctx.restore();
    });
  }
  function head(now, dizzy) {
    ctx.fillStyle = HAIR; circ(-1.5, -41, 12);
    ctx.fillStyle = SKIN; circ(1, -40.5, 11);
    ctx.fillStyle = HAIR;
    ctx.beginPath(); ctx.moveTo(-10.5, -41); ctx.quadraticCurveTo(-5, -55, 10.5, -47);
    ctx.quadraticCurveTo(5, -44.5, 1.5, -44); ctx.quadraticCurveTo(-4, -45, -10.5, -38); ctx.fill();
    ctx.fillStyle = '#2a1b12';
    ctx.strokeStyle = '#2a1b12';
    if (dizzy) {
      // 기절: 눈은 X, 입은 물결
      ctx.lineWidth = 1.1;
      [[4.8, -40], [9.3, -40]].forEach(e => { line(e[0] - 1.6, e[1] - 1.6, e[0] + 1.6, e[1] + 1.6); line(e[0] - 1.6, e[1] + 1.6, e[0] + 1.6, e[1] - 1.6); });
      ctx.strokeStyle = '#8a4b3a'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(4.6, -35.6); ctx.quadraticCurveTo(5.7, -37, 6.8, -35.6); ctx.quadraticCurveTo(7.9, -34.2, 9, -35.6); ctx.stroke();
    } else {
      if (now % 3.7 < 0.12) { ctx.fillRect(3.4, -40.4, 3, 1.1); ctx.fillRect(7.9, -40.4, 2.6, 1.1); }
      else {
        ell(4.8, -40, 1.5, 2.3); ell(9.3, -40, 1.4, 2.2);
        ctx.fillStyle = '#fff'; circ(5.2, -40.9, 0.55); circ(9.7, -40.9, 0.5);
      }
      ctx.strokeStyle = '#8a4b3a'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(6.6, -36.2, 1.6, 0.2, Math.PI - 0.4); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,120,120,.35)'; ell(8.6, -36.4, 2.2, 1.2);
    // 밀짚모자
    ctx.fillStyle = '#c9a24a'; ell(0.5, -48.6, 17.5, 4.8);
    ctx.fillStyle = '#efcf72'; ell(0.5, -49.4, 16.8, 4.1);
    ctx.fillStyle = '#f2d47e'; rr(-7.5, -59.5, 16, 11, 5);
    ctx.fillStyle = '#c4513b'; ctx.fillRect(-7.5, -52.6, 16, 2.6);
    ctx.strokeStyle = 'rgba(160,120,40,.5)'; ctx.lineWidth = 0.6;
    line(-4, -58.5, -4, -53); line(0.5, -59.3, 0.5, -53); line(5, -58.5, 5, -53);
  }

  function hero(x, y, face, pose, anim, now, vis, kind) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = vis;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ell(0, 1, 13, 3.2);
    ctx.scale(face, 1);
    const sw = pose === 'walk' ? Math.sin(anim * 13) : pose === 'ladder' ? Math.sin(anim * 10) : 0;
    const bob = pose === 'walk' ? Math.abs(Math.cos(anim * 13)) * 1.6 : pose === 'idle' ? Math.sin(now * 2.2) * 0.6 : 0;
    const dip = pose === 'gather' ? 1 + Math.max(0, Math.sin(anim * 11)) * 1.6 : pose === 'stun' ? 1.5 : 0;
    if (pose === 'stun') ctx.rotate(Math.sin(now * 5) * 0.07);   // 비틀비틀
    legs(sw);
    ctx.translate(0, -bob + dip);
    if (pose === 'craft' || pose === 'stun') rake(-6, -16, -2.1);
    const stir = Math.sin(anim * (kind === 'oil' ? 7 : 4));
    arm(-4, -27, pose === 'walk' ? 1.4 - sw * 0.6 : pose === 'craft' ? (kind === 'oil' ? 0.2 + stir * 0.35 : -0.9 + stir * 0.25) : pose === 'stun' ? 1.55 : 1.25, true);
    ctx.fillStyle = SHIRT; rr(-8, -31, 16, 10, 4);
    ctx.fillStyle = OVER; rr(-8.5, -25.5, 17, 14.5, 4.5);
    ctx.fillStyle = OVER_D; ctx.fillRect(-6.4, -31, 2.4, 7); ctx.fillRect(4, -31, 2.4, 7); rr(-3.5, -21, 7, 5, 1.5);
    ctx.fillStyle = '#ffd65a'; circ(-5.2, -24.6, 1); circ(5.2, -24.6, 1);
    head(now, pose === 'stun');
    if (pose === 'gather') {
      const th = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(anim * 11));
      const hnd = arm(4, -26, th + 0.3, false);
      rake(hnd.x, hnd.y, th);
      circ(hnd.x, hnd.y, 2.3);
    } else if (pose === 'craft') {
      arm(4, -26, kind === 'oil' ? 0.3 - stir * 0.35 : -1 - stir * 0.25, false);
    } else if (pose === 'stun') {
      arm(4, -26, 1.45 + Math.sin(now * 5) * 0.1, false);
      // 보라색 가루를 뒤집어써서 살짝 보랏빛
      ctx.globalAlpha = vis * 0.22;
      ctx.fillStyle = '#9b6bd6';
      circ(1, -40.5, 11.5); rr(-9, -31, 18, 20, 5);
      ctx.globalAlpha = vis;
    } else {
      const hnd = arm(4, -26, 0.95 + sw * 0.3, false);
      rake(hnd.x, hnd.y, -1.3 + (pose === 'walk' ? sw * 0.08 : Math.sin(now * 2.2) * 0.03));
      ctx.fillStyle = SKIN; circ(hnd.x, hnd.y, 2.3);
    }
    ctx.restore();
  }

  function drawActor(now) {
    const a = S.actor, p = Core.posAt(a, S.t);
    let pose = 'idle', anim = now;
    const kind = a.job ? a.job.kind : '';
    if (a.phase === 'move' && a.how === 'walk') pose = 'walk';
    else if (a.phase === 'move' && a.how === 'ladder') pose = 'ladder';
    else if (a.phase === 'work') { pose = kind === 'gather' ? 'gather' : 'craft'; anim = S.t - a.start; }
    else if (a.phase === 'stun') pose = 'stun';

    // 갈퀴가 땅에 닿을 때마다 흙이 튄다
    if (pose === 'gather' && a.herb >= 0) {
      if (swing.start !== a.start) swing = { start: a.start, idx: -1 };
      const idx = Math.floor((anim * 11 - Math.PI / 2) / (Math.PI * 2));
      if (idx > swing.idx && idx >= 0) {
        swing.idx = idx;
        const hp = HERBS[a.herb];
        for (let i = 0; i < 4; i++) addPart({ kind: 'dirt', x: hp.x + rnd(-6, 6), y: hp.y - 1, vx: rnd(-45, 45), vy: rnd(-110, -60), g: 420, life: 0.5, size: rnd(1.6, 2.6), color: i % 2 ? '#7a5236' : '#a0744c' });
      }
    }
    // 텔레포트: 출발지와 도착지에 빛기둥
    if (a.phase === 'move' && a.how === 'tele') {
      if (tele.start !== a.start) { tele = { start: a.start, half: false }; sparks(a.fx, a.fy - 26, '#a8dcff', 8, 70); }
      if (!tele.half && p.k >= 0.5) { tele.half = true; sparks(a.tx, a.ty - 26, '#a8dcff', 8, 70); }
      beam(a.fx, a.fy, 1 - Math.min(1, p.k * 2));
      beam(a.tx, a.ty, Math.max(0, p.k * 2 - 1));
    }
    if (S.mode === 'gather' && a.phase === 'move' && a.herb >= 0) {
      const hp = HERBS[a.herb], by = hp.y - 62 + Math.sin(now * 6) * 3;
      ctx.fillStyle = '#ffd65a'; ctx.strokeStyle = 'rgba(60,40,0,.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hp.x - 5, by - 7); ctx.lineTo(hp.x + 5, by - 7); ctx.lineTo(hp.x, by); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // 불러온 내 캐릭터가 있으면 그 이미지로, 없으면 기본 심마니를 그린다.
    const top = look ? look.headTop : 60;
    if (look) drawLook(p, a.face, pose, anim, now);
    else hero(p.x, p.y, a.face, pose, anim, now, p.vis, kind);
    if (pose === 'stun') dizzyStars(p.x, p.y - top - 6, now);
    if (a.phase === 'work') {
      const k = clamp((S.t - a.start) / (a.end - a.start), 0, 1);
      ctx.fillStyle = 'rgba(10,8,26,.78)'; rr(p.x - 21, p.y - top - 14, 42, 7, 3.5);
      ctx.fillStyle = kind === 'gather' ? '#7ddc6a' : kind === 'oil' ? '#b48cff' : '#6fd3ff';
      rr(p.x - 20, p.y - top - 13, Math.max(5, 40 * k), 5, 2.5);
    }
    const tag = me ? me.name : '심마니';
    ctx.globalAlpha = p.vis;
    ctx.font = '600 9.5px ' + FONT;
    const w = ctx.measureText(tag).width + 10;
    ctx.fillStyle = 'rgba(10,8,26,.72)'; rr(p.x - w / 2, p.y + 5, w, 13, 4);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tag, p.x, p.y + 11.8);
    ctx.globalAlpha = 1;
  }

  // 넥슨 캐릭터 이미지 그리기. 원본은 왼쪽을 보고 있어서 오른쪽으로 갈 때 뒤집는다.
  const LOOK_SCALE = 1.02, LOOK_FACES = -1;
  function drawLook(p, face, pose, anim, now) {
    const f = look.frames;
    const set = pose === 'walk' ? f.walk : pose === 'ladder' ? f.ladder : pose === 'gather' ? f.swing : pose === 'stun' ? f.stun : f.stand;
    let i = 0;
    if (pose === 'walk') i = Math.floor(anim / 0.15) % set.length;
    else if (pose === 'ladder') i = Math.floor(anim / 0.18) % set.length;
    else if (pose === 'gather') i = Math.floor(anim / 0.2) % set.length;
    else if (pose !== 'stun') i = [0, 1, 2, 1][Math.floor(now / 0.5) % 4] % set.length;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = p.vis;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ell(0, 1, 14, 3.4);
    if (pose === 'stun') ctx.rotate(Math.sin(now * 5) * 0.05);
    ctx.scale(face === LOOK_FACES ? LOOK_SCALE : -LOOK_SCALE, LOOK_SCALE);
    ctx.imageSmoothingEnabled = false;
    const frame = set[i] || f.stand[0], anchor = frame._hiAnchor || look.anchor;
    ctx.drawImage(frame, -anchor.x, -anchor.y);
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
  }
  // 기절하면 머리 위로 별 세 개가 빙글빙글 돈다
  function dizzyStars(x, y, now) {
    for (let i = 0; i < 3; i++) {
      const a = now * 5 + i * Math.PI * 2 / 3;
      const sx = x + Math.cos(a) * 14, sy = y + Math.sin(a) * 4.5;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(now * 4);
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const r = j % 2 ? 1.5 : 3.6, t = j * Math.PI / 5 - Math.PI / 2;
        ctx[j ? 'lineTo' : 'moveTo'](Math.cos(t) * r, Math.sin(t) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffe066';
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 0.7;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  function beam(x, y, a) {
    if (a <= 0) return;
    const gr = ctx.createLinearGradient(0, y - 70, 0, y);
    gr.addColorStop(0, 'rgba(168,220,255,0)'); gr.addColorStop(1, 'rgba(168,220,255,' + (0.5 * a) + ')');
    ctx.fillStyle = gr; ctx.fillRect(x - 9, y - 70, 18, 70);
    ctx.strokeStyle = 'rgba(190,232,255,' + a + ')'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(x, y, 16 - a * 6, 4 - a * 1.4, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------------------------------------------------------------- 시세 패널

  // 한 품목 안에서 판매가(내가 팔 때)와 구매가(내가 살 때)를 나란히 보여 준다.
  function itemCard(k) {
    const canSell = SELL.indexOf(k) >= 0, canBuy = BUY.indexOf(k) >= 0;
    const quote = (side, label, id) => '<div class="hi-quote ' + side + '"><small>' + label + '</small><b id="' + id + '_' + k + '">-</b></div>';
    const trade = (act, label) => '<div class="hi-trade-row ' + act + '" role="group" aria-label="' + esc(ITEMS[k].short) + ' ' + label + '">' +
      '<span>' + label + '</span><input type="number" min="1" step="1" inputmode="numeric" placeholder="수량" aria-label="' + esc(ITEMS[k].short) + ' ' + label + ' 수량" data-trade-input="' + act + '-' + k + '" />' +
      '<em>개</em><button type="button" data-' + act + '="' + k + '">' + label + '</button></div>';
    const quotes = (canSell ? quote('sell', '내 판매가', 'bid') : '') + (canBuy ? quote('buy', '내 구매가', 'ask') : '');
    return '<article class="hi-item" data-item="' + k + '">' +
      '<div class="hi-item-head">' +
        '<img class="pix" src="icons/craft/' + ICON[k] + '" alt="" width="32" height="32" />' +
        '<div class="hi-item-name"><b>' + esc(ITEMS[k].short) + '</b><small>' + esc(ITEMS[k].name) + '</small></div>' +
        '<div class="hi-item-price"><b id="price_' + k + '">-</b><span class="hi-delta" id="delta_' + k + '"></span></div>' +
      '</div>' +
      '<svg class="hi-chart" id="chart_' + k + '" viewBox="0 0 240 54" preserveAspectRatio="none" aria-hidden="true">' +
        '<line class="hi-base" x1="0" x2="240" y1="27" y2="27" /><path class="hi-area" d="" /><path class="hi-line" d="" /></svg>' +
      '<div class="hi-quotes' + (canSell !== canBuy ? ' single' : '') + '">' + quotes + '</div>' +
      '<div class="hi-item-meta"><span id="vs_' + k + '"></span><span id="have_' + k + '"></span></div>' +
      (canSell ? trade('sell', '판매') : '') + (canBuy ? trade('buy', '구매') : '') +
    '</article>';
  }
  function buildMarket() {
    $('marketCards').innerHTML =
      '<div class="hi-market-legend"><span class="sell">판매 · 수수료 5%</span><span class="buy">구매 · 수수료 없음</span></div>' +
      KEYS.map(itemCard).join('') + '<div class="hi-compare" id="compare"></div>';
  }

  function setText(id, text) { const n = $(id); if (n && n.textContent !== text) n.textContent = text; }
  function setHtml(id, html) { const n = $(id); if (n && n.innerHTML !== html) n.innerHTML = html; }

  function renderChart(k) {
    const it = S.market.items[k], base = ITEMS[k].base, hist = it.hist, n = hist.length;
    const svg = $('chart_' + k);
    if (!n) return;
    let lo = base, hi = base;
    hist.forEach(p => { if (p < lo) lo = p; if (p > hi) hi = p; });
    const pad = (hi - lo) * 0.12 || base * 0.02;
    lo -= pad; hi += pad;
    const W = 240, H = 54, step = W / (C.HISTORY - 1);
    const X = i => (W - (n - 1 - i) * step).toFixed(1);
    const Y = p => (H - (p - lo) / (hi - lo) * H).toFixed(1);
    let d = '';
    hist.forEach((p, i) => { d += (i ? 'L' : 'M') + X(i) + ' ' + Y(p); });
    svg.querySelector('.hi-line').setAttribute('d', d);
    svg.querySelector('.hi-area').setAttribute('d', d + 'L' + X(n - 1) + ' ' + H + 'L' + X(0) + ' ' + H + 'Z');
    const by = Y(base);
    const baseLine = svg.querySelector('.hi-base');
    baseLine.setAttribute('y1', by); baseLine.setAttribute('y2', by);
    svg.classList.toggle('up', hist[n - 1] >= hist[0]);
    svg.classList.toggle('down', hist[n - 1] < hist[0]);
  }

  function renderMarket() {
    KEYS.forEach(k => {
      const it = S.market.items[k], d = it.price - it.prev, vs = it.price / ITEMS[k].base - 1;
      setText('price_' + k, short(it.price));
      setText('bid_' + k, short(Core.quote(S, k, 'bid')));
      setText('ask_' + k, short(Core.quote(S, k, 'ask')));
      const delta = $('delta_' + k);
      setText('delta_' + k, d > 0 ? '▲ ' + short(d) : d < 0 ? '▼ ' + short(-d) : '-');
      delta.classList.toggle('hi-up', d > 0);
      delta.classList.toggle('hi-down', d < 0);
      setHtml('vs_' + k, '평소보다 <b class="' + (vs > 0.0005 ? 'hi-up' : vs < -0.0005 ? 'hi-down' : '') + '">' + pct(vs) + '</b>');
      renderChart(k);
    });
    const n = S.market.news[0];
    setHtml('news', n
      ? '<span aria-hidden="true">📰</span><span><b>' + esc(n.text) + '</b> · ' + esc(newsHit(n)) + ' <small>(' + esc(dur(Math.max(1, S.t - n.t))) + ' 전)</small></span>'
      : '<span aria-hidden="true">📰</span><span>새 소식이 뜨면 시세가 크게 움직여요</span>');
    if (newsFresh) {
      const box = $('news');
      box.classList.remove('fresh'); void box.offsetWidth; box.classList.add('fresh');
      newsFresh = false;
    }
    renderCompare();
  }

  // 씨앗·오일을 그대로 팔 때와 가공해서 팔 때 받는 돈(재료비·수수료 뺀 평균)
  function renderCompare() {
    const v = Core.seedValues(S);
    const row = (label, ways) => {
      const best = Math.max.apply(null, ways.filter(Boolean).map(w => w[1]));
      return '<div class="hi-compare-row"><span>' + label + '</span>' + ways.map(w => w
        ? '<div class="hi-way' + (w[1] === best ? ' best' : '') + '"><small>' + w[0] + '</small><b>' + short(Math.round(w[1])) + '</b></div>'
        : '<div class="hi-way none"></div>').join('') + '</div>';
    };
    setHtml('compare',
      row('씨앗 1개 팔면', [['그냥', v.direct], ['오일로', v.viaOil], ['재물비로', v.viaElixir]]) +
      row('오일 1개 팔면', [['그냥', v.oilDirect], ['재물비로', v.oilViaElixir], null]));
  }

  // ---------------------------------------------------------------- HUD

  const shown = {};
  KEYS.forEach(k => { shown[k] = -1; });
  function statusText() {
    const a = S.actor;
    if (a.phase === 'stun') return '💫 기절! 보라색 가루를 뒤집어썼어요';
    if (S.mode === 'gather') {
      if (a.phase === 'work') return '🌿 보라 약초 캐는 중';
      if (a.phase === 'move') return a.how === 'tele' ? '✨ 텔레포트!'
        : a.how === 'ladder' ? '🪜 사다리 이동 중' : '🌿 다음 약초로 걷는 중';
      if (a.phase === 'wait') return '🌱 약초가 다시 자라길 기다리는 중';
      return '🌿 약초 찾는 중';
    }
    const oil = S.mode === 'oil';
    if (a.phase === 'move') return oil ? '⚗️ 제련대로 가는 중' : '🧪 연금술 작업대로 가는 중';
    return (oil ? '⚗️ 씨앗 오일 만드는 중' : '🧪 재물비 만드는 중') + ' · ' + fmt(timesLeft(S.mode)) + '번 더';
  }
  function timesLeft(mode) {
    return mode === 'oil'
      ? Math.min(Math.floor(S.inv.seed / C.OIL_SEEDS), Math.floor(S.meso / C.OIL_BOTTLE))
      : Math.min(Math.floor(S.inv.oil / C.ALCH_OILS), Math.floor(S.inv.crystal / C.ALCH_CRYSTALS),
        Math.floor(S.inv.stone / C.ALCH_STONES), Math.floor(S.meso / C.POTION_BOTTLE));
  }
  const NEED = {
    seed: () => '씨앗 6개 필요 (' + fmt(S.inv.seed) + '개)',
    oil: () => '오일 5개 필요 (' + fmt(S.inv.oil) + '개)',
    crystal: () => '최상결 2개 필요 (' + fmt(S.inv.crystal) + '개)',
    stone: () => '현자의 돌 필요',
    meso: () => '메소 부족'
  };

  function renderHud() {
    setText('mesoValue', short(S.meso));
    setText('statusText', statusText());
    KEYS.forEach(k => {
      const v = S.inv[k];
      setText('inv_' + k, fmt(v));
      if (shown[k] >= 0 && v > shown[k]) {
        const box = $('inv_' + k).closest('.hi-inv-item');
        box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
      }
      shown[k] = v;
    });
    document.querySelectorAll('.hi-act').forEach(b => {
      const m = b.dataset.mode;
      b.setAttribute('aria-pressed', String(m === S.mode));
      const why = m === 'alchemy' ? Core.alchemyAutoShortage(S) : Core.shortage(S, m);
      b.classList.toggle('short', m !== 'gather' && !!why);
    });
    const oilWhy = Core.shortage(S, 'oil'), rawAlchWhy = Core.shortage(S, 'alchemy'), alchWhy = Core.alchemyAutoShortage(S);
    setText('act_oil', S.mode === 'oil' ? '씨앗 6 → 오일 1 (90%)'
      : oilWhy ? NEED[oilWhy]() : '씨앗 6 → 오일 · ' + fmt(timesLeft('oil')) + '번 가능');
    setText('act_alchemy', S.mode === 'alchemy' ? '오일 5 → 재물비 6'
      : alchWhy ? NEED[alchWhy]() : (rawAlchWhy === 'crystal' || rawAlchWhy === 'stone')
        ? '부족 재료 자동 구매 · 오일 5 → 재물비 6' : '오일 5 → 재물비 6 · ' + fmt(timesLeft('alchemy')) + '번');
    KEYS.forEach(k => {
      const have = S.inv[k];
      const extra = (k === 'crystal' || k === 'stone') ? ' · 필요 <b>' + fmt(Core.needFor(S, k)) + '</b>' : '';
      setHtml('have_' + k, '보유 <b>' + fmt(have) + '</b>' + extra);
      document.querySelectorAll('[data-sell="' + k + '"]').forEach(b => {
        const input = b.closest('.hi-trade-row').querySelector('input');
        b.disabled = !have || !(Math.floor(Number(input.value)) > 0);
      });
      const price = Core.quote(S, k, 'ask');
      document.querySelectorAll('[data-buy="' + k + '"]').forEach(b => {
        const input = b.closest('.hi-trade-row').querySelector('input');
        b.disabled = S.meso < price || !(Math.floor(Number(input.value)) > 0);
      });
    });
    // 자산은 팔아서 손에 쥔 메소만 센다. 가방 속 재고는 시세 따라 값이 흔들려서 넣지 않는다.
    const gain = S.meso - C.START_MESO;
    setHtml('worth',
      '<small>메소</small><b>' + short(S.meso) + ' 메소</b>' +
      '<span>시작 ' + short(C.START_MESO) + '에서 <em class="' + (gain > 0 ? 'hi-up' : gain < 0 ? 'hi-down' : '') + '">' +
        (gain > 0 ? '+' : '') + short(gain) + '</em></span>');
    const st = S.stats;
    setHtml('stats', [
      ['채집', fmt(st.gathers) + '회'],
      ['얻은 씨앗', fmt(st.seeds) + '개' + (st.gathers ? ' · 회당 ' + (st.seeds / st.gathers).toFixed(2) : '')],
      ['오일 제련', fmt(st.oilOk) + ' 성공 · 꽝 ' + fmt(st.oilTry - st.oilOk)],
      ['재물비 제작', fmt(st.elixirs) + '개'],
      ['판매로 번 돈', short(st.income) + ' 메소'],
      ['재료 구입', short(st.bought) + ' 메소'],
      ['오일병·빈병', short(st.spent) + ' 메소']
    ].map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join(''));
    setText('playTime', '플레이 ' + dur(S.t));
  }

  function renderLog() {
    setHtml('log', log.length
      ? log.map(l => '<li class="' + esc(l.kind) + '"><time>' + hhmm(l.at) + '</time><span>' + esc(l.text) + '</span></li>').join('')
      : '<li class="hi-log-empty">팔거나 사면, 그리고 시세 소식이 뜨면 여기에 남아요.</li>');
  }

  // ---------------------------------------------------------------- 내 캐릭터 (넥슨 오픈 API)
  // 캐릭터명 → /id(ocid) → /character/basic 의 character_image 를 그대로 쓴다. API 키는 홈 화면에서
  // 등록한 각자의 키(nexon_key.js)를 이 브라우저에서만 쓰고, 코드에는 넣지 않는다.
  // 계정 캐릭터 선택기(nexon_characters.js)로 고르면 ocid를 이미 알아서 /id 조회를 건너뛴다.
  const ME_KEY = 'herbIdleCharacter';
  const API_BASE = 'https://open.api.nexon.com/maplestory/v1';
  const IO_BASE = 'https://maplestory.io/api/KMS/latest';
  const IO_VISIBLE_SLOTS = new Set(['모자', '얼굴장식', '눈장식', '귀고리', '상의', '한벌옷', '하의', '신발', '장갑', '망토', '무기', '보조무기']);
  const IO_POSES = {
    stand: [{ action: 'stand1', frames: [0, 1, 2] }, { action: 'stand2', frames: [0, 1, 2] }],
    walk: [{ action: 'walk1', frames: [0, 1, 2, 3] }, { action: 'walk2', frames: [0, 1, 2, 3] }],
    swing: [{ action: 'swingOF', frames: [0, 1, 2, 3] }, { action: 'swingTF', frames: [0, 1, 2, 3] }, { action: 'swingO1', frames: [0, 1, 2, 3] }, { action: 'swingT1', frames: [0, 1, 2, 3] }],
    ladder: [{ action: 'ladder', frames: [0, 1] }],
    stun: [{ action: 'alert', frames: [0] }, { action: 'stand1', frames: [0] }]
  };
  // 지원하지 않는 무기·동작 조합은 no-image를 돌려주므로 후보군을 순서대로 시험한다.
  const POSES = {
    stand: [{ motion: 'W00', actions: ['A00.0', 'A00.1', 'A00.2'] }],
    walk: [{ motion: 'W00', actions: ['A02.0', 'A02.1', 'A02.2', 'A02.3'] }, { motion: 'W02', actions: ['A02.0', 'A02.1', 'A02.2', 'A02.3'] }, { motion: 'W01', actions: ['A02.0', 'A02.1', 'A02.2', 'A02.3'] }, { motion: 'W00', actions: ['A03.0', 'A03.1', 'A03.2', 'A03.3'] }],
    swing: [{ motion: 'W02', actions: ['A16.0', 'A16.1', 'A16.2', 'A16.3'] }, { motion: 'W02', actions: ['A23.0', 'A23.1', 'A23.2', 'A23.3'] }, { motion: 'W00', actions: ['A16.0', 'A16.1', 'A16.2', 'A16.3'] }],
    ladder: [{ motion: 'W04', actions: ['A08.0', 'A08.1'] }, { motion: 'W00', actions: ['A08.0', 'A08.1'] }],
    stun: [{ motion: 'W00', actions: ['A00.0'] }]
  };
  const API_ERROR = {
    OPENAPI00001: 'API 서버 내부 오류예요. 잠시 후 다시 해 주세요.',
    OPENAPI00002: 'API 키에 권한이 없어요. 메이플스토리용 키인지 확인해 주세요.',
    OPENAPI00005: 'API 키가 유효하지 않아요. 홈 화면에서 키를 확인해 주세요.',
    OPENAPI00007: 'API 호출 한도를 넘었어요. 잠시 후 다시 해 주세요.',
    OPENAPI00009: '데이터 준비 중이에요. 잠시 후 다시 해 주세요.',
    OPENAPI00010: '게임 점검 중이에요.',
    OPENAPI00011: 'API 점검 중이에요.'
  };
  const meInput = $('meNameInput'), meLoadBtn = $('meLoad');

  function apiGet(path, params) {
    const qs = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    return fetch(API_BASE + path + '?' + qs, { headers: { 'x-nxopen-api-key': window.NexonKey.get() } })
      .then(res => res.json().catch(() => null).then(body => {
        if (!res.ok) {
          const err = body && body.error ? body.error : {};
          const e = new Error(err.message || ('HTTP ' + res.status));
          e.code = err.name || '';
          throw e;
        }
        return body;
      }));
  }
  function ioError(message, missing) {
    const e = new Error(message || 'MAPLESTORY_IO');
    e.io = true;
    e.missing = missing || [];
    return e;
  }
  function exactName(value) { return String(value || '').replace(/\s+/g, '').toLocaleLowerCase('ko'); }
  function ioSearchRows(body) {
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.items)) return body.items;
    if (body && Array.isArray(body.data)) return body.data;
    if (body && Array.isArray(body.results)) return body.results;
    return [];
  }
  function ioItemId(row) {
    const n = Number(row && (row.id == null ? (row.itemId == null ? row.item_id : row.itemId) : row.id));
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  }
  function ioItemName(row) { return String(row && (row.name || row.itemName || row.item_name) || ''); }
  function findIoItem(name) {
    const url = IO_BASE + '/item?searchFor=' + encodeURIComponent(name) + '&count=30';
    return fetch(url).then(res => {
      if (!res.ok) throw ioError('MapleStory.io 검색 실패');
      return res.json();
    }).then(body => {
      const wanted = exactName(name);
      const row = ioSearchRows(body).find(item => exactName(ioItemName(item)) === wanted);
      return row ? ioItemId(row) : 0;
    }).catch(e => { throw e && e.io ? e : ioError('MapleStory.io 연결 실패'); });
  }
  function activeCashItems(cash) {
    cash = cash || {};
    const preset = Math.max(0, Math.min(3, Number(cash.preset_no) || 0));
    const main = preset && Array.isArray(cash['cash_item_equipment_preset_' + preset])
      ? cash['cash_item_equipment_preset_' + preset] : cash.cash_item_equipment_base;
    const extra = preset && Array.isArray(cash['additional_cash_item_equipment_preset_' + preset])
      ? cash['additional_cash_item_equipment_preset_' + preset] : cash.additional_cash_item_equipment_base;
    return [].concat(Array.isArray(main) ? main : [], Array.isArray(extra) ? extra : []);
  }
  function appearanceNames(item, cash, beauty) {
    const bySlot = new Map();
    (item && Array.isArray(item.item_equipment) ? item.item_equipment : []).forEach(row => {
      const slot = String(row.item_equipment_slot || '');
      if (IO_VISIBLE_SLOTS.has(slot) && row.item_name) bySlot.set(slot, String(row.item_name));
    });
    activeCashItems(cash).forEach(row => {
      const slot = String(row.cash_item_equipment_slot || '');
      if (IO_VISIBLE_SLOTS.has(slot) && row.cash_item_name) bySlot.set(slot, String(row.cash_item_name));
    });
    const names = Array.from(bySlot.values());
    const hair = beauty && beauty.character_hair && beauty.character_hair.hair_name;
    const face = beauty && beauty.character_face && beauty.character_face.face_name;
    if (hair) names.push(String(hair));
    if (face) names.push(String(face));
    return Array.from(new Set(names.filter(Boolean)));
  }
  function buildIoAppearance(ocid) {
    return Promise.all([
      apiGet('/character/item-equipment', { ocid }),
      apiGet('/character/cashitem-equipment', { ocid }),
      apiGet('/character/beauty-equipment', { ocid })
    ]).then(([item, cash, beauty]) => {
      const names = appearanceNames(item, cash, beauty);
      const skinName = beauty && beauty.character_skin && beauty.character_skin.skin_name;
      if (!names.length || !skinName) throw ioError('외형 정보 누락', !skinName ? ['피부'] : []);
      return Promise.all(names.concat([String(skinName)]).map(name => findIoItem(name).then(id => ({ name, id }))));
    }).then(rows => {
      const skin = rows.pop();
      const missing = rows.filter(row => !row.id).map(row => row.name);
      if (!skin.id || skin.id < 2000 || skin.id > 2099) missing.push(skin.name + '(피부)');
      if (missing.length) throw ioError('MapleStory.io 아이템 누락', missing);
      return { skinId: skin.id, itemIds: rows.map(row => row.id) };
    });
  }
  function ioFrameUrl(config, action, frame) {
    return IO_BASE + '/Character/' + encodeURIComponent(config.skinId) + '/' +
      config.itemIds.map(encodeURIComponent).join(',') + '/' + encodeURIComponent(action) + '/' + frame +
      '?showEars=false&showLefEars=false&showHighLefEars=false';
  }
  function describeApiError(e, stage) {
    if (e && e.code) {
      if (stage === 'id' && (e.code === 'OPENAPI00003' || e.code === 'OPENAPI00004')) return '캐릭터를 찾을 수 없어요. 이름을 확인해 주세요.';
      return API_ERROR[e.code] || (e.code + ': ' + e.message);
    }
    if (e && e.message === 'IMAGE') return '캐릭터 이미지를 받지 못했어요. 잠시 후 다시 해 주세요.';
    if (e && e.name === 'TypeError') return '네트워크 오류로 넥슨 API에 연결하지 못했어요.';
    return '불러오지 못했어요: ' + (e && e.message ? e.message : e);
  }
  // 넥슨 이미지 서버(또는 이 사이트)의 주소만 받는다.
  function safeImage(url) {
    if (typeof url !== 'string') return '';
    try {
      const u = new URL(url, location.href);
      return u.origin === 'https://open.api.nexon.com' || u.origin === location.origin ? u.href : '';
    } catch (e) { return ''; }
  }
  function frameUrl(base, action, emotion, motion) {
    // character_image에는 기본 action/emotion/wmotion이 이미 들어 있을 수 있다.
    // 뒤에 같은 키를 하나 더 붙이면 이미지 서버가 앞의 A00(서기)을 계속 사용하므로 반드시 교체한다.
    const u = new URL(base, location.href);
    const crop = {};
    ['width', 'height', 'x', 'y'].forEach(k => { if (u.searchParams.has(k)) crop[k] = u.searchParams.get(k); });
    u.search = '';
    u.searchParams.set('action', action);
    u.searchParams.set('emotion', emotion);
    u.searchParams.set('wmotion', motion);
    Object.keys(crop).forEach(k => u.searchParams.set(k, crop[k]));
    return u.href;
  }
  function loadImage(url) {
    return new Promise(resolve => {
      const im = new Image();
      im.crossOrigin = 'anonymous';   // 넥슨 이미지 서버가 CORS를 허용해서 픽셀을 읽을 수 있다
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = url;
    });
  }
  function alphaOf(im) {
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3];
    return a;
  }

  // 넥슨 이미지 서버는 지원하지 않는 동작 프레임에도 HTTP 오류 대신 300×300짜리
  // "no image" 그림을 돌려줄 때가 있다. onload만으로는 구분할 수 없으므로 정상 서기
  // 프레임과 발 위치·실루엣 높이가 크게 다른 그림은 사용할 수 없는 프레임으로 본다.
  function spriteShape(im) {
    const alpha = alphaOf(im), anchor = Core.spriteAnchor(alpha, im.naturalWidth, im.naturalHeight);
    if (!anchor.ok) return null;
    let ink = 0;
    for (let i = 0; i < alpha.length; i++) if (alpha[i] > 16) ink++;
    return { anchor, ink };
  }
  function usableFrame(im, base) {
    if (!im) return false;
    try {
      const shape = spriteShape(im);
      if (!shape) return false;
      const heightRatio = shape.anchor.height / base.anchor.height;
      const ok = heightRatio >= 0.5 && heightRatio <= 1.8 && shape.ink <= base.ink * 5;
      if (ok) im._hiAnchor = shape.anchor;
      return ok;
    } catch (e) { return false; }
  }

  // 후보군 하나를 전부 받은 뒤 no-image를 걸러낸다. 유효 프레임이 없으면 다음 무기 모션을 시험한다.
  let lookToken = 0;
  function loadPose(image, groups, emotion, base, token, at) {
    at = at || 0;
    if (token !== lookToken || at >= groups.length) return Promise.resolve([]);
    const group = groups[at];
    return Promise.all(group.actions.map(action => loadImage(frameUrl(image, action, emotion, group.motion)))).then(images => {
      if (token !== lookToken) return [];
      const good = images.filter(im => usableFrame(im, base));
      return good.length ? good : loadPose(image, groups, emotion, base, token, at + 1);
    });
  }
  function loadIoPose(config, groups, base, token, at) {
    at = at || 0;
    if (token !== lookToken || at >= groups.length) return Promise.resolve([]);
    const group = groups[at];
    return Promise.all(group.frames.map(frame => loadImage(ioFrameUrl(config, group.action, frame)))).then(images => {
      if (token !== lookToken) return [];
      const good = images.filter(im => usableFrame(im, base));
      return good.length ? good : loadIoPose(config, groups, base, token, at + 1);
    });
  }
  function loadIoLook(config) {
    const token = ++lookToken, frames = {}, fallback = {};
    return loadImage(ioFrameUrl(config, 'stand1', 0)).then(first => {
      if (token !== lookToken) return null;
      if (!first) throw ioError('MapleStory.io 이미지 로딩 실패');
      let base;
      try { base = spriteShape(first); } catch (e) { throw ioError('MapleStory.io 이미지 판독 실패'); }
      if (!base) throw ioError('MapleStory.io 빈 이미지');
      first._hiAnchor = base.anchor;
      return Promise.all(Object.keys(IO_POSES).map(pose => loadIoPose(config, IO_POSES[pose], base, token, 0)
        .then(set => { fallback[pose] = !set.length; frames[pose] = set.length ? set : [first]; })));
    }).then(done => {
      if (done === null || token !== lookToken) return null;
      if (fallback.walk || fallback.ladder || fallback.swing) throw ioError('필수 모션 누락', ['걷기/사다리/공격 모션']);
      const base = spriteShape(frames.stand[0]);
      look = { frames, fallback, anchor: base.anchor, headTop: base.anchor.height * LOOK_SCALE, source: 'maplestory.io' };
      $('stage').dataset.motionWalk = String(frames.walk.length);
      $('stage').dataset.motionLadder = String(frames.ladder.length);
      $('stage').dataset.motionSwing = String(frames.swing.length);
      renderMe();
      return look;
    });
  }
  function loadLook(info) {
    const token = ++lookToken, frames = {}, fallback = {};
    const stand = POSES.stand[0];
    return loadImage(frameUrl(info.image, stand.actions[0], 'E00', stand.motion)).then(first => {
      if (token !== lookToken) return null;   // 그새 다른 캐릭터를 불렀다
      if (!first) throw new Error('IMAGE');
      let base;
      try { base = spriteShape(first); } catch (e) { throw new Error('IMAGE'); }
      if (!base) throw new Error('IMAGE');
      first._hiAnchor = base.anchor;
      return Promise.all(Object.keys(POSES).map(pose => loadPose(info.image, POSES[pose], pose === 'stun' ? 'E05' : 'E00', base, token, 0)
        .then(set => { fallback[pose] = !set.length; frames[pose] = set.length ? set : [first]; })));
    }).then(done => {
      if (done === null || token !== lookToken) return null;
      const first = frames.stand[0];
      const base = spriteShape(first);
      look = { frames, fallback, anchor: base.anchor, headTop: base.anchor.height * LOOK_SCALE, source: 'nexon' };
      $('stage').dataset.motionWalk = fallback.walk ? 'fallback' : String(frames.walk.length);
      $('stage').dataset.motionLadder = fallback.ladder ? 'fallback' : String(frames.ladder.length);
      $('stage').dataset.motionSwing = fallback.swing ? 'fallback' : String(frames.swing.length);
      renderMe();
      return look;
    });
  }

  function readMe() {
    try {
      const d = JSON.parse(localStorage.getItem(ME_KEY) || 'null');
      if (!d || typeof d.name !== 'string' || !safeImage(d.image)) return null;
      const io = d.io && Number.isSafeInteger(Number(d.io.skinId)) && Array.isArray(d.io.itemIds)
        ? { skinId: Number(d.io.skinId), itemIds: d.io.itemIds.map(Number).filter(Number.isSafeInteger) } : null;
      return { name: d.name.slice(0, 20), world: String(d.world || ''), level: Number(d.level) || 0, cls: String(d.cls || ''), image: safeImage(d.image), ocid: String(d.ocid || ''), io };
    } catch (e) { return null; }
  }
  function writeMe() {
    try { if (me) localStorage.setItem(ME_KEY, JSON.stringify(me)); else localStorage.removeItem(ME_KEY); } catch (e) {}
  }
  function setMeStatus(text, kind) {
    const n = $('meStatus');
    n.textContent = text || '';
    n.className = 'hi-me-status' + (kind ? ' ' + kind : '');
  }

  // 요약 줄: 캐릭터 얼굴(서기 그림을 발 기준으로 잘라서)과 이름·서버·레벨
  function renderMe() {
    const thumb = $('meThumb');
    thumb.textContent = '';
    if (look) {
      const c = document.createElement('canvas'), size = 112;
      c.width = c.height = size;
      const g = c.getContext('2d'), a = look.anchor, side = Math.max(a.height + 8, 64);
      g.imageSmoothingEnabled = false;
      g.drawImage(look.frames.stand[0], a.x - side / 2, a.y - side + 4, side, side, 0, 0, size, size);
      thumb.appendChild(c);
    } else {
      thumb.textContent = '🧑‍🌾';
    }
    setText('meName', me ? me.name : '기본 심마니');
    const motionMissing = me && look && look.fallback && look.fallback.walk && look.fallback.ladder && look.fallback.swing;
    const source = look && look.source === 'maplestory.io' ? 'IO 모션' : (motionMissing ? '기본 이미지 · 모션 없음' : '기본 이미지');
    setText('meSub', me ? [me.world, me.level ? 'Lv.' + me.level : '', me.cls, source].filter(Boolean).join(' · ') : '내 메이플 캐릭터를 불러와서 할 수 있어요');
    $('meReset').hidden = !me;
    $('meKey').hidden = !!(window.NexonKey && window.NexonKey.has());
  }

  function loadMe() {
    if (!window.NexonKey || !window.NexonKey.has()) {
      renderMe();
      setMeStatus('홈 화면에서 넥슨 오픈 API 키를 먼저 등록해 주세요.', 'err');
      return;
    }
    const name = meInput.value.trim();
    if (!name) { setMeStatus('캐릭터 이름을 적어 주세요.', 'err'); meInput.hidden = false; meInput.focus(); return; }
    meLoadBtn.disabled = true;
    setMeStatus(name + ' 캐릭터를 불러오는 중…');
    let stage = 'id';
    const known = meInput.dataset.accountOcid || '';
    let ocid = '';
    (known ? Promise.resolve({ ocid: known }) : apiGet('/id', { character_name: name }))
      .then(r => {
        if (!r || !r.ocid) throw new Error('캐릭터 식별자(ocid)를 받지 못했어요.');
        ocid = r.ocid;
        stage = 'basic';
        return apiGet('/character/basic', { ocid: r.ocid });
      })
      .then(b => {
        const info = { name: String(b.character_name || name).slice(0, 20), world: String(b.world_name || ''),
          level: Number(b.character_level) || 0, cls: String(b.character_class || ''), image: safeImage(b.character_image), ocid };
        if (!info.image) throw new Error('IMAGE');
        stage = 'maplestory.io';
        setMeStatus('장비를 MapleStory.io 모션으로 조립하는 중…');
        return buildIoAppearance(ocid).then(config => loadIoLook(config).then(ready => ({ ready, config, warning: '' })))
          .catch(ioFailure => {
            if (!ioFailure || !ioFailure.io) throw ioFailure;
            const missing = ioFailure.missing && ioFailure.missing.length
              ? ' 누락: ' + ioFailure.missing.slice(0, 3).join(', ') + (ioFailure.missing.length > 3 ? ' 외 ' + (ioFailure.missing.length - 3) + '개' : '') + '.' : '';
            return loadLook(info).then(ready => ({ ready, config: null, warning: 'MapleStory.io 조립에 실패해 넥슨 기본 이미지로 되돌렸어요.' + missing }));
          }).then(result => {
          const ready = result.ready;
          if (!ready) return;
          if (result.config) info.io = result.config;
          me = info;
          writeMe();
          renderMe();
          if (result.warning) {
            setMeStatus(result.warning, 'err');
            return;
          }
          const noMotion = ready.fallback.walk && ready.fallback.ladder && ready.fallback.swing;
          setMeStatus(noMotion
            ? '외형은 불러왔지만 넥슨 이미지 서버가 걷기·사다리·공격 프레임을 빈 이미지로 보내고 있어요.'
            : info.name + ' 캐릭터로 약초를 캐요!', noMotion ? 'err' : 'ok');
          $('mePanel').open = false;
        });
      })
      .catch(e => setMeStatus(describeApiError(e, stage), 'err'))
      .then(() => { meLoadBtn.disabled = false; });
  }

  meLoadBtn.addEventListener('click', loadMe);
  meInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadMe(); });
  $('meReset').addEventListener('click', () => {
    lookToken++;
    me = null;
    look = null;
    writeMe();
    renderMe();
    setMeStatus('기본 심마니로 돌아왔어요.');
  });
  window.addEventListener('nexon-key-changed', renderMe);
  if (window.NexonCharacters) window.NexonCharacters.mount({ host: '#mePicker', input: meInput });

  // ---------------------------------------------------------------- 자리 비움 정산

  // 밀린 시간을 한 번에 흘리고, 그동안 늘고 쓴 양을 통계 차이로 센다.
  function fastForward(sec) {
    const run = Math.min(sec, C.OFFLINE_CAP);
    const before = { stats: JSON.parse(JSON.stringify(S.stats)), price: {} };
    KEYS.forEach(k => { before.price[k] = S.market.items[k].price; });
    let news = 0;
    Core.advance(S, run, e => {
      if (e.type === 'news') { news++; if (news <= 3) quietEvent(e); }
    });
    if (news > 3) addLog('📰 그 밖에 시세 소식 ' + fmt(news - 3) + '건', 'news');
    clearFx();
    hudDirty = marketDirty = true;
    const d = k => S.stats[k] - before.stats[k];
    return { run, before, gathers: d('gathers'), seeds: d('seeds'), oilTry: d('oilTry'), oilOk: d('oilOk'), crafts: d('crafts'), elixirs: d('elixirs'), spent: d('spent') };
  }

  function catchUp(sec) {
    const got = fastForward(sec), run = got.run, before = got.before;
    camX = camTarget();
    const icon = k => '<img class="pix" src="icons/craft/' + ICON[k] + '" alt="" />';
    const items = ['<li>' + icon('seed') + '<span>채집 ' + fmt(got.gathers) + '회 · 씨앗 <b>+' + fmt(got.seeds) + '</b></span></li>'];
    if (got.oilTry) items.push('<li>' + icon('oil') + '<span>오일 <b>+' + fmt(got.oilOk) + '</b>' + (got.oilTry > got.oilOk ? ' · 꽝 ' + fmt(got.oilTry - got.oilOk) + '번' : '') + ' (씨앗 ' + fmt(got.oilTry * C.OIL_SEEDS) + '개 사용)</span></li>');
    if (got.crafts) items.push('<li>' + icon('elixir') + '<span>재물비 <b>+' + fmt(got.elixirs) + '</b> (오일 ' + fmt(got.crafts * C.ALCH_OILS) +
      ' · 최상결 ' + fmt(got.crafts * C.ALCH_CRYSTALS) + ' · 현자의 돌 ' + fmt(got.crafts * C.ALCH_STONES) + '개 사용)</span></li>');
    if (got.spent) items.push('<li><span class="hi-coin" aria-hidden="true"></span><span>오일병·빈병 값 <b>-' + short(got.spent) + '</b> 메소</span></li>');
    $('awayTitle').textContent = '자리 비운 ' + dur(run) + ' 동안';
    $('awayList').innerHTML = items.join('');
    $('awayMarket').innerHTML = '시세 변화 · ' + KEYS.map(k => {
      const r = S.market.items[k].price / before.price[k] - 1;
      return esc(ITEMS[k].short) + ' ' + short(before.price[k]) + ' → <b class="' + (r > 0 ? 'hi-up' : r < 0 ? 'hi-down' : '') + '">' + short(S.market.items[k].price) + '</b>';
    }).join(' · ');
    $('awayNote').textContent = sec > C.OFFLINE_CAP ? '방치는 최대 8시간까지만 진행돼요. (' + dur(sec) + ' 비움)' : '';
    $('awayBox').classList.remove('hidden');
    hudDirty = marketDirty = true;
  }

  // ---------------------------------------------------------------- 시간 흐름

  function step() {
    const wall = Date.now();
    const gap = (wall - wallAt) / 1000;
    wallAt = wall;
    if (gap <= 0) return;
    if (gap > AWAY_MIN) catchUp(gap);
    else if (gap > QUIET_MIN) fastForward(gap);
    else Core.advance(S, gap, onEvent);
  }

  let rafId = 0, lastNow = 0;
  function frame(ms) {
    rafId = 0;
    if (paused) return;
    const now = ms / 1000;
    const dt = clamp(now - lastNow, 0, 0.1);
    lastNow = now;
    step();
    updateFx(dt);
    draw(now, dt);
    refresh();
    if (Date.now() - savedAt > 5000) save();
    rafId = requestAnimationFrame(frame);
  }
  // 글자 영역은 바뀐 것만 다시 쓴다. 버튼을 누른 직후에도 불러서 프레임을 기다리지 않는다.
  function refresh() {
    if (marketDirty) { renderMarket(); marketDirty = false; }
    if (hudDirty) { renderHud(); hudDirty = false; }
    if (logDirty) { renderLog(); logDirty = false; }
  }
  function start() {
    if (rafId) return;
    lastNow = performance.now() / 1000;
    rafId = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- 입력

  document.querySelector('.hi-actions').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b || paused) return;
    const mode = b.dataset.mode;
    if (mode === S.mode) return;
    step();
    const why = Core.setMode(S, mode, onEvent);
    if (why) {
      toast(WHY[mode][why]());
      b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
      return;
    }
    if (S.actor.phase === 'stun') toast('기절이 풀리면 바로 ' + b.querySelector('.hi-act-name').textContent + ' 하러 갈게요');
    hudDirty = true;
    refresh();
    save();
  });

  function pulseMeso() {
    const chip = document.querySelector('.hi-meso');
    chip.classList.remove('pulse'); void chip.offsetWidth; chip.classList.add('pulse');
  }

  $('marketCards').addEventListener('click', e => {
    const b = e.target.closest('[data-sell], [data-buy]');
    if (!b || paused) return;
    step();
    const input = b.closest('.hi-trade-row').querySelector('input');
    const want = Math.floor(Number(input.value));
    if (!(want > 0)) { toast('거래할 수량을 입력해 주세요'); input.focus(); return; }
    if (b.dataset.sell) {
      const k = b.dataset.sell;
      const r = Core.sell(S, k, want);
      if (!r) { toast('팔 ' + josa(ITEMS[k].short, '이', '가') + ' 없어요'); return; }
      addLog('💰 ' + ITEMS[k].short + ' ' + fmt(r.qty) + '개 판매 · 개당 ' + short(r.price) + ' · +' + short(r.net), 'sell');
      toast(josa(ITEMS[k].short, '을', '를') + ' ' + fmt(r.qty) + '개 팔아서 +' + short(r.net) + ' 메소 (수수료 ' + short(r.fee) + ')');
    } else {
      const k = b.dataset.buy, ask = Core.quote(S, k, 'ask');
      const r = Core.buy(S, k, want);
      if (!r) { toast('메소가 모자라요 (구매가 1개 ' + short(ask) + ' 메소)'); return; }
      addLog('🛒 ' + ITEMS[k].short + ' ' + fmt(r.qty) + '개 구매 · 개당 ' + short(r.price) + ' · -' + short(r.cost), 'buy');
      toast(josa(ITEMS[k].short, '을', '를') + ' ' + fmt(r.qty) + '개 샀어요 (-' + short(r.cost) + ' 메소)' +
        (r.qty < r.want ? ' · 메소가 모자라 ' + fmt(r.qty) + '개만' : ''));
    }
    pulseMeso();
    hudDirty = true;
    refresh();
    save();
  });
  $('marketCards').addEventListener('input', e => {
    if (!e.target.matches('[data-trade-input]')) return;
    hudDirty = true;
    renderHud();
  });
  $('marketCards').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('[data-trade-input]')) return;
    e.preventDefault();
    const button = e.target.closest('.hi-trade-row').querySelector('button');
    if (!button.disabled) button.click();
  });

  $('awayOk').addEventListener('click', () => $('awayBox').classList.add('hidden'));

  $('hiReset').addEventListener('click', () => {
    if (paused || !confirm('처음부터 다시 시작할까요?\n메소·가방·기록이 모두 지워집니다.')) return;
    S = Core.create(newSeed());
    log = [];
    wallAt = Date.now();
    clearFx();
    Object.keys(shown).forEach(k => { shown[k] = -1; });
    $('awayBox').classList.add('hidden');
    camX = camTarget();
    hudDirty = marketDirty = logDirty = true;
    refresh();
    save();
  });

  // 같은 게임을 두 탭에서 돌리면 서로 덮어쓰므로, 나중에 연 탭이 이어받고 먼저 연 탭은 멈춘다.
  window.addEventListener('storage', e => {
    if (e.key !== STORE_KEY || paused || !e.newValue) return;
    try {
      const d = JSON.parse(e.newValue);
      if (d && d.owner && d.owner !== TAB) { paused = true; $('pausedBox').classList.remove('hidden'); }
    } catch (err) {}
  });
  $('resumeBtn').addEventListener('click', () => {
    const d = readSave();
    if (d) { S = d.game; log = d.log; wallAt = d.wall; }
    paused = false;
    $('pausedBox').classList.add('hidden');
    clearFx();
    Object.keys(shown).forEach(k => { shown[k] = -1; });
    step();
    hudDirty = marketDirty = logDirty = true;
    refresh();
    save();
    start();
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  window.addEventListener('resize', () => resize(true));
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(stage);

  // ---------------------------------------------------------------- 시작

  const saved = readSave();
  if (saved) {
    S = saved.game;
    log = saved.log;
    wallAt = saved.wall;
  } else {
    S = Core.create(newSeed());
    wallAt = Date.now();
  }
  buildMarket();
  resize(true);
  step();
  camX = camTarget();
  refresh();
  save();
  start();

  // 저장해 둔 내 캐릭터는 API를 다시 부르지 않고 이미지 주소로 바로 그린다.
  me = readMe();
  renderMe();
  if (me) {
    const restore = me.io
      ? loadIoLook(me.io).catch(() => loadLook(me).then(ready => {
        setMeStatus('저장한 MapleStory.io 모션을 다시 받지 못해 넥슨 기본 이미지로 되돌렸어요.', 'err');
        return ready;
      }))
      : loadLook(me);
    restore.catch(() => setMeStatus('저장한 캐릭터 이미지를 다시 받지 못했어요. 불러오기를 다시 눌러 주세요.', 'err'));
  }
  else if (window.NexonKey && window.NexonKey.has()) $('mePanel').open = true;
})();
