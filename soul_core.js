'use strict';

const SoulCore = (() => {
  const Step = typeof module === 'undefined' ? UpgradeStep : require('./upgrade_step.js');
  const source = typeof module === 'undefined' ? SOUL_OPTION_DATA : require('./soul_option_data.js');
  const ranks = ['미부여', '레어', '에픽', '유니크', '레전드리'];
  const amplification = [
    { chance: .05, increase: .01, cap: 26, cost: 500_000_000 },
    { chance: .03, increase: .006, cap: 34, cost: 1_000_000_000 },
    { chance: .02, increase: .004, cap: 44, cost: 1_750_000_000 },
    { chance: .015, increase: .003, cap: 51, cost: 2_750_000_000 }
  ];
  const gradeUp = [
    { chance: .015, miracleChance: .03, cap: 100, cost: 20_000_000 },
    { chance: .005875, miracleChance: .011751, cap: 256, cost: 40_000_000 },
    { chance: .003322, miracleChance: .006645, cap: 451, cost: 65_000_000 }
  ];
  const resetCost = [...gradeUp.map(step => step.cost), 88_000_000];
  const miracleGradeUp = gradeUp.map(step => ({ ...step, chance: step.miracleChance }));

  function gradeSteps(miracle) {
    return miracle ? miracleGradeUp : gradeUp;
  }

  function nextChance(step, failures) {
    return new Step(step).nextChance(failures);
  }

  function withinProgress(outcomes, weights, budget) {
    const minimum = weights.reduce((sum, weight) => sum + weight, 0);
    const maximum = outcomes.reduce((sum, masses, index) => sum + masses.length * weights[index], 0);
    if (budget < minimum) return 0;
    if (budget >= maximum) return 1;
    if (budget > 100_000) return withinIrregularCosts(outcomes, weights, budget);
    let distribution = [1];
    for (const [index, masses] of outcomes.entries()) {
      const weight = weights[index];
      const limit = Math.min(budget, distribution.length - 1 + masses.length * weight);
      const combined = new Float64Array(limit + 1);
      for (const [attempt, success] of masses.entries()) {
        const offset = (attempt + 1) * weight;
        const countLimit = Math.min(distribution.length, combined.length - offset);
        for (let count = 0; count < countLimit; count++) {
          combined[count + offset] += distribution[count] * success;
        }
      }
      distribution = combined;
    }
    return Math.min(1, distribution.reduce((sum, chance) => sum + chance, 0));
  }

  // Custom prices need not share a useful base unit. Enumerate each half of the path and join at the budget.
  function withinIrregularCosts(outcomes, weights, budget) {
    function combinations(start, end) {
      let sums = [{ cost: 0, chance: 1 }];
      for (let index = start; index < end; index++) {
        sums = sums.flatMap(sum => outcomes[index].map((chance, attempt) => ({
          cost: sum.cost + (attempt + 1) * weights[index], chance: sum.chance * chance
        })).filter(sum => sum.cost <= budget));
      }
      return sums.sort((a, b) => a.cost - b.cost);
    }
    const pivot = Math.ceil(outcomes.length / 2);
    const first = combinations(0, pivot);
    const second = combinations(pivot, outcomes.length);
    const totals = [0];
    for (const entry of second) totals.push(totals.at(-1) + entry.chance);
    let split = second.length;
    let chance = 0;
    for (const entry of first) {
      while (split && entry.cost + second[split - 1].cost > budget) split--;
      chance += entry.chance * totals[split];
    }
    return Math.min(1, chance);
  }

  function greatestCommonDivisor(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
  }

  function budgetPricing(steps, phases, round = Math.ceil) {
    const finite = [...steps, ...phases.filter(phase => phase.upgrade)];
    const unit = finite.reduce((value, phase) => greatestCommonDivisor(value, phase.cost), 0) || 1;
    const max = finite.reduce((total, phase) => total + phase.cost * (phase.upgrade?.cap ?? phase.cap), 0);
    if (max / unit <= 100_000) return { steps, phases };
    // Keep cost arrays small for arbitrary market prices. The average still uses the exact entered price.
    const increment = 5_000_000 * Math.ceil(max / 500_000_000_000);
    const roundCost = step => ({ ...step, budgetCost: round(step.cost / increment) * increment });
    return { steps: steps.map(roundCost), phases: phases.map(phase => phase.upgrade ? roundCost(phase) : phase), increment };
  }

  function progressStats(steps, failures, budget, mesoBudget) {
    const outcomes = [];
    const details = steps.map((step, index) => {
      const start = index === 0 ? failures : 0;
      const remaining = new Step(step).remaining(start);
      const { upgraded, expected } = remaining.outcomes();
      outcomes.push(Array.from(upgraded.subarray(1)));
      return { expected, max: remaining.cap, cost: expected * step.cost, maxCost: remaining.cap * step.cost,
        next: remaining.nextChance(), price: step.cost };
    });
    const add = key => details.reduce((sum, step) => sum + step[key], 0);
    let withinMeso;
    if (mesoBudget !== undefined) {
      // Normalize fixed prices so the distribution only needs one cell per attainable cost unit.
      const prices = steps.map(step => step.cost);
      const unit = prices.reduce(greatestCommonDivisor, 0) || 1;
      withinMeso = withinProgress(outcomes, prices.map(price => price / unit), Math.floor(mesoBudget / unit));
    }
    return { details, expected: add('expected'), max: add('max'), cost: add('cost'),
      maxCost: add('maxCost'), within: withinProgress(outcomes, steps.map(() => 1), budget), withinMeso };
  }

  function readOption(name) {
    const match = name.match(/^(.+) \+(\d+(?:\.\d+)?)(%?)$/);
    if (!match) return { name, key: name, value: 1, unit: '' };
    const [, stat, value, unit] = match;
    return { name, key: unit ? `${stat} %` : stat, value: Number(value), unit };
  }

  const tables = source.map(rank => Array.from({ length: 4 }, (_, stage) => {
    return rank.map(line => {
      const combined = new Map();
      let total = 0;
      for (const row of line) {
        const [weight] = row;
        const name = row[stage + 1];
        total += weight;
        combined.set(name, (combined.get(name) ?? 0) + weight);
      }
      return [...combined].map(([name, weight]) => ({ ...readOption(name), p: weight / total }));
    });
  }));

  function optionTables(rank, stage) {
    const [first, side] = tables[rank - 1][stage - 1];
    return [first, side, side];
  }

  function goalValues(lines, key, minLines) {
    const values = lines.map(line => [...new Set(line.map(option => option.key === key ? option.value : 0))]);
    const totals = new Set();
    for (const first of values[0]) {
      for (const second of values[1]) {
        for (const third of values[2]) {
          if ([first, second, third].filter(Boolean).length >= minLines) totals.add(first + second + third);
        }
      }
    }
    return [...totals].sort((a, b) => a - b);
  }

  function matchesGoal(options, goal) {
    const matches = options.filter(option => option.key === goal.key);
    return matches.length >= goal.lines && matches.reduce((sum, option) => sum + option.value, 0) >= goal.total;
  }

  function asGoalGroups(goals) {
    return Array.isArray(goals) ? goals : [[goals]];
  }

  function matchesGoalGroups(options, groups) {
    return groups.some(group => group.length && group.every(goal => matchesGoal(options, goal)));
  }

  // A failed combination is the only one excluded on the next roll.
  // For a failing outcome i of probability p_i, its expected remaining rolls are
  // 1 - p_i + S, where S is the probability-weighted expectation over failed outcomes.
  function optionStats(lines, goals, budget) {
    const groups = asGoalGroups(goals);
    let chance = 0;
    let failedSquareMass = 0;
    let largestFailed = 0;
    for (const first of lines[0]) {
      for (const second of lines[1]) {
        for (const third of lines[2]) {
          const p = first.p * second.p * third.p;
          const options = [first, second, third];
          if (matchesGoalGroups(options, groups)) {
            chance += p;
          } else {
            failedSquareMass += p * p;
            largestFailed = Math.max(largestFailed, p);
          }
        }
      }
    }
    chance = Math.min(1, chance);
    const upperChance = Math.min(1, chance / (1 - largestFailed));
    // The first attempt has no known previous options. On every later attempt,
    // excluding the failed combination can only increase the success chance.
    const attemptsFor = target => {
      if (target <= chance) return 1;
      return chance > 0 ? Math.ceil(Math.log1p(-target) / Math.log1p(-chance)) : Infinity;
    };
    return { chance, upperChance, expected: chance ? (1 - failedSquareMass) / chance : Infinity,
      attempts50: attemptsFor(.5), attempts90: attemptsFor(.9),
      within: -Math.expm1(budget * Math.log1p(-chance)),
      withinUpper: budget === 1 ? chance :
        -Math.expm1(Math.log1p(-chance) + (budget - 1) * Math.log1p(-upperChance)) };
  }

  function rollOptions(lines, previous, random) {
    let result;
    do {
      result = lines.map(line => {
        let remainder = random();
        for (const option of line) {
          remainder -= option.p;
          if (remainder < 0) return option;
        }
        return line.at(-1);
      });
    } while (previous?.every((option, index) => option.name === result[index].name));
    return result;
  }

  function startSimulation(config) {
    return { stage: config.startStage, rank: config.startRank,
      ampFailures: config.ampFailures, rankFailures: config.rankFailures, options: null,
      attempts: 0, meso: 0, ether: [0, 0, 0, 0], gradeAttempts: [0, 0, 0], optionAttempts: 0 };
  }

  function simulationCostPlan(config) {
    const { startStage, targetStage, startRank, targetRank, ampFailures, rankFailures, goal, lastEligibleRank } = config;
    const remaining = (step, failures) => failures ? {
      ...step, ...new Step(step).remaining(failures)
    } : step;
    const amp = amplification.slice(startStage, targetStage)
      .map((step, index) => remaining(step, index === 0 ? ampFailures : 0));
    const firstRank = Math.max(1, startRank);
    const grades = gradeSteps(config.miracle);
    const upgrades = grades.slice(firstRank - 1, Math.max(firstRank, targetRank) - 1)
      .map((step, index) => remaining(step, index === 0 ? rankFailures : 0));
    const steps = [...amp, ...upgrades];
    if (!goal) return { steps, phases: [], upperPhases: [] };

    const phases = [];
    const upperPhases = [];
    for (let rank = targetRank; rank <= lastEligibleRank; rank++) {
      const { chance, upperChance } = optionStats(optionTables(rank, targetStage), goal, 1);
      const rolledOnArrival = rank > targetRank || upgrades.length > 0 || (startRank === 0 && rank === 1);
      const step = grades[rank - 1];
      const upgrade = step && remaining(step, rank === firstRank && !upgrades.length ? rankFailures : 0);
      const phase = { chance, arrivalChance: rolledOnArrival ? chance : 0, upgrade, cost: resetCost[rank - 1] };
      phases.push(phase);
      upperPhases.push({ ...phase, chance: upperChance });
    }
    // Upgrading beyond an eligible rank ends the run without reaching the goal.
    if (lastEligibleRank < ranks.length - 1) {
      const unavailable = { chance: 0, cost: 0 };
      phases.push(unavailable);
      upperPhases.push(unavailable);
    }
    return { steps, phases, upperPhases };
  }

  function simulationPhase(state, config) {
    if (state.stage < config.targetStage) return 'amp';
    if (state.rank < config.targetRank) return 'rank';
    if (config.goal && state.rank > config.lastEligibleRank) return 'unavailable';
    if (config.goal && (!state.options || !matchesGoalGroups(state.options, asGoalGroups(config.goal)))) return 'option';
    return 'done';
  }

  function simulateAttempt(state, config, random = Math.random) {
    const phase = simulationPhase(state, config);
    if (phase === 'done' || phase === 'unavailable') return;
    state.attempts++;
    if (phase === 'amp') {
      const step = amplification[state.stage];
      const chance = nextChance(step, state.ampFailures);
      state.meso += step.cost;
      state.ether[state.stage]++;
      if (random() < chance) {
        state.stage++;
        state.ampFailures = 0;
        if (state.rank === 0) {
          state.rank = 1;
          state.options = rollOptions(optionTables(1, 1), null, random);
        } else if (state.options) {
          // Options rolled during this run can only have come from the initial unlock.
          const nextLines = optionTables(state.rank, state.stage);
          state.options = state.options.map((option, index) => nextLines[index][optionTables(state.rank, state.stage - 1)[index].indexOf(option)]);
        }
      } else {
        state.ampFailures++;
      }
    } else {
      state.meso += resetCost[state.rank - 1];
      if (phase === 'rank') state.gradeAttempts[state.rank - 1]++;
      else state.optionAttempts++;
      let previous = state.options;
      const step = gradeSteps(config.miracle)[state.rank - 1];
      const chance = step ? nextChance(step, state.rankFailures) : 0;
      if (step && random() < chance) {
        state.rank++;
        state.rankFailures = 0;
        previous = null;
      } else if (step) {
        state.rankFailures++;
      }
      state.options = rollOptions(optionTables(state.rank, state.stage), previous, random);
    }
  }

  return { ranks, amplification, gradeUp, gradeSteps, resetCost, nextChance, progressStats, budgetPricing, optionTables,
    goalValues, optionStats, startSimulation, simulationCostPlan, simulationPhase, simulateAttempt };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SoulCore;
