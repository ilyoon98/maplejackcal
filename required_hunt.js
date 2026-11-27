(() => {
  'use strict';

  const minutesPerHunt = HuntingIncome.sessionMinutes;
  const number = new Intl.NumberFormat('ko-KR');
  let settings = HuntingIncome.loadSettings();
  let income = new HuntingIncome(settings);

  class RequiredHunt extends HTMLElement {
    static observedAttributes = ['meso'];

    connectedCallback() {
      if (!this.count) {
        this.innerHTML = '<a class="required-hunt-label" href="hunting_calc.html#hunting-settings" title="사냥 설정"><img src="icons/craft/소형재물획득의비약.webp" width="20" height="20" alt="">필요 재획</a>' +
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
      const amount = this.getAttribute('meso')?.trim();
      const meso = /^\d+$/.test(amount) ? BigInt(amount) : amount ? Number(amount) : NaN;
      this.hidden = (typeof meso !== 'bigint' && !Number.isFinite(meso)) || meso < 0;
      if (this.hidden) return;

      const sessions = income.sessionsFor(meso);
      if (sessions === null) {
        this.count.textContent = '—';
        this.time.textContent = '사냥 수입 0메소';
        return;
      }
      const minutes = sessions * BigInt(minutesPerHunt);
      const units = [[minutes / 1440n, '일'], [minutes / 60n % 24n, '시간'], [minutes % 60n, '분']];
      this.count.textContent = `${number.format(sessions)}재획`;
      this.time.textContent = units.filter(([value]) => value > 0)
        .map(([value, unit]) => `${number.format(value)}${unit}`).join(' ') || '0분';
    }
  }

  class RequiredHuntBasis extends HTMLElement {
    connectedCallback() {
      if (!this.firstElementChild) {
        this.innerHTML = '<details class="ux-details"><summary>재획 환산 기준</summary>' +
          '<p class="ux-hint"></p><p class="ux-hint"></p><p class="ux-hint"></p>' +
          '<a href="hunting_calc.html#hunting-settings">사냥 설정</a></details>';
      }
      this.render();
    }

    render() {
      const tenThousands = meso => `${number.format(Math.round(meso / 10_000))}만 메소`;
      const { rewards, fragmentPrice } = income;
      const [conditions, estimate, method] = this.querySelectorAll('p');
      conditions.textContent = `1재획은 ${minutesPerHunt}분입니다. 현재 설정은 ${settings.monster}레벨 몬스터 ${number.format(rewards.kills)}마리 처치, 아획 +${number.format(rewards.effectiveDrop)}%, 최종 메획 +${number.format((rewards.mesoMultiplier - 1) * 100)}%입니다.`;
      estimate.textContent = `1재획 기대 수입은 약 ${tenThousands(income.sessionMeso)}입니다. 사냥 메소 ${tenThousands(rewards.meso)}` +
        (fragmentPrice ? `에 솔 에르다 조각 약 ${rewards.fragments.toFixed(2)}개의 판매액을 더합니다. 조각 판매가는 개당 ${number.format(fragmentPrice)}메소입니다.` : '를 반영합니다.');
      method.textContent = `지출을 1재획 기대 수입으로 나눈 뒤 올림합니다. 사냥 시간은 재획 수에 ${minutesPerHunt}분을 곱한 값입니다.`;
    }
  }

  customElements.define('required-hunt', RequiredHunt);
  customElements.define('required-hunt-basis', RequiredHuntBasis);

  function refresh() {
    settings = HuntingIncome.loadSettings();
    income = new HuntingIncome(settings);
    document.querySelectorAll('required-hunt, required-hunt-basis').forEach(element => element.render());
  }
  window.addEventListener('storage', event => {
    if (event.key === HuntingIncome.storageKey || event.key === null) refresh();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
})();
