(function (root) {
  'use strict';

  const difficulties = new Map([
    ['easy', ['Easy', '이지']], ['normal', ['Normal', '노멀']],
    ['hard', ['Hard', '하드']], ['chaos', ['Chaos', '카오스']],
    ['extreme', ['Extreme', '익스트림']]
  ]);

  class BossSchedule {
    #bosses;

    constructor(data) {
      const rows = Array.isArray(data?.boss_contents) ? data.boss_contents : [];
      this.#bosses = rows.filter(Boolean).map(row => {
        const name = String(row.content_name || '').trim();
        const [difficulty, difficultyLabel] = difficulties.get(String(row.difficulty || '').toLowerCase()) || ['', ''];
        return Object.freeze({
          name,
          difficulty,
          difficultyLabel,
          cycle: String(row.cycle || '').toLowerCase(),
          registered: BossSchedule.isTrue(row.registration_flag),
          completed: BossSchedule.isTrue(row.clear_flag ?? row.complete_flag)
        });
      });
    }

    static isTrue(value) {
      return value === true || String(value).toLowerCase() === 'true';
    }

    get registeredRecurringBosses() {
      return this.#bosses.filter(boss => boss.registered && (boss.cycle === 'bossweekly' || boss.cycle === 'bossmonthly'));
    }

    get clearedBosses() {
      return this.#bosses.filter(boss => boss.completed && boss.difficulty);
    }
  }

  if (typeof module === 'object' && module.exports) module.exports = BossSchedule;
  else root.BossSchedule = BossSchedule;
})(globalThis);
