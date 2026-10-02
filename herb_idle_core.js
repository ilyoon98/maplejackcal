// 약초 방치 게임 엔진. DOM 없이 상태만 굴린다.
//
// 화면이 켜져 있을 때도, 창을 닫았다 다시 열었을 때(자리 비움 정산)도 같은 advance()로
// 시간을 흘려서 결과가 어긋나지 않게 한다. 난수도 상태 안에 넣어(mulberry32) 같은 상태에서
// 같은 결과가 나오므로 테스트에서 그대로 재현된다.
//
// 채집량 근거: 에펨코리아 "쥬니퍼베리 씨앗 채집량 통계"(2026-03-27, 날렵한 갈퀴, 65캐릭)
//   500회 채집당 씨앗 평균 497.6개 · 표준편차 36.8 · 최소 408 · 최대 591.
//   글에는 500회 합계만 있어서 1회 분포는 "1/3 확률로 1~5개"로 맞췄다
//   (평균 1개, 500회 표준편차 36.5. 4개 이상이 13%라 "4개 이상도 제법 뜬다"는 공략글과도 맞음).
// 평소 시세: 같은 작성자 공략글의 2026년 2월 크로아 경매장 표 (씨앗 74만 · 오일 554만 · 재물비 475만,
//   최상급 아이템 결정 29만~33만). 현자의 돌 30만은 확인한 시세가 아니라 가정이다.
(function (root) {
  'use strict';

  const WORLD = { w: 960, h: 400, ground: 336 };
  const PLATFORMS = [
    { x1: 226, x2: 434, y: 246 },
    { x1: 536, x2: 764, y: 204 }
  ];
  const HERBS = [
    { x: 196, y: 336 }, { x: 330, y: 336 }, { x: 470, y: 336 }, { x: 612, y: 336 }, { x: 760, y: 336 },
    { x: 282, y: 246 }, { x: 382, y: 246 },
    { x: 598, y: 204 }, { x: 704, y: 204 }
  ];
  // stand: 작업할 때 서는 자리, face: 그때 바라보는 방향(1 = 오른쪽).
  const STATIONS = {
    oil: { x: 70, y: 336, stand: 124, face: -1 },
    alchemy: { x: 890, y: 336, stand: 836, face: 1 }
  };

  const C = {
    START_MESO: 1000000,
    GATHER_TIME: 2,          // 약초 1번 캐는 시간(초)
    WALK_SPEED: 200,         // 걷는 속도(px/초)
    WALK_MAX: 260,           // 같은 층에서 이보다 멀면 텔레포트
    CLIMB_SPEED: 90,         // 사다리 동작이 눈에 보이도록 걷기보다 천천히 이동
    TELEPORT_TIME: 0.45,
    STAND_GAP: 20,           // 약초 옆에 서는 거리
    RESPAWN_MIN: 10,         // 캔 약초가 다시 자라는 시간(초)
    RESPAWN_MAX: 16,
    SEED_CHANCE: 1 / 3,
    SEED_MAX: 5,
    OIL_SEEDS: 6,
    OIL_BOTTLE: 1000,        // 최고급 허브 오일병 (상점 정가)
    OIL_RATE: 0.9,           // 실패하면 보라색 가루(꽝), 재료는 사라진다
    OIL_TIME: 1.6,
    STUN_TIME: 3,            // 꽝이면 가루가 터져 이만큼(초) 기절한다
    ALCH_OILS: 5,
    ALCH_CRYSTALS: 2,        // 최상급 아이템 결정
    ALCH_STONES: 1,          // 현자의 돌
    ALCH_YIELD: 6,
    ALCH_TIME: 3,
    POTION_BOTTLE: 800,      // 최고급 포션 빈병 (상점 정가, 메소로 자동 구매)
    FEE_PCT: 5,              // 경매장 판매 수수료. 살 때는 없다.
    TICK: 3,                 // 시세가 바뀌는 간격(초)
    HISTORY: 120,            // 차트에 남기는 시세 개수 (6분)
    NEWS_CHANCE: 1 / 50,     // 시세 1번 바뀔 때 소식이 뜰 확률 (평균 2분 반에 1번)
    OFFLINE_CAP: 8 * 3600    // 자리 비움은 최대 8시간까지만 진행
  };

  // spread: 기준 시세 양쪽에 붙는 매수·매도 호가 폭. beta: 다 같이 움직이는 흐름을 타는 정도,
  // vol: 품목 혼자 흔들리는 정도(3초당), lo·hi: 평소 값의 e^lo ~ e^hi 배를 넘지 않는다.
  // 씨앗은 여럿이 캐서 바로 내놓는 원재료라 가장 크게 흔들리고, 사냥 때마다 쓰는 재물비는 가장 안정적이다.
  const ITEMS = {
    seed: { name: '쥬니퍼베리 씨앗', short: '씨앗', spread: 0.04, base: 740000, step: 1000, beta: 1.15, vol: 0.016, lo: -0.6, hi: 0.8 },
    oil: { name: '쥬니퍼베리 씨앗 오일', short: '오일', spread: 0.035, base: 5540000, step: 10000, beta: 0.85, vol: 0.01, lo: -0.45, hi: 0.6 },
    elixir: { name: '소형 재물 획득의 비약', short: '재물비', spread: 0.03, base: 4750000, step: 10000, beta: 0.5, vol: 0.0055, lo: -0.3, hi: 0.4 },
    crystal: { name: '최상급 아이템 결정', short: '최상결', spread: 0.04, base: 300000, step: 1000, beta: 0.35, vol: 0.011, lo: -0.45, hi: 0.6 },
    stone: { name: '현자의 돌', short: '현자의 돌', spread: 0.04, base: 300000, step: 1000, beta: 0.35, vol: 0.013, lo: -0.45, hi: 0.6 }
  };
  const KEYS = Object.keys(ITEMS);
  // 게임 흐름상 재물비는 완제품이라 판매만, 제작 재료는 구매만 한다.
  // 씨앗과 오일은 직접 팔거나 다음 단계 가공을 위해 살 수 있다.
  const SELL = ['seed', 'oil', 'elixir'];
  const BUY = ['seed', 'oil', 'crystal', 'stone'];
  const MODES = ['gather', 'oil', 'alchemy'];

  // items: 품목별로 더할 충격 범위(로그 단위). 소식은 1분 반쯤에 걸쳐 절반으로 줄어든다.
  const NEWS = [
    { text: '매크로 단속! 씨앗 매물이 확 줄었어요', items: { seed: [0.18, 0.35] } },
    { text: '씨앗 사재기 소문이 돌아요', items: { seed: [0.12, 0.25] } },
    { text: '심마니가 대거 몰려와 씨앗 매물이 쏟아져요', items: { seed: [-0.3, -0.15] } },
    { text: '채집 핫타임! 씨앗이 넘쳐나요', items: { seed: [-0.25, -0.12], oil: [-0.08, -0.03] } },
    { text: '연금술사들이 오일을 싹쓸이하고 있어요', items: { oil: [0.1, 0.22] } },
    { text: '오일 재고가 쌓여 값이 내려가요', items: { oil: [-0.18, -0.08] } },
    { text: '보스 패치를 앞두고 재물비가 잘 팔려요', items: { elixir: [0.06, 0.14] } },
    { text: '재획 이벤트 시작! 재물비 수요가 늘었어요', items: { elixir: [0.05, 0.12], oil: [0.04, 0.1] } },
    { text: '재물비가 과잉 공급돼 값이 조금 내려가요', items: { elixir: [-0.12, -0.05] } },
    { text: '장비 분해 이벤트로 최상결이 쏟아져요', items: { crystal: [-0.25, -0.12] } },
    { text: '강화 이벤트를 앞두고 최상결 수요 급증!', items: { crystal: [0.12, 0.25] } },
    { text: '현자의 돌 품귀! 값이 뛰어요', items: { stone: [0.15, 0.3] } },
    { text: '분해하는 사람이 늘어 현자의 돌이 넘쳐요', items: { stone: [-0.25, -0.1] } },
    { text: '주말 접속자 급증! 시세가 전반적으로 올라요', items: { seed: [0.08, 0.15], oil: [0.05, 0.1], elixir: [0.03, 0.06] } },
    { text: '긴급 점검 연장… 시장이 얼어붙었어요', items: { seed: [-0.15, -0.08], oil: [-0.1, -0.05], elixir: [-0.06, -0.03] } }
  ];

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const noop = () => {};

  // ---------------------------------------------------------------- 난수

  function rand(s) {
    let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(s) {
    let u = 0;
    while (u < 1e-12) u = rand(s);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand(s));
  }
  function rollSeeds(s) {
    if (rand(s) >= C.SEED_CHANCE) return 0;
    return 1 + Math.floor(rand(s) * C.SEED_MAX);
  }

  // ---------------------------------------------------------------- 시세

  function priceOf(key, x) {
    const d = ITEMS[key];
    return Math.max(d.step, Math.round(d.base * Math.exp(clamp(x, d.lo, d.hi)) / d.step) * d.step);
  }

  // price는 최근 체결가에 가까운 기준가이고, 플레이어가 파는 가격(bid)은 낮게,
  // 사는 가격(ask)은 높게 잡는다. 모든 호가는 품목별 거래 단위에 맞춘다.
  function quote(s, key, side) {
    const d = ITEMS[key], it = s && s.market && s.market.items[key];
    if (!d || !it) return 0;
    const half = d.spread / 2;
    return side === 'ask'
      ? Math.ceil(it.price * (1 + half) / d.step) * d.step
      : Math.max(d.step, Math.floor(it.price * (1 - half) / d.step) * d.step);
  }

  function marketTick(s, emit) {
    const m = s.market;
    m.tick++;
    m.mood += -0.01 * m.mood + 0.008 * gauss(s);
    if (rand(s) < C.NEWS_CHANCE) {
      const n = NEWS[Math.floor(rand(s) * NEWS.length)];
      const hit = {};
      Object.keys(n.items).forEach(k => {
        const r = n.items[k];
        hit[k] = r[0] + (r[1] - r[0]) * rand(s);
        m.items[k].shock = clamp(m.items[k].shock + hit[k], -0.6, 0.6);
      });
      const news = { text: n.text, hit, t: s.t };
      m.news.unshift(news);
      if (m.news.length > 6) m.news.length = 6;
      emit({ type: 'news', news });
    }
    KEYS.forEach(k => {
      const it = m.items[k], d = ITEMS[k];
      it.drift += -0.025 * it.drift + d.vol * gauss(s);
      it.shock *= 0.975;
      it.prev = it.price;
      it.price = priceOf(k, d.beta * m.mood + it.drift + it.shock);
      it.hist.push(it.price);
      if (it.hist.length > C.HISTORY) it.hist.splice(0, it.hist.length - C.HISTORY);
    });
    emit({ type: 'tick' });
  }

  // ---------------------------------------------------------------- 캐릭터

  const LADDER_BY_Y = {
    246: 240,
    204: 748
  };

  // 움직이는 중이면 지금 시각의 위치. 사다리 구간은 x를 고정하고 y만 바뀐다.
  function posAt(a, t) {
    if (a.phase !== 'move') return { x: a.x, y: a.y, vis: 1, k: 1 };
    const d = a.end - a.start;
    const k = d > 0 ? clamp((t - a.start) / d, 0, 1) : 1;
    if (a.how === 'walk') return { x: a.fx + (a.tx - a.fx) * k, y: a.fy, vis: 1, k };
    if (a.how === 'ladder') return { x: a.fx + (a.tx - a.fx) * k, y: a.fy + (a.ty - a.fy) * k, vis: 1, k };
    return k < 0.5 ? { x: a.fx, y: a.fy, vis: 1 - k * 2, k } : { x: a.tx, y: a.ty, vis: k * 2 - 1, k };
  }

  function beginSegment(s, seg) {
    const a = s.actor, dx = Math.abs(seg.x - a.x), dy = Math.abs(seg.y - a.y);
    a.how = seg.how;
    a.phase = 'move';
    a.fx = a.x; a.fy = a.y; a.tx = seg.x; a.ty = seg.y;
    a.start = s.t;
    a.end = s.t + (seg.how === 'ladder' ? Math.max(0.25, dy / C.CLIMB_SPEED) : Math.max(0.04, dx / C.WALK_SPEED));
    if (seg.how === 'walk' && seg.x !== a.x) a.face = seg.x > a.x ? 1 : -1;
  }

  // 다른 층으로 갈 때는 현재 층 사다리로 내려간 뒤, 목표 층 사다리로 올라간다.
  // 각 사다리는 실제 장면에 그려진 x좌표와 같아서 대각선으로 공중을 가로지르지 않는다.
  function startMove(s, tx, ty) {
    const a = s.actor;
    const dx = Math.abs(tx - a.x), dy = Math.abs(ty - a.y);
    if (dx < 0.5 && dy < 0.5) { a.x = tx; a.y = ty; return false; }
    const route = [], add = (x, y, how) => {
      const last = route.length ? route[route.length - 1] : { x: a.x, y: a.y };
      if (Math.abs(x - last.x) >= 0.5 || Math.abs(y - last.y) >= 0.5) route.push({ x, y, how });
    };
    let x = a.x, y = a.y;
    if (Math.abs(y - ty) >= 0.5) {
      if (Math.abs(y - WORLD.ground) >= 0.5) {
        const lx = LADDER_BY_Y[y];
        add(lx, y, 'walk'); add(lx, WORLD.ground, 'ladder');
        x = lx; y = WORLD.ground;
      }
      if (Math.abs(ty - WORLD.ground) >= 0.5) {
        const lx = LADDER_BY_Y[ty];
        add(lx, WORLD.ground, 'walk'); add(lx, ty, 'ladder');
        x = lx; y = ty;
      }
    }
    add(tx, ty, 'walk');
    a.route = route.slice(1);
    beginSegment(s, route[0]);
    return true;
  }

  // 가공을 시작하거나 이어 갈 수 없으면 모자란 것을 돌려준다.
  function shortage(s, mode) {
    if (mode === 'oil') {
      if (s.inv.seed < C.OIL_SEEDS) return 'seed';
      if (s.meso < C.OIL_BOTTLE) return 'meso';
    } else if (mode === 'alchemy') {
      if (s.inv.oil < C.ALCH_OILS) return 'oil';
      if (s.inv.crystal < C.ALCH_CRYSTALS) return 'crystal';
      if (s.inv.stone < C.ALCH_STONES) return 'stone';
      if (s.meso < C.POTION_BOTTLE) return 'meso';
    }
    return '';
  }

  function alchemyAutoShortage(s) {
    if (s.inv.oil < C.ALCH_OILS) return 'oil';
    const crystal = Math.max(0, C.ALCH_CRYSTALS - s.inv.crystal);
    const stone = Math.max(0, C.ALCH_STONES - s.inv.stone);
    const cost = crystal * quote(s, 'crystal', 'ask') + stone * quote(s, 'stone', 'ask') + C.POTION_BOTTLE;
    return s.meso < cost ? 'meso' : '';
  }

  // 현재 오일로 가능한 연금술 횟수만큼 제작 재료를 자동 구매한다.
  // 전량 구매가 부담되면 한 번 제작분만 사고, 한 번분과 빈병 값조차 없으면 상태를 바꾸지 않는다.
  function autoSupplyAlchemy(s, emit) {
    emit = emit || noop;
    const blocker = alchemyAutoShortage(s);
    if (blocker) return blocker;
    const batches = Math.floor(s.inv.oil / C.ALCH_OILS);
    const desired = {
      crystal: Math.max(0, batches * C.ALCH_CRYSTALS - s.inv.crystal),
      stone: Math.max(0, batches * C.ALCH_STONES - s.inv.stone)
    };
    const desiredCost = desired.crystal * quote(s, 'crystal', 'ask') + desired.stone * quote(s, 'stone', 'ask');
    let quantities = desired;
    if (s.meso < desiredCost + batches * C.POTION_BOTTLE) {
      quantities = {
        crystal: Math.max(0, C.ALCH_CRYSTALS - s.inv.crystal),
        stone: Math.max(0, C.ALCH_STONES - s.inv.stone)
      };
    }
    const materialCost = quantities.crystal * quote(s, 'crystal', 'ask') + quantities.stone * quote(s, 'stone', 'ask');
    if (s.meso < materialCost + C.POTION_BOTTLE) return 'meso';
    if (!quantities.crystal && !quantities.stone) return '';
    const bought = [];
    ['crystal', 'stone'].forEach(key => {
      if (!quantities[key]) return;
      const result = buy(s, key, quantities[key]);
      if (result) bought.push(result);
    });
    if (bought.length) emit({ type: 'autoBuy', items: bought, cost: bought.reduce((sum, row) => sum + row.cost, 0) });
    return '';
  }

  // 재료는 시작할 때 넣고, 도중에 다른 일로 바꾸면 돌려준다.
  function startWork(s, kind) {
    const a = s.actor;
    a.phase = 'work';
    a.start = s.t;
    if (kind === 'gather') {
      a.face = HERBS[a.herb].x >= a.x ? 1 : -1;
      a.job = { kind, seed: 0, oil: 0, crystal: 0, stone: 0, meso: 0 };
      a.end = s.t + C.GATHER_TIME;
      return;
    }
    const job = kind === 'oil'
      ? { kind, seed: C.OIL_SEEDS, oil: 0, crystal: 0, stone: 0, meso: C.OIL_BOTTLE }
      : { kind, seed: 0, oil: C.ALCH_OILS, crystal: C.ALCH_CRYSTALS, stone: C.ALCH_STONES, meso: C.POTION_BOTTLE };
    ['seed', 'oil', 'crystal', 'stone'].forEach(k => { s.inv[k] -= job[k]; });
    s.meso -= job.meso;
    a.job = job;
    a.end = s.t + (kind === 'oil' ? C.OIL_TIME : C.ALCH_TIME);
  }

  function endBatch(s, reason, emit) {
    const b = s.batch;
    s.batch = null;
    if (b) emit({ type: 'stop', mode: b.mode, reason, batch: b });
  }

  // 다음 할 일을 정한다. 가공하다 재료가 떨어지면 약초 캐기로 돌아온다.
  function plan(s, emit) {
    const a = s.actor;
    a.phase = 'idle';
    if (s.mode === 'gather') {
      let best = -1, bestD = Infinity, wake = Infinity;
      s.herbs.forEach((h, i) => {
        if (h.readyAt > s.t + 1e-9) { wake = Math.min(wake, h.readyAt); return; }
        const p = HERBS[i];
        const d = Math.abs(p.x - a.x) + Math.abs(p.y - a.y) * 2;
        if (d < bestD) { bestD = d; best = i; }
      });
      a.herb = best;
      if (best < 0) {
        a.phase = 'wait';
        a.start = s.t;
        a.end = wake;
        return;
      }
      const p = HERBS[best];
      const sx = a.x <= p.x ? p.x - C.STAND_GAP : p.x + C.STAND_GAP;
      if (!startMove(s, sx, p.y)) startWork(s, 'gather');
      return;
    }
    const st = STATIONS[s.mode];
    a.herb = -1;
    if (startMove(s, st.stand, st.y)) return;
    a.face = st.face;
    const supplied = s.mode === 'alchemy' ? autoSupplyAlchemy(s, emit) : '';
    const why = supplied || shortage(s, s.mode);
    if (why) {
      endBatch(s, why, emit);
      s.mode = 'gather';
      plan(s, emit);
      return;
    }
    startWork(s, s.mode);
  }

  function finishWork(s, emit) {
    const a = s.actor, job = a.job;
    a.job = null;
    if (job.kind === 'gather') {
      const i = a.herb, n = rollSeeds(s);
      s.inv.seed += n;
      s.stats.gathers++;
      s.stats.seeds += n;
      s.herbs[i].readyAt = s.t + C.RESPAWN_MIN + rand(s) * (C.RESPAWN_MAX - C.RESPAWN_MIN);
      s.herbs[i].cutAt = s.t;
      emit({ type: 'gather', herb: i, seeds: n });
    } else if (job.kind === 'oil') {
      // 실패하면 보라색 가루가 나오는데 쓸 데 없는 꽝이라 가방에 넣지 않고, 가루가 터져 잠시 기절한다.
      const ok = rand(s) < C.OIL_RATE;
      if (ok) s.inv.oil++;
      s.stats.oilTry++;
      if (ok) s.stats.oilOk++;
      s.stats.spent += job.meso;
      if (s.batch) { s.batch.tries++; if (ok) s.batch.made++; else s.batch.fail++; s.batch.spent += job.meso; }
      emit({ type: 'oil', ok });
      if (!ok) {
        a.phase = 'stun';
        a.start = s.t;
        a.end = s.t + C.STUN_TIME;
        return;
      }
    } else {
      s.inv.elixir += C.ALCH_YIELD;
      s.stats.crafts++;
      s.stats.elixirs += C.ALCH_YIELD;
      s.stats.spent += job.meso;
      if (s.batch) { s.batch.tries++; s.batch.made += C.ALCH_YIELD; s.batch.spent += job.meso; }
      emit({ type: 'alchemy', made: C.ALCH_YIELD });
    }
    plan(s, emit);
  }

  function actorEvent(s, emit) {
    const a = s.actor;
    if (a.phase === 'move') {
      a.x = a.tx;
      a.y = a.ty;
      if (a.route && a.route.length) {
        beginSegment(s, a.route.shift());
        return;
      }
      // 혼자 캐는 밭이라 고른 약초는 도착할 때까지 그대로 있다. 저장본이 꼬였을 때만 다시 고른다.
      if (s.mode === 'gather' && a.herb >= 0 && s.herbs[a.herb].readyAt <= s.t + 1e-9) startWork(s, 'gather');
      else plan(s, emit);
      return;
    }
    if (a.phase === 'work') { finishWork(s, emit); return; }
    plan(s, emit);
  }

  // 지금 하던 일을 멈춘다. 이동 중이면 그 자리에 서고, 넣은 재료는 돌려준다.
  function cancel(s) {
    const a = s.actor;
    if (a.phase === 'move') {
      const p = posAt(a, s.t);
      a.x = p.x;
      a.y = p.y;
    }
    if (a.phase === 'work' && a.job) {
      ['seed', 'oil', 'crystal', 'stone'].forEach(k => { s.inv[k] += a.job[k] || 0; });
      s.meso += a.job.meso || 0;
    }
    a.job = null;
    a.phase = 'idle';
    a.route = [];
    a.herb = -1;
    a.start = a.end = s.t;
  }

  // ---------------------------------------------------------------- 공개 동작

  function setMode(s, mode, emit) {
    emit = emit || noop;
    if (MODES.indexOf(mode) < 0) return 'mode';
    if (mode === s.mode) return '';
    if (mode !== 'gather') {
      const supplied = mode === 'alchemy' ? autoSupplyAlchemy(s, emit) : '';
      const why = supplied || shortage(s, mode);
      if (why) return why;
    }
    // 기절은 다른 일을 눌러도 풀리지 않는다. 할 일만 바꿔 두고 깨어나면 그리로 간다.
    const stunned = s.actor.phase === 'stun';
    if (!stunned) cancel(s);
    endBatch(s, 'switch', emit);
    s.mode = mode;
    if (mode !== 'gather') s.batch = { mode, tries: 0, made: 0, fail: 0, spent: 0 };
    if (!stunned) plan(s, emit);
    return '';
  }

  // 사건(시세 변동·도착·작업 끝)이 일어나는 시각으로 곧장 건너뛴다. 사건 시각은 직전 사건 시각에서만
  // 계산하므로 한 번에 흘리든 프레임마다 잘게 흘리든 같은 결과가 나온다.
  function advance(s, dt, emit) {
    emit = emit || noop;
    const end = s.t + clamp(Number(dt) || 0, 0, C.OFFLINE_CAP);
    let guard = 0;
    while (guard++ < 1e7) {
      const next = Math.min(s.market.next, s.actor.end);
      if (!(next <= end)) break;
      s.t = Math.max(s.t, next);
      if (s.market.next <= s.t) {
        marketTick(s, emit);
        s.market.next += C.TICK;
      }
      if (s.actor.end <= s.t) actorEvent(s, emit);
    }
    s.t = end;
  }

  // 판매 금액에서 수수료(올림)를 뗀 실수령액.
  const afterFee = gross => gross - Math.ceil(gross * C.FEE_PCT / 100);

  function sell(s, key, qty) {
    if (SELL.indexOf(key) < 0) return null;
    const n = Math.min(s.inv[key], Math.floor(Number(qty) || 0));
    if (!(n > 0)) return null;
    const price = quote(s, key, 'bid');
    const gross = price * n;
    const net = afterFee(gross);
    s.inv[key] -= n;
    s.meso += net;
    s.stats.income += net;
    s.stats.sold[key] += n;
    return { key, qty: n, price, gross, fee: gross - net, net };
  }

  // 매도 호가로 산다(구매 수수료 없음). 메소가 모자라면 살 수 있는 만큼만 산다.
  function buy(s, key, qty) {
    if (BUY.indexOf(key) < 0) return null;
    const want = Math.floor(Number(qty) || 0);
    const price = quote(s, key, 'ask');
    const n = Math.min(want, Math.floor(s.meso / price));
    if (!(n > 0)) return null;
    const cost = price * n;
    s.inv[key] += n;
    s.meso -= cost;
    s.stats.bought += cost;
    return { key, qty: n, want, price, cost };
  }

  // 지금 오일을 전부 재물비로 만들 때 더 사야 하는 재료 수.
  function needFor(s, key) {
    const per = key === 'crystal' ? C.ALCH_CRYSTALS : key === 'stone' ? C.ALCH_STONES : 0;
    return Math.max(0, Math.floor(s.inv.oil / C.ALCH_OILS) * per - s.inv[key]);
  }

  // 재물비 1회(6개)에 드는 메소: 포션 빈병 + 지금 시세의 최상결 2개 + 현자의 돌 1개.
  function alchCost(s) {
    const p = k => quote(s, k, 'ask');
    return C.POTION_BOTTLE + p('crystal') * C.ALCH_CRYSTALS + p('stone') * C.ALCH_STONES;
  }

  // 씨앗 1개를 그냥 팔 때와 오일·재물비로 만들어 팔 때 받는 돈(평균, 시간은 뺌).
  // 재물비 쪽은 재료를 지금 시세로 산다고 보고 뺀다.
  function seedValues(s) {
    const keep = 1 - C.FEE_PCT / 100;
    const bid = k => quote(s, k, 'bid');
    const perOil = (C.ALCH_YIELD * bid('elixir') * keep - alchCost(s)) / C.ALCH_OILS;
    return {
      direct: bid('seed') * keep,
      viaOil: (C.OIL_RATE * bid('oil') * keep - C.OIL_BOTTLE) / C.OIL_SEEDS,
      viaElixir: (C.OIL_RATE * perOil - C.OIL_BOTTLE) / C.OIL_SEEDS,
      oilDirect: bid('oil') * keep,
      oilViaElixir: perOil
    };
  }

  // 넥슨 캐릭터 이미지(300×300, 투명 배경)의 알파 값에서 발 위치를 찾는다. 무기·망토가 옆으로
  // 뻗어도 흔들리지 않게 맨 아래 몇 줄(발)의 가운데를 x로, 맨 아래 줄 바로 아래를 y로 쓴다.
  function spriteAnchor(alpha, w, h) {
    const CUT = 16, solid = (x, y) => alpha[y * w + x] > CUT;
    let top = -1, bottom = -1;
    for (let y = 0; y < h && top < 0; y++) for (let x = 0; x < w; x++) if (solid(x, y)) { top = y; break; }
    if (top < 0) return { ok: false };
    for (let y = h - 1; y >= top && bottom < 0; y--) for (let x = 0; x < w; x++) if (solid(x, y)) { bottom = y; break; }
    let sum = 0, n = 0;
    for (let y = Math.max(top, bottom - 5); y <= bottom; y++) for (let x = 0; x < w; x++) if (solid(x, y)) { sum += x; n++; }
    return { ok: true, x: sum / n + 0.5, y: bottom + 1, top, height: bottom + 1 - top };
  }

  // ---------------------------------------------------------------- 상태 만들기 · 불러오기

  function newMarket() {
    const items = {};
    KEYS.forEach(k => { items[k] = { price: ITEMS[k].base, prev: ITEMS[k].base, drift: 0, shock: 0, hist: [] }; });
    return { tick: 0, next: C.TICK, mood: 0, news: [], items };
  }

  function newStats() {
    const sold = {};
    SELL.forEach(k => { sold[k] = 0; });
    return { gathers: 0, seeds: 0, oilTry: 0, oilOk: 0, crafts: 0, elixirs: 0, spent: 0, bought: 0, income: 0, sold };
  }

  function create(seed) {
    const inv = {};
    KEYS.forEach(k => { inv[k] = 0; });
    const s = {
      v: 1,
      t: 0,
      rng: (Number(seed) >>> 0) || 1,
      meso: C.START_MESO,
      inv,
      mode: 'gather',
      batch: null,
      herbs: HERBS.map(() => ({ readyAt: 0, cutAt: -1 })),
      actor: { x: 480, y: WORLD.ground, face: 1, phase: 'idle', start: 0, end: 0,
        fx: 480, fy: WORLD.ground, tx: 480, ty: WORLD.ground, how: 'walk', route: [], herb: -1, job: null },
      market: newMarket(),
      stats: newStats()
    };
    // 처음 열었을 때도 차트가 비어 있지 않게 2분어치 시세를 미리 굴려 둔다. 첫 화면에 뜬금없는 소식은 지운다.
    for (let i = 0; i < 40; i++) marketTick(s, noop);
    s.market.news = [];
    return s;
  }

  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const count = v => Math.max(0, Math.floor(num(v, 0)));

  // 저장본을 믿지 않고 하나씩 검사한다. 고칠 수 없으면 null. 예전 저장본에 없던 품목은 0개로 시작한다.
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
    const s = create(num(raw.rng, 1));
    s.t = Math.max(0, num(raw.t, 0));
    s.rng = num(raw.rng, 1) | 0;
    s.meso = Math.max(0, Math.floor(num(raw.meso, C.START_MESO)));
    if (raw.inv) KEYS.forEach(k => { s.inv[k] = count(raw.inv[k]); });
    if (raw.stats) {
      Object.keys(s.stats).forEach(k => { if (k !== 'sold') s.stats[k] = count(raw.stats[k]); });
      if (raw.stats.sold) SELL.forEach(k => { s.stats.sold[k] = count(raw.stats.sold[k]); });
    }
    if (Array.isArray(raw.herbs) && raw.herbs.length === HERBS.length) {
      s.herbs = raw.herbs.map(h => ({ readyAt: num(h && h.readyAt, 0), cutAt: num(h && h.cutAt, -1) }));
    } else {
      s.herbs.forEach(h => { h.readyAt = s.t; });
    }
    const m = raw.market;
    if (m && m.items) {
      s.market.tick = count(m.tick);
      s.market.mood = clamp(num(m.mood, 0), -1, 1);
      s.market.next = num(m.next, s.t + C.TICK);
      if (s.market.next < s.t || s.market.next > s.t + C.TICK) s.market.next = s.t + C.TICK;
      s.market.news = Array.isArray(m.news) ? m.news.filter(n => n && typeof n.text === 'string').slice(0, 6) : [];
      KEYS.forEach(k => {
        const src = m.items[k], it = s.market.items[k];
        if (!src) return;
        it.drift = clamp(num(src.drift, 0), -1, 1);
        it.shock = clamp(num(src.shock, 0), -0.6, 0.6);
        const hist = Array.isArray(src.hist) ? src.hist.filter(p => typeof p === 'number' && p > 0 && Number.isFinite(p)) : [];
        if (hist.length) it.hist = hist.slice(-C.HISTORY);
        it.price = num(src.price, 0) > 0 ? src.price : it.hist[it.hist.length - 1];
        it.prev = num(src.prev, 0) > 0 ? src.prev : it.price;
      });
    }
    s.mode = MODES.indexOf(raw.mode) >= 0 ? raw.mode : 'gather';
    if (raw.batch && raw.batch.mode === s.mode && s.mode !== 'gather') {
      s.batch = { mode: s.mode, tries: count(raw.batch.tries), made: count(raw.batch.made),
        fail: count(raw.batch.fail), spent: count(raw.batch.spent) };
    } else if (s.mode !== 'gather') {
      s.batch = { mode: s.mode, tries: 0, made: 0, fail: 0, spent: 0 };
    }
    const a = raw.actor || {}, b = s.actor;
    b.x = clamp(num(a.x, 480), 0, WORLD.w);
    b.y = clamp(num(a.y, WORLD.ground), 0, WORLD.h);
    b.face = a.face === -1 ? -1 : 1;
    // 이동·작업은 그대로 이어 가고, 앞뒤가 안 맞으면 그 자리에서 다시 계획한다.
    const job = a.job && ['gather', 'oil', 'alchemy'].indexOf(a.job.kind) >= 0 ? a.job : null;
    const phaseOk = a.phase === 'move' || a.phase === 'wait' || a.phase === 'stun' || (a.phase === 'work' && job);
    if (phaseOk && num(a.end, -1) >= s.t && num(a.start, -1) <= s.t) {
      b.phase = a.phase;
      b.start = a.start;
      b.end = a.end;
      b.how = ['walk', 'ladder', 'tele'].indexOf(a.how) >= 0 ? a.how : 'walk';
      b.fx = num(a.fx, b.x); b.fy = num(a.fy, b.y); b.tx = num(a.tx, b.x); b.ty = num(a.ty, b.y);
      b.route = Array.isArray(a.route) ? a.route.map(seg => ({
        x: clamp(num(seg && seg.x, b.tx), 0, WORLD.w),
        y: clamp(num(seg && seg.y, b.ty), 0, WORLD.h),
        how: seg && seg.how === 'ladder' ? 'ladder' : 'walk'
      })).slice(0, 8) : [];
      b.herb = Number.isInteger(a.herb) && a.herb >= -1 && a.herb < HERBS.length ? a.herb : -1;
      b.job = job ? { kind: job.kind, seed: count(job.seed), oil: count(job.oil), crystal: count(job.crystal),
        stone: count(job.stone), meso: count(job.meso) } : null;
      if (b.job && b.job.kind === 'gather' && b.herb < 0) { b.phase = 'idle'; b.job = null; b.end = s.t; }
      if (b.phase === 'move' && s.mode === 'gather' && b.herb < 0) { b.phase = 'idle'; b.end = s.t; }
    } else {
      b.phase = 'idle';
      b.start = b.end = s.t;
    }
    return s;
  }

  const API = {
    C, ITEMS, KEYS, SELL, BUY, MODES, WORLD, PLATFORMS, HERBS, STATIONS, NEWS,
    create, normalize, advance, setMode, sell, buy, needFor, alchCost, afterFee, shortage, alchemyAutoShortage, autoSupplyAlchemy, posAt, seedValues, quote, rollSeeds, rand,
    spriteAnchor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.HerbIdleCore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
