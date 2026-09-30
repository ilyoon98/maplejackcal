// 상단 탭 한 줄. 분류(계산기·놀이)를 누르면 그 아래로 목록 패널이 펼쳐지고,
// 패널이 열려 있는 동안에는 pill이 그 분류로 옮겨간다. 닫으면 지금 보고 있는
// 페이지의 분류로 되돌아온다. 탭 목록은 페이지마다 하드코딩돼 있다.
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
    // 공통 탭으로 추가해 모든 기존 계산기에서 기록 화면으로 이동한다.
    if (!track.querySelector('[data-group="history"]')) {
      var historyTab = document.createElement('a');
      historyTab.href = 'starforce_history.html';
      historyTab.className = 'site-tab';
      historyTab.dataset.group = 'history';
      historyTab.textContent = '📋 로그보기';
      if (location.pathname.endsWith('/starforce_history.html')) {
        track.querySelectorAll('.active').forEach(function (el) { el.classList.remove('active'); });
        historyTab.classList.add('active');
      }
      track.appendChild(historyTab);
    }
    var calcMenu = nav.querySelector('.site-menu[data-group="calc"]');
    if (calcMenu && !calcMenu.querySelector('a[href="hunting_calc.html"]')) {
      var huntingLink = document.createElement('a');
      huntingLink.href = 'hunting_calc.html';
      huntingLink.className = 'site-menu-item';
      huntingLink.innerHTML = '<span class="site-menu-icon">🍁</span><span><span class="site-menu-name">아이템 획득량 계산기</span><span class="site-menu-desc">30분 사냥 조각·메소</span></span>';
      if (location.pathname.endsWith('/hunting_calc.html')) huntingLink.classList.add('active');
      calcMenu.appendChild(huntingLink);
    }
    var pill = track.querySelector('.site-tabs-pill');
    var tabs = [].slice.call(track.querySelectorAll('.site-tab'));
    var menus = [].slice.call(nav.querySelectorAll('.site-menu'));
    var categories = [
      ['장비 강화', ['trace_calc.html','starforce_calc.html','cube_calc.html','cube_option_calc.html','item_craft_calc.html']],
      ['보스', ['boss_income_calc.html','boss_buff_planner.html']],
      ['재화 · 성장', ['trade_margin_calc.html','meso_market_calc.html','hunting_calc.html','coin_shop_calc.html','authentic_symbol_calc.html']],
      ['강화 놀이', ['cube_play.html','starforce_play.html']],
      ['뽑기 놀이', ['pet_gacha.html','boutique_gacha.html','seedring_gacha.html']]
    ];
    menus.forEach(function (menu) {
      categories.forEach(function (category) {
        var links = category[1].map(function (href) { return menu.querySelector('a[href="' + href + '"]'); }).filter(Boolean);
        if (!links.length) return;
        var group = document.createElement('section'); group.className = 'site-menu-category';
        var heading = document.createElement('h3'); heading.textContent = category[0]; group.appendChild(heading);
        links.forEach(function (link) { group.appendChild(link); }); menu.appendChild(group);
      });
    });

    function tabOf(group) {
      for (var i = 0; i < tabs.length; i++) if (tabs[i].dataset.group === group) return tabs[i];
      return null;
    }
    // 지금 페이지가 속한 분류(마크업에 박혀 있는 active). 패널을 열어 둘러보는 동안에도 바뀌지 않는다.
    var pageGroup = (function () {
      var t = null;
      tabs.forEach(function (x) { if (x.classList.contains('active')) t = x; });
      return t ? t.dataset.group : null;
    })();
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
      if (e.key === 'Escape') close();
    });

    window.addEventListener('resize', function () { snap(pill, tabOf(openGroup || pageGroup)); });
  });
})();
