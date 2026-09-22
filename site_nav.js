// 상단 대분류 탭(뽑기 / 계산기) 드롭다운 열고 닫기.
// 페이지마다 nav 안의 링크 목록은 각자 하드코딩돼 있고, 이 스크립트는 그 열고/닫는
// 동작만 공통으로 처리한다.
(function () {
  function closeAll() {
    document.querySelectorAll('.site-nav-dropdown.open').forEach(function (el) {
      el.classList.remove('open');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.site-nav-group-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var dropdown = btn.nextElementSibling;
        var wasOpen = dropdown.classList.contains('open');
        closeAll();
        if (!wasOpen) dropdown.classList.add('open');
      });
    });
  });

  document.addEventListener('click', closeAll);
})();
