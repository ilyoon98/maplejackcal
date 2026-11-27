(function (root) {
  'use strict';

  const rewardMinutes = 30;
  const storageKey = 'hunting.settings.v1';
  const buffs = Object.freeze({
    wealthElixir: Object.freeze({ drop: 20, finalMeso: 20 }),
    unionWealth: Object.freeze({ meso: 50 }),
    unionLuck: Object.freeze({ drop: 50 })
  });
  const defaults = Object.freeze({
    drop: 200, meso: 100, monster: 290, mobs: 40, sixMinuteKills: '', fragmentPrice: 6500000,
    buffs: Object.freeze({ wealthElixir: true, unionWealth: true, unionLuck: true })
  });

  function decimal(value) {
    const [coefficient, exponent = '0'] = String(value).split('e');
    const [whole, fraction = ''] = coefficient.split('.');
    return { units: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
  }

  class HuntingIncome {
    static defaults = defaults;
    static buffs = buffs;
    static sessionMinutes = rewardMinutes;
    static storageKey = storageKey;

    constructor(settings) {
      for (const [key, min, max] of [['drop', 0, 10000], ['meso', 0, 10000], ['monster', 1, 300]]) {
        if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) throw new RangeError(key);
      }
      if (!Number.isInteger(settings.monster)) throw new RangeError('monster');
      const fragmentPrice = settings.fragmentPrice ?? defaults.fragmentPrice;
      if (!Number.isSafeInteger(fragmentPrice) || fragmentPrice < 0) throw new RangeError('fragmentPrice');
      const measured = settings.sixMinuteKills != null && settings.sixMinuteKills !== '';
      const count = measured ? settings.sixMinuteKills : settings.mobs;
      if (!Number.isInteger(count) || count < 0 || count > (measured ? 480000 : 10000)) throw new RangeError('kills');
      const kills = measured ? count * (rewardMinutes / 6) : count * (rewardMinutes * 60 / 7.5);
      const applied = { drop: settings.drop, meso: settings.meso, finalMeso: 0 };
      for (const [name, effect] of Object.entries(buffs)) {
        if (settings.buffs?.[name] === true) {
          for (const [stat, value] of Object.entries(effect)) applied[stat] += value;
        }
      }

      const bag = Math.min(1, 0.6 * (1 + applied.drop / 100));
      const mesoMultiplier = (100 + applied.meso) * (100 + applied.finalMeso) / 10000;
      const pureLow = kills * bag * settings.monster * 6;
      const pure = kills * bag * settings.monster * 7.5;
      const pureHigh = kills * bag * settings.monster * 9;
      this.rewards = {
        kills, measured, bag, effectiveDrop: applied.drop, mesoMultiplier, pureLow, pure, pureHigh,
        low: pureLow * mesoMultiplier, meso: pure * mesoMultiplier, high: pureHigh * mesoMultiplier,
        fragments: settings.monster >= 260 ? kills * 0.000425 * (1 + Math.log1p(applied.drop / 100)) : 0
      };
      this.fragmentPrice = fragmentPrice;
      this.fragmentMeso = this.rewards.fragments * fragmentPrice;
      this.sessionMeso = this.rewards.meso + this.fragmentMeso;
    }

    sessionsFor(cost) {
      if ((typeof cost !== 'bigint' && !Number.isFinite(cost)) || cost < 0) return null;
      if (cost === 0 || cost === 0n) return 0n;
      if (this.sessionMeso <= 0) return null;

      // Keep integer prices exact, including accessory prices beyond Number.MAX_SAFE_INTEGER.
      const target = decimal(cost);
      const income = decimal(this.sessionMeso);
      const difference = target.exponent - income.exponent;
      const numerator = target.units * 10n ** BigInt(Math.max(0, difference));
      const denominator = income.units * 10n ** BigInt(Math.max(0, -difference));
      return (numerator + denominator - 1n) / denominator;
    }

    static loadSettings() {
      try {
        const settings = JSON.parse(root.localStorage.getItem(storageKey));
        if (settings) {
          new HuntingIncome(settings);
          return settings;
        }
      } catch {
        // Invalid or unavailable browser storage falls back to the default hunting settings.
      }
      return defaults;
    }

    static saveSettings(settings) {
      try {
        const data = JSON.stringify(settings);
        if (root.localStorage.getItem(storageKey) !== data) root.localStorage.setItem(storageKey, data);
      } catch {
        // The hunting calculator can still update when storage is unavailable.
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = HuntingIncome;
  else root.HuntingIncome = HuntingIncome;
})(typeof globalThis !== 'undefined' ? globalThis : this);
