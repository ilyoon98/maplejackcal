// 스타포스 강화 확률·비용 원본 데이터.
//
// BASE_SUCCESS / BASE_DESTROY 는 스타캐치 보정이 들어가기 전의 "기본" 확률(%)이고,
// 실제 게임에 적용되는 확률은 스타캐치가 자동 적용된 값이다.
//   성공 = 기본성공 × 1.05
//   파괴 = 기본파괴 × (100 - 적용성공) / (100 - 기본성공)   ← 실패+파괴 몫이 줄어든 만큼 비례 축소
// 이렇게 만든 표가 15성 31.5%/2.055%, 17성 15.75%/6.74%, 29성 1.05%/19.79% 로
// 공개된 확률표와 일치한다.
//
// 비용은 100 × round(레벨³ × (성+1)^2.7 / 나눗값) + 10 (0~9성은 지수 없이 (성+1)).
// 나눗값은 chuchu.gg / mesu.live 의 기댓값 표를 역산해 맞춘 값으로,
// 레벨 200 기준 12→30성 누적 기댓값이 소수점 아래까지 일치한다.
(function (global) {
  var BASE_SUCCESS = [95, 90, 85, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30,
                      30, 30, 15, 15, 15, 30, 15, 15, 10, 10, 10, 7, 5, 3, 1];
  var BASE_DESTROY = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                      2.1, 2.1, 6.8, 6.8, 8.5, 10.5, 12.75, 17, 18, 18, 18, 18.6, 19, 19.4, 19.8];
  // 10성부터는 (성+1)^2.7 을 쓰고 성마다 나눗값이 다르다. 0~9성은 LOW_DIV 하나로 끝난다.
  var LOW_DIV = 2500 / 0.7;
  var DIV = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
             57100, 31400, 21400, 15700, 10700,
             20000, 20000, 15000, 7000, 4500, 20000, 12500,
             20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000];

  var RATES = BASE_SUCCESS.map(function (bs, star) {
    var success = bs * 1.05;
    var destroy = BASE_DESTROY[star] * (100 - success) / (100 - bs);
    return { success: success / 100, destroy: destroy / 100 };
  });

  function baseCost(star, level) {
    if (star <= 9) return 100 * Math.round(Math.pow(level, 3) * (star + 1) / LOW_DIV) + 10;
    return 100 * Math.round(Math.pow(level, 3) * Math.pow(star + 1, 2.7) / DIV[star]) + 10;
  }

  global.StarforceData = {
    MAX_STAR: 30,
    DESTROY_RESET_STAR: 12,   // 파괴되면 12성으로 되돌아간다
    PROTECT_STARS: [15, 16, 17],
    PROTECT_COST_MULTIPLIER: 3, // 파괴방지는 강화비용 3배(200% 추가)
    RATES: RATES,
    baseCost: baseCost
  };
})(window);
