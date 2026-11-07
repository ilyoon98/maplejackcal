(function () {
  'use strict';
  const host = document.querySelector('[data-site-navigation]');
  if (!host) return;

  host.innerHTML = `
    <nav class="site-nav" aria-label="사이트 메뉴">
      <div class="site-tabs-track site-groups">
        <span class="site-tabs-pill" aria-hidden="true"></span>
        <a class="site-tab" href="index.html" data-group="home"><span class="site-tab-icon"></span>홈</a>
        <button type="button" class="site-tab" data-group="calc" aria-expanded="false" aria-controls="site-menu-calc"><span class="site-tab-icon"></span>계산기</button>
        <button type="button" class="site-tab" data-group="play" aria-expanded="false" aria-controls="site-menu-play"><span class="site-tab-icon"></span>시뮬레이터</button>
        <a class="site-tab" href="starforce_history.html" data-group="history"><span class="site-tab-icon"></span>로그보기</a>
      </div>
      <div class="site-menu" id="site-menu-calc" data-group="calc" hidden></div>
      <div class="site-menu" id="site-menu-play" data-group="play" hidden></div>
    </nav>`;
})();
