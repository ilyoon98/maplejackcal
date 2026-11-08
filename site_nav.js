// Shared ordering and release dates for navigation and home cards.
// Add a new page's YYYY-MM-DD release date here: NEW expires after 30 days (KST).
window.SiteNavigation = {
  categories: [
      ['장비 강화', ['trace_calc.html','starforce_calc.html','cube_calc.html','cube_option_calc.html','flame_calc.html','item_craft_calc.html','authentic_symbol_calc.html'], 'calc'],
      ['보스', ['boss_income_calc.html','boss_buff_planner.html','party_boss_scheduler.html','shared_boss_rates.html'], 'calc'],
      ['재화 · 성장', ['trade_margin_calc.html','meso_market_calc.html','hunting_calc.html','accessory_planner.html','wealth_elixir_calc.html','coin_shop_calc.html'], 'calc'],
      ['강화 시뮬레이터', ['cube_play.html','starforce_play.html'], 'play'],
      ['뽑기 시뮬레이터', ['pet_gacha.html','boutique_gacha.html','seedring_gacha.html'], 'play'],
      ['미니게임', ['herb_idle.html'], 'play']
    ],
  menuItems: {
    'trace_calc.html': ['주흔 기댓값 계산기', '기대 메소·시도 횟수'],
    'starforce_calc.html': ['스타포스 기댓값 계산기', '목표 성까지 기대 메소·파괴'],
    'cube_calc.html': ['큐브 등급업 비용 계산기', '큐브별 기대 개수와 비용'],
    'cube_option_calc.html': ['큐브 옵션 확률 계산기', '목표 잠재옵션 확률·기대 메소'],
    'flame_calc.html': ['추가옵션 계산기', '목표 추옵 확률·불꽃·메소'],
    'item_craft_calc.html': ['아이템 제작 비용 계산기', '노작부터 완성까지 평균 비용'],
    'authentic_symbol_calc.html': ['어센틱 심볼 계산기', '최소 메소 강화 순서'],
    'boss_income_calc.html': ['보스 수익 정산 계산기', '주간·월간 수익 정산'],
    'boss_buff_planner.html': ['보스 버프 동선 계산기', '30분 버프 안 최적 조합'],
    'party_boss_scheduler.html': ['파티 보스 스케줄러', '캐릭터 외형·파티 배율 합산'],
    'shared_boss_rates.html': ['공용 환산 배율', '캡처·조회로 보스별 배율 입력'],
    'trade_margin_calc.html': ['되팔기 손익 계산기', '본전 판매가와 수수료 제외 순이익'],
    'meso_market_calc.html': ['메소마켓 시세 계산기', '거래 방식별 실수령 비교'],
    'hunting_calc.html': ['아이템 획득량 계산기', '30분 사냥 조각·메소'],
    'accessory_planner.html': ['장신구 맞추기', '9부위 드랍·메획 배치'],
    'wealth_elixir_calc.html': ['재물 비약 제작 계산기', '씨앗·오일·비약 가격 비교'],
    'coin_shop_calc.html': ['이벤트 코인샵 계산기', '주차별 구매 계획'],
    'cube_play.html': ['큐브 시뮬레이터', '가상 큐브와 천장 기록'],
    'starforce_play.html': ['스타포스 시뮬레이터', '목표 성까지 가상 강화'],
    'pet_gacha.html': ['펫 시뮬레이터', '원더베리·루나 크리스탈'],
    'boutique_gacha.html': ['부티크 기프트 시뮬레이터', '부티크 기프트 가상 뽑기'],
    'seedring_gacha.html': ['시드링 시뮬레이터', '보스 반지 상자 가상 뽑기'],
    'herb_idle.html': ['달빛 약초 채집소', '약초 채집·가공·판매']
  },
  releases: { 'hunting_calc.html': '2026-09-30', 'flame_calc.html': '2026-09-30', 'wealth_elixir_calc.html': '2026-10-02', 'herb_idle.html': '2026-10-02', 'party_boss_scheduler.html': '2026-11-07', 'shared_boss_rates.html': '2026-11-07', 'accessory_planner.html': '2026-11-07' },
  newDays: 30,
  // 메뉴와 홈 카드에 쓰는 게임 아이템 아이콘. 새 페이지를 추가하면 여기에도 넣는다.
  icons: {
    'index.html': 'icons/home/단풍잎.webp',
    'starforce_history.html': 'icons/home/탐정수첩.webp',
    'trace_calc.html': 'icons/home/주문의흔적.webp',
    'starforce_calc.html': 'icons/home/스타포스강화권.webp',
    'authentic_symbol_calc.html': 'icons/authentic/cernium.webp',
    'boss_income_calc.html': 'icons/home/boss-crystal-weekly.png',
    'boss_buff_planner.html': 'icons/home/익스트림레드.webp',
    'party_boss_scheduler.html': 'icons/home/탐정수첩.webp',
    'shared_boss_rates.html': 'icons/home/메이프릴카메라.webp',
    'cube_calc.html': 'icons/cube/레드.webp',
    'cube_option_calc.html': 'icons/cube/블랙.webp',
    'flame_calc.html': 'icons/coin-shop/영환불.webp',
    'item_craft_calc.html': 'icons/home/황금망치.webp',
    'trade_margin_calc.html': 'icons/home/메소주머니.webp',
    'meso_market_calc.html': 'icons/home/메이플포인트.webp',
    'hunting_calc.html': 'icons/home/솔에르다조각.webp',
    'accessory_planner.html': 'icons/coin-shop/이벤트링.webp',
    'wealth_elixir_calc.html': 'icons/craft/소형재물획득의비약.webp',
    'coin_shop_calc.html': 'icons/home/반짝이는메이플코인.webp',
    'cube_play.html': 'icons/cube/명장.webp',
    'starforce_play.html': 'icons/home/스타포스강화권.webp',
    'boutique_gacha.html': 'icons/home/선물상자.webp',
    'pet_gacha.html': 'icons/home/원더베리.webp',
    'seedring_gacha.html': 'icons/seedring/Use_Black_Jade_Boss_Ring_Box.webp',
    'herb_idle.html': 'icons/craft/보라약초.webp'
  },
  // 상단 탭(분류)과 홈 섹션 제목에 쓰는 아이콘
  groupIcons: {
    home: 'icons/home/단풍잎.webp',
    calc: 'icons/home/감정돋보기.webp',
    play: 'icons/home/프리미엄부화기.webp',
    history: 'icons/home/탐정수첩.webp'
  }
};

// 모든 일반 페이지에서 금요일 10:30(KST) 이후 이번 주 썬데이 메이플을 확인한다.
// 공통 내비게이션 파일에서 한 번만 불러와 페이지별 마크업을 반복하지 않는다.
(function loadSundayMapleEvent() {
  if (document.querySelector('script[data-sunday-maple-event]')) return;
  var script = document.createElement('script');
  script.src = 'sunday_event.js';
  script.defer = true;
  script.dataset.sundayMapleEvent = 'true';
  document.head.appendChild(script);
})();
// 분류를 열면 표시를 그 탭으로 옮기고, 닫으면 현재 페이지의 분류로 돌린다.
(function () {
  // 탭을 누르면 페이지가 통째로 새로 뜨기 때문에 직전 위치가 남지 않는다.
  // 누를 때 그 값을 넘겨놔야 새 페이지에서 "이전 분류 → 현재 분류"로 슬라이드할 수 있다.
  var FROM_KEY = 'siteTabsFrom';

  function readFrom() {
    try {
      var v = sessionStorage.getItem(FROM_KEY);
      sessionStorage.removeItem(FROM_KEY);
      return v;
    } catch (err) { return null; }
  }
  function writeFrom(group) {
    try { sessionStorage.setItem(FROM_KEY, group || ''); } catch (err) {}
  }

  function place(pill, tab) {
    if (!tab) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '';
    pill.style.width = tab.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
  }
  function snap(pill, tab) {
    pill.style.transition = 'none';
    place(pill, tab);
    void pill.offsetWidth; // reflow so the jump lands before the transition comes back
    pill.style.transition = '';
  }
  // 숨겨진 탭(백그라운드로 열린 경우)에서는 rAF가 돌지 않아 pill이 이전 자리에 멈춰버린다.
  // 그럴 땐 애니메이션 없이 바로 현재 탭에 놓는다.
  function slide(pill, fromTab, toTab) {
    if (!fromTab || fromTab === toTab || document.hidden) { snap(pill, toTab); return; }
    snap(pill, fromTab);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { place(pill, toTab); });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var track = nav.querySelector('.site-groups');
    if (!track) return;
    var page = location.pathname.split('/').pop() || 'index.html';
    if (!page.endsWith('.html')) page += '.html';
    var pill = track.querySelector('.site-tabs-pill');
    var tabs = Array.from(track.querySelectorAll('.site-tab'));
    var menus = Array.from(nav.querySelectorAll('.site-menu'));
    var navigation = window.SiteNavigation;
    navigation.categories.forEach(function ([title, pages, group]) {
      var menu = menus.find(function (panel) { return panel.dataset.group === group; });
      if (!menu) return;
      var section = document.createElement('section');
      section.className = 'site-menu-category';
      var heading = document.createElement('h3');
      heading.textContent = title;
      section.appendChild(heading);
      pages.forEach(function (href) {
        var [name, description] = navigation.menuItems[href];
        var link = document.createElement('a');
        link.href = href;
        link.className = 'site-menu-item';
        link.innerHTML = '<span class="site-menu-icon"></span><span><span class="site-menu-name"></span><span class="site-menu-desc"></span></span>';
        link.querySelector('.site-menu-name').textContent = name;
        link.querySelector('.site-menu-desc').textContent = description;
        section.appendChild(link);
      });
      menu.appendChild(section);
    });

    var current = Array.from(nav.querySelectorAll('a')).find(function (link) { return link.getAttribute('href') === page; });
    var pageGroup = 'calc';
    if (current) {
      current.setAttribute('aria-current', 'page');
      current.classList.add('active');
      pageGroup = current.closest('[data-group]').dataset.group;
    }
    tabs.forEach(function (tab) { tab.classList.toggle('active', tab.dataset.group === pageGroup); });

    // One release list drives both surfaces, without moving new items out of their category.
    var today = Date.parse(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) + 'T00:00:00+09:00');
    document.querySelectorAll('a.site-menu-item, a.tool-card').forEach(function (link) {
      var released = window.SiteNavigation.releases[link.getAttribute('href')];
      var age = today - Date.parse(released + 'T00:00:00+09:00');
      if (!released || !Number.isFinite(age) || age < 0 || age >= window.SiteNavigation.newDays * 86400000) return;
      var label = link.querySelector('.site-menu-name, h2');
      if (!label || label.querySelector('.site-new-badge')) return;
      var badge = document.createElement('span'); badge.className = 'site-new-badge';
      badge.textContent = 'NEW'; badge.setAttribute('aria-label', '새로 추가됨');
      label.appendChild(badge);
    });

    // 페이지마다 하드코딩된 탭·메뉴 이모지를 실제 아이템 아이콘으로 바꾸고, 홈 카드와 페이지 제목 앞에도 같은 아이콘을 붙인다.
    function itemIcon(src, className) {
      var img = document.createElement('img');
      img.src = src; img.alt = ''; img.className = className;
      img.width = 32; img.height = 32; img.decoding = 'async';
      return img;
    }
    var groupIcons = window.SiteNavigation.groupIcons;
    track.querySelectorAll('.site-tab').forEach(function (tab) {
      var slot = tab.querySelector('.site-tab-icon');
      if (slot && groupIcons[tab.dataset.group]) slot.replaceChildren(itemIcon(groupIcons[tab.dataset.group], 'site-item-icon'));
    });
    document.querySelectorAll('[data-site-icon]').forEach(function (heading) {
      var src = groupIcons[heading.dataset.siteIcon];
      if (src && !heading.querySelector('.site-title-icon')) heading.prepend(itemIcon(src, 'site-title-icon'));
    });
    var pageIcon = navigation.icons[page];
    var pageTitle = document.querySelector('h1');
    if (pageIcon && pageTitle && !pageTitle.querySelector('.site-title-icon')) pageTitle.prepend(itemIcon(pageIcon, 'site-title-icon'));
    document.querySelectorAll('a.site-menu-item, a.tool-card').forEach(function (link) {
      var src = window.SiteNavigation.icons[link.getAttribute('href')];
      if (!src) return;
      if (link.classList.contains('site-menu-item')) {
        var slot = link.querySelector('.site-menu-icon');
        if (slot) slot.replaceChildren(itemIcon(src, 'site-item-icon'));
        return;
      }
      var title = link.querySelector('h2');
      if (!title || title.querySelector('.site-item-icon')) return;
      // 제목과 NEW 배지를 한 덩어리로 묶어야 좁은 화면에서 배지가 제목을 밀어내지 않는다.
      var text = document.createElement('span');
      text.className = 'tool-card-title';
      while (title.firstChild) text.appendChild(title.firstChild);
      title.append(itemIcon(src, 'site-item-icon'), text);
    });

    function tabOf(group) {
      for (var i = 0; i < tabs.length; i++) if (tabs[i].dataset.group === group) return tabs[i];
      return null;
    }
    var openGroup = null;

    var from = readFrom();
    slide(pill, from ? tabOf(from) : null, tabOf(pageGroup));

    function close() {
      if (!openGroup) return;
      openGroup = null;
      menus.forEach(function (m) { m.hidden = true; });
      tabs.forEach(function (t) {
        if (t.hasAttribute('aria-expanded')) t.setAttribute('aria-expanded', 'false');
        t.classList.toggle('active', t.dataset.group === pageGroup);
      });
      place(pill, tabOf(pageGroup)); // 같은 페이지 안이라 CSS 트랜지션이 그대로 먹는다
    }
    function open(group) {
      openGroup = group;
      menus.forEach(function (m) { m.hidden = m.dataset.group !== group; });
      tabs.forEach(function (t) {
        if (t.hasAttribute('aria-expanded')) t.setAttribute('aria-expanded', String(t.dataset.group === group));
        t.classList.toggle('active', t.dataset.group === group);
      });
      place(pill, tabOf(group));
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        // 홈은 하위 페이지가 없는 링크라 그대로 이동시킨다.
        if (tab.tagName === 'A') { writeFrom(openGroup || pageGroup); return; }
        e.stopPropagation();
        if (openGroup === tab.dataset.group) close(); else open(tab.dataset.group);
      });
    });

    nav.querySelectorAll('.site-menu-item').forEach(function (item) {
      item.addEventListener('click', function () { writeFrom(openGroup || pageGroup); });
    });

    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !openGroup) return;
      var opener = tabOf(openGroup);
      if (document.activeElement?.closest('.site-menu')) opener.focus();
      close();
    });

    window.addEventListener('resize', function () { snap(pill, tabOf(openGroup || pageGroup)); });
  });
})();
