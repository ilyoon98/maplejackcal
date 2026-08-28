// 아케인셰이드/이노센트/순백 주흔 기댓값 계산 엔진
// 순수 함수만 포함 (DOM 의존 없음)

/**
 * 상태변수는 (S, R) 두 개다.
 *   S = 지금까지 성공한 작 수
 *   R = 지금 당장 시도할 수 있는 "무료" 남은 슬롯 수 (0 ~ totalJak)
 * 시작 상태는 (0, totalJak). 목표는 S === totalJak.
 *
 * 주흔 시도는 성공/실패 상관없이 R을 1 소비한다(실패해도 S는 그대로, R만 줄어듦).
 * 매 상태에서 아래 세 행동 중 기대비용이 가장 낮은 걸 고른다:
 *   1) 시도(attempt): R>0일 때만 가능. cost 지불, 확률 p로 (S+1,R-1), 실패하면
 *      그 자리에서 다시 "순백으로 이 실패를 되돌릴지" 여부를 비교(자기참조).
 *   2) 순백 선점(topup): 시도 없이 그냥 순백만 써서 R을 1 복구 (S,R)->(S,R+1).
 *      R이 0이라 시도가 불가능할 때 특히 중요한 선택지 — 이걸 빠뜨리면 계산이 틀어진다.
 *   3) 이노센트/아크이노센트(reset): 통째로 (0, totalJak)으로 초기화.
 *
 * @param {Object} p
 * @param {number} p.totalJak    완성까지 필요한 총 작 수
 * @param {number} p.prob        이번에 고른 확률 구간의 성공확률 (0~1)
 * @param {number} p.cost        이번에 고른 확률 구간의 1회 시도 비용
 * @param {number} p.resetCost   이노센트/아크이노센트 1회 비용 (주흔으로 조달 안 했으면 0)
 * @param {number} p.protectCost 순백 1회 비용 (주흔으로 조달 안 했으면 0)
 * @param {boolean} p.useReset   초기화(이노센트/아크이노센트) 자체를 보유하고 있는지 여부
 */
function solve(p) {
  const n = p.totalJak;
  const prob = clampProb(p.prob);
  const cost = p.cost;
  const resetCost = p.resetCost;
  const protectCost = p.protectCost;
  const useReset = p.useReset;

  // V[S][R], ACT[S][R] = {type:'reset'|'topup'|'attempt', protectOnFail:bool}
  const V = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));
  const ACT = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(null));

  const MAX_ITER = 20000;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxDelta = 0;
    for (const Sorder of [range(0, n - 1), range(0, n - 1).reverse()]) {
      for (const S of Sorder) {
        for (const Rorder of [range(0, n), range(0, n).reverse()]) {
          for (const R of Rorder) {
            let best = Infinity;
            let act = null;

            // (S,R)=(0,n)에서는 초기화가 자기 자신으로 돌아가는 무의미한 행동이라 후보에서 뺀다.
            // resetCost가 0(예: "조달 안 함"으로 무료 취급)일 때 이 자기참조가 V[0][n]을 그 자리의
            // "현재 값"과 그대로 비교하게 만들어서, 매 이터레이션마다 스스로와 동률로 이기며 진짜
            // 기대비용(시도를 거쳐야만 나오는 값)으로 자라나지 못하고 0에 멈춰버리는 퇴화 고정점이
            // 생긴다 — 이를 막기 위한 예외 처리.
            if (useReset && !(S === 0 && R === n)) {
              const resetV = resetCost + V[0][n];
              if (resetV < best) { best = resetV; act = { type: 'reset' }; }
            }
            // 이미 성공했거나 아직 남아 있는 슬롯(S + R)을 제외하고,
            // 실제로 실패해 소모된 슬롯이 있을 때만 순백으로 복구할 수 있다.
            if (S + R < n) {
              const topupV = protectCost + V[S][R + 1];
              if (topupV < best) { best = topupV; act = { type: 'topup' }; }
            }
            if (R > 0) {
              const succ = V[S + 1][R - 1];
              const failNoProtect = V[S][R - 1];
              const failProtect = protectCost + V[S][R]; // 자기참조: 이전 이터레이션 값 사용, 반복하며 수렴
              const protectOnFail = failProtect < failNoProtect;
              const attemptV = cost + prob * succ + (1 - prob) * (protectOnFail ? failProtect : failNoProtect);
              if (attemptV < best) { best = attemptV; act = { type: 'attempt', protectOnFail }; }
            }

            maxDelta = Math.max(maxDelta, Math.abs(best - V[S][R]));
            V[S][R] = best;
            ACT[S][R] = act;
          }
        }
      }
    }
    if (maxDelta < 1e-7) break;
  }

  // 동일 정책 하에서 "기대 시도 횟수"(주흔을 실제로 몇 번 쓰는지)도 별도 계산
  const A = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxDelta = 0;
    for (const Sorder of [range(0, n - 1), range(0, n - 1).reverse()]) {
      for (const S of Sorder) {
        for (const Rorder of [range(0, n), range(0, n).reverse()]) {
          for (const R of Rorder) {
            const act = ACT[S][R];
            let newA;
            if (!act || act.type === 'reset') newA = A[0][n];
            else if (act.type === 'topup') newA = A[S][R + 1];
            else {
              const failA = act.protectOnFail ? A[S][R] : A[S][R - 1];
              newA = 1 + prob * A[S + 1][R - 1] + (1 - prob) * failA;
            }
            maxDelta = Math.max(maxDelta, Math.abs(newA - A[S][R]));
            A[S][R] = newA;
          }
        }
      }
    }
    if (maxDelta < 1e-7) break;
  }

  return {
    totalJak: n,
    V,
    ACT,
    attempts: A,
    totalTraces: V[0][n],
    totalAttempts: A[0][n],
  };
}

/**
 * solve()가 고른 정책(ACT)은 그대로 둔 채, 실제 비용(예: 순백을 "주흔으로 조달"하지
 * 않아 protectCost=0인 경우)으로 기대 주흔만 다시 계산한다. 전략/손절 기준표는 항상
 * 표준 비용(순백 20,000)으로 계산해서 고정해두고, "조달 여부" 체크박스는 이 함수의
 * protectCost를 통해 화면에 보여줄 숫자에만 영향을 주도록 분리하기 위함이다.
 */
function evaluate(p, ACT) {
  const n = p.totalJak;
  const prob = clampProb(p.prob);
  const cost = p.cost;
  const resetCost = p.resetCost;
  const protectCost = p.protectCost;

  const V = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));

  const MAX_ITER = 20000;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxDelta = 0;
    for (const Sorder of [range(0, n - 1), range(0, n - 1).reverse()]) {
      for (const S of Sorder) {
        for (const Rorder of [range(0, n), range(0, n).reverse()]) {
          for (const R of Rorder) {
            const act = ACT[S][R];
            let val;
            if (!act || act.type === 'reset') {
              val = resetCost + V[0][n];
            } else if (act.type === 'topup') {
              val = protectCost + V[S][R + 1];
            } else {
              const succ = V[S + 1][R - 1];
              const failVal = act.protectOnFail ? protectCost + V[S][R] : V[S][R - 1];
              val = cost + prob * succ + (1 - prob) * failVal;
            }
            maxDelta = Math.max(maxDelta, Math.abs(val - V[S][R]));
            V[S][R] = val;
          }
        }
      }
    }
    if (maxDelta < 1e-7) break;
  }

  return { totalJak: n, V, totalTraces: V[0][n] };
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function clampProb(v) {
  return Math.min(1, Math.max(1e-6, v));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { solve, evaluate };
}
