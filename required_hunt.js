(() => {
  'use strict';

  const settings = { monster: 290, mobs: 40, meso: 100, drop: 200 };
  const minutesPerHunt = 30;
  const fragmentPrice = 6_500_000;
  const rewards = HuntingCalc.calculate(settings);
  const income = rewards.meso + rewards.fragments * fragmentPrice;
  const number = new Intl.NumberFormat('ko-KR');

  class RequiredHunt extends HTMLElement {
    static observedAttributes = ['meso'];

    connectedCallback() {
      if (!this.count) {
        this.innerHTML = '<span class="required-hunt-label"><img src="icons/craft/소형재물획득의비약.webp" width="20" height="20" alt="">필요 재획</span>' +
          '<strong class="required-hunt-count"></strong><small class="required-hunt-time"></small>';
        this.count = this.querySelector('.required-hunt-count');
        this.time = this.querySelector('.required-hunt-time');
      }
      this.render();
    }

    attributeChangedCallback(name, previous, value) {
      if (previous !== value && this.count) this.render();
    }

    render() {
      const amount = this.getAttribute('meso');
      const meso = amount?.trim() ? Number(amount) : NaN;
      this.hidden = !Number.isFinite(meso) || meso < 0;
      if (this.hidden) return;

      const sessions = Math.round(meso / income);
      const minutes = sessions * minutesPerHunt;
      const units = [[Math.floor(minutes / 1440), '일'], [Math.floor(minutes / 60) % 24, '시간'], [minutes % 60, '분']];
      this.count.textContent = `${number.format(sessions)}재획`;
      this.time.textContent = units.filter(([value]) => value > 0)
        .map(([value, unit]) => `${number.format(value)}${unit}`).join(' ') || '0분';
    }
  }

  class RequiredHuntBasis extends HTMLElement {
    connectedCallback() {
      const tenThousands = meso => `${number.format(Math.round(meso / 10_000))}만 메소`;
      this.innerHTML = `<details class="ux-details">
        <summary>재획 환산 기준</summary>
        <p class="ux-hint">1재획은 ${settings.monster}레벨 몬스터를 1젠에 ${settings.mobs}마리씩 ${minutesPerHunt}분 사냥할 때의 기대 수익입니다. 메획 ${settings.meso}%와 아획 ${settings.drop}%를 적용합니다.</p>
        <p class="ux-hint">1재획 기대 수익은 약 ${tenThousands(income)}입니다. 사냥 메소 ${tenThousands(rewards.meso)}와 솔 에르다 조각 약 ${rewards.fragments.toFixed(2)}개의 판매액을 합산합니다. 조각 판매가는 개당 ${tenThousands(fragmentPrice)}입니다.</p>
        <p class="ux-hint">메소를 1재획 기대 수익으로 나눈 뒤 정수로 반올림합니다. 사냥 시간은 표시된 재획 수에 ${minutesPerHunt}분을 곱한 값입니다.</p>
        <a href="hunting_calc.html">아이템 획득량 계산기</a>
      </details>`;
    }
  }

  customElements.define('required-hunt', RequiredHunt);
  customElements.define('required-hunt-basis', RequiredHuntBasis);
})();
