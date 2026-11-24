'use strict';

// A paid attempt with a base chance, optional growth after each failure, and an optional guarantee.
class UpgradeStep {
  constructor({ chance, increase = 0, cap = null }) {
    this.chance = chance;
    this.increase = increase;
    this.cap = cap;
  }

  guaranteed(failures) {
    return this.cap !== null && failures >= this.cap - 1;
  }

  nextChance(failures = 0) {
    return this.guaranteed(failures) ? 1 : this.chance + this.increase * failures;
  }

  remaining(failures) {
    return new UpgradeStep({
      chance: this.nextChance(failures),
      increase: this.increase,
      cap: this.cap === null ? null : Math.max(1, this.cap - failures)
    });
  }

  expectedAttempts() {
    if (this.increase) return this.outcomes().expected;
    if (this.chance === 0) return this.cap ?? Infinity;
    return this.cap === null ? 1 / this.chance : -Math.expm1(this.cap * Math.log1p(-this.chance)) / this.chance;
  }

  withinAttempts(attempts) {
    const count = Math.floor(attempts);
    if (count <= 0) return 0;
    if (this.guaranteed(count - 1)) return 1;
    if (!this.increase) return -Math.expm1(count * Math.log1p(-this.chance));
    let waiting = 1;
    for (let failures = 0; failures < count; failures++) waiting *= 1 - this.nextChance(failures);
    return 1 - waiting;
  }

  attemptsFor(probability) {
    if (probability <= this.nextChance()) return 1;
    if (!this.increase) {
      const natural = Math.ceil(Math.log1p(-probability) / Math.log1p(-this.chance));
      return Math.min(this.cap ?? Infinity, this.chance ? natural : Infinity);
    }
    let waiting = 1;
    for (let attempt = 1; attempt <= this.cap; attempt++) {
      waiting *= 1 - this.nextChance(attempt - 1);
      if (waiting <= 1 - probability) return attempt;
    }
    return Infinity;
  }

  sampleAttempts(random = Math.random) {
    if (this.nextChance() === 1) return 1;
    if (this.increase) return this.attemptsFor(1 - random());
    const natural = this.chance ? Math.floor(Math.log1p(-random()) / Math.log1p(-this.chance)) + 1 : Infinity;
    return Math.min(this.cap ?? Infinity, natural);
  }

  // Success may also end the phase by meeting an option goal on a non-upgrading roll.
  outcomes(optionChance = 0) {
    const exit = this.chance + (1 - this.chance) * optionChance;
    const count = this.cap ?? (exit === 1 ? 1 : exit ? Math.ceil(Math.log(1e-13) / Math.log1p(-exit)) : 0);
    const upgraded = new Float64Array(count + 1);
    const completed = new Float64Array(count + 1);
    let waiting = 1;
    let expected = 0;
    let pass = 0;
    for (let attempt = 1; attempt <= count; attempt++) {
      const upgrade = this.nextChance(attempt - 1);
      upgraded[attempt] = waiting * upgrade;
      completed[attempt] = waiting * (1 - upgrade) * optionChance;
      expected += waiting;
      pass += upgraded[attempt];
      waiting *= (1 - upgrade) * (1 - optionChance);
    }
    return {
      upgraded, completed,
      expected: this.cap === null ? 1 / exit : expected,
      pass: this.cap === null ? (exit ? this.chance / exit : 0) : pass
    };
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = UpgradeStep;
