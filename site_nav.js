// 상단 탭 바의 활성 탭 아래로 filled pill을 부드럽게 옮겨 지금 위치를 보여준다.
// 탭 목록 자체는 페이지마다 하드코딩돼 있고(항상 같은 8개, 같은 순서), 이 스크립트는
// pill 위치 계산만 공통으로 처리한다.
(function () {
  // 탭을 누르면 페이지가 통째로 새로 뜨기 때문에 직전 탭 위치가 남지 않는다.
  // 누를 때 그 값을 넘겨놔야 새 페이지에서 "이전 탭 → 현재 탭"으로 슬라이드할 수 있다.
  var FROM_KEY = 'siteTabsFrom';

  function readFrom() {
    try {
      var v = sessionStorage.getItem(FROM_KEY);
      sessionStorage.removeItem(FROM_KEY);
      return v === null ? -1 : +v;
    } catch (err) { return -1; }
  }
  function writeFrom(i) {
    try { sessionStorage.setItem(FROM_KEY, String(i)); } catch (err) {}
  }

  function place(pill, tab) {
    pill.style.width = tab.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
  }
  function snap(pill, tab) {
    pill.style.transition = 'none';
    place(pill, tab);
    void pill.offsetWidth; // reflow so the jump lands before the transition comes back
    pill.style.transition = '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var track = document.querySelector('.site-tabs-track');
    if (!track) return;
    var pill = track.querySelector('.site-tabs-pill');
    var active = track.querySelector('.site-tab.active');
    var tabs = [].slice.call(track.querySelectorAll('.site-tab'));
    if (!pill || !active) return;

    var from = tabs[readFrom()];
    // 숨겨진 탭(백그라운드로 열린 경우)에서는 rAF가 돌지 않아 pill이 이전 탭에 멈춰버린다.
    // 그럴 땐 애니메이션 없이 바로 현재 탭에 놓는다.
    if (from && from !== active && !document.hidden) {
      snap(pill, from);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { place(pill, active); });
      });
    } else {
      // 새로고침이나 직접 진입: 왼쪽 끝에서 날아오는 것처럼 보이지 않게 바로 제자리에.
      snap(pill, active);
    }

    active.scrollIntoView({ inline: 'center', block: 'nearest' });

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (tab !== active) writeFrom(tabs.indexOf(active));
      });
    });

    window.addEventListener('resize', function () { snap(pill, active); });
  });
})();
