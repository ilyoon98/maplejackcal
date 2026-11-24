'use strict';

const PotentialPlan = (() => {
  const Step = typeof module === 'undefined' ? UpgradeStep : require('./upgrade_step.js');

  function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
  }

  function convolve(before, after, weight) {
    if (!weight) {
      const mass = after.reduce((sum, value) => sum + value, 0);
      return before.map(value => value * mass);
    }
    const result = new Float64Array(before.length + (after.length - 1) * weight);
    for (let attempt = 1; attempt < after.length; attempt++) {
      const p = after[attempt];
      if (!p) continue;
      const offset = attempt * weight;
      for (let cost = 0; cost < before.length; cost++) result[cost + offset] += before[cost] * p;
    }
    return result;
  }

  const progressCache = new Map();
  const budgetCost = step => step.budgetCost ?? step.cost;
  function progression(steps, unit) {
    const key = JSON.stringify([steps, unit]);
    if (progressCache.has(key)) return progressCache.get(key);
    let distribution = Float64Array.of(1);
    const details = steps.map(step => {
      const result = new Step(step).outcomes();
      distribution = convolve(distribution, result.upgraded, budgetCost(step) / unit);
      return { attempts: result.expected, cost: result.expected * step.cost };
    });
    const result = { distribution, details };
    if (progressCache.size === 4) progressCache.delete(progressCache.keys().next().value);
    progressCache.set(key, result);
    return result;
  }

  function calculate(steps, optionPhases = [], { budgets = true } = {}) {
    // The last phase is unbounded. Evaluate its geometric CDF directly instead of allocating a per-roll array.
    const progressUnit = steps.reduce((value, step) => gcd(value, budgetCost(step)), 0);
    const optionUnit = optionPhases.filter(phase => phase.upgrade).reduce((value, phase) => gcd(value, budgetCost(phase)), 0);
    const sharedUnit = gcd(progressUnit, optionUnit) || 1;
    // An item-level cube fee and a meso reset can have a tiny common divisor. Keep separate grids for those prices.
    const separate = progressUnit / sharedUnit > 64 || optionUnit / sharedUnit > 64;
    const fixed = progression(steps, separate ? progressUnit : sharedUnit);
    const unit = separate ? optionUnit || 1 : sharedUnit;
    const completed = [];
    let remaining = separate ? Float64Array.of(1) : fixed.distribution;
    let reach = 1;
    let optionCost = 0;
    let optionAttempts = 0;
    let terminal;
    for (const phase of optionPhases) {
      const arrival = phase.arrivalChance ?? 0;
      if (arrival) {
        completed.push(remaining.map(value => value * arrival));
        remaining = remaining.map(value => value * (1 - arrival));
        reach *= 1 - arrival;
      }
      if (!phase.upgrade) {
        terminal = phase;
        if (reach > 0) {
          const attempts = reach * (phase.paidExpected ?? 1 / phase.chance);
          optionAttempts += attempts;
          optionCost += phase.cost ? attempts * phase.cost : 0;
        }
        break;
      }
      const result = new Step(phase.upgrade).outcomes(phase.chance);
      const attempts = reach * result.expected;
      optionAttempts += attempts;
      optionCost += attempts * phase.cost;
      if (phase.chance) completed.push(convolve(remaining, result.completed, budgetCost(phase) / unit));
      remaining = convolve(remaining, result.upgraded, budgetCost(phase) / unit);
      reach *= result.pass;
    }
    if (!terminal) completed.push(remaining);
    if (terminal && !terminal.chance && reach > 0) optionAttempts = optionCost = Infinity;
    const expected = fixed.details.reduce((sum, step) => sum + step.cost, optionCost);

    const totalCompleted = new Float64Array(Math.max(0, ...completed.map(row => row.length)));
    for (const row of completed) {
      for (let i = 0; i < row.length; i++) totalCompleted[i] += row[i];
    }
    for (let i = 1; i < totalCompleted.length; i++) totalCompleted[i] += totalCompleted[i - 1];
    const price = terminal?.cost ?? 0;
    const logFailure = terminal ? Math.log1p(-terminal.chance) : 0;
    function withinPhase(budget) {
      if (budget < 0) return 0;
      let p = totalCompleted[Math.min(Math.floor(budget / unit), totalCompleted.length - 1)] ?? 0;
      if (!terminal?.chance || !reach) return Math.min(1, p);
      const last = Math.min(remaining.length - 1, Math.floor((budget - price) / unit));
      for (let i = 0; i <= last; i++) {
        if (!remaining[i]) continue;
        const rolls = price ? Math.floor((budget - i * unit) / price) : Infinity;
        p += remaining[i] * -Math.expm1(rolls * logFailure);
      }
      return Math.min(1, p);
    }
    const increment = gcd(sharedUnit, price) || 1;
    const initialBudget = (Math.max(totalCompleted.length, remaining.length) - 1) * unit
      + (separate ? (fixed.distribution.length - 1) * progressUnit : 0);
    function within(budget) {
      if (!separate) return withinPhase(budget);
      let p = 0;
      const limit = Math.min(fixed.distribution.length - 1, Math.floor(budget / progressUnit));
      for (let i = 0; i <= limit; i++) {
        if (fixed.distribution[i]) p += fixed.distribution[i] * withinPhase(budget - i * progressUnit);
      }
      return p;
    }
    function budgetFor(q) {
      let high = Math.max(1, Math.ceil(initialBudget / increment));
      if (terminal && !terminal.chance && within(high * increment) + 1e-12 < q) return Infinity;
      while (within(high * increment) + 1e-12 < q) {
        high *= 2;
        if (!Number.isFinite(high * increment)) return Infinity;
      }
      let low = 0;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (middle === high) break;
        if (within(middle * increment) + 1e-12 >= q) high = middle;
        else {
          const next = middle + 1;
          if (next === middle && middle === low) break;
          low = next;
        }
      }
      return high * increment;
    }
    return {
      expected,
      budget50: budgets ? budgetFor(.5) : undefined,
      budget90: budgets ? budgetFor(.9) : undefined,
      budgetFor,
      details: fixed.details,
      optionAttempts,
      optionCost,
      withinCost: value => within(Math.max(0, Math.floor(value)))
    };
  }

  function withinAttempts(steps, phases, attempts) {
    const asAttempts = ({ budgetCost, ...step }) => ({ ...step, cost: 1 });
    return calculate(steps.map(asAttempts), phases.map(asAttempts), { budgets: false }).withinCost(attempts);
  }

  return { calculate, withinAttempts };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PotentialPlan;
