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
    var pill = track.querySelector('.site-tabs-pill');
    var tabs = [].slice.call(track.querySelectorAll('.site-tab'));
    var menus = [].slice.call(nav.querySelectorAll('.site-menu'));

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
