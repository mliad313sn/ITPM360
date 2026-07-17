import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEvm, indexHealth, riskHealth } from '../src/lib/evm.js';

test('computeEvm: on-budget, on-schedule project', () => {
  // BAC 1000, 50% complete, halfway through schedule, AC 500 → all indices = 1
  const evm = computeEvm({
    budget: 1000,
    actual_cost: 500,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    now: new Date('2026-07-02'), // ~0.5 elapsed
    tasks: [{ percent_complete: 50, estimate_hours: null }],
  });
  assert.equal(evm.bac, 1000);
  assert.equal(evm.ev, 500);
  assert.ok(Math.abs(evm.spi - 1) < 0.02, `spi ~1, got ${evm.spi}`);
  assert.ok(Math.abs(evm.cpi - 1) < 0.001, `cpi 1, got ${evm.cpi}`);
});

test('computeEvm: over budget and behind schedule', () => {
  // 25% done but 75% of schedule elapsed, spent 500 of 1000
  const evm = computeEvm({
    budget: 1000,
    actual_cost: 500,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    now: new Date('2026-10-01'), // ~0.75 elapsed
    tasks: [{ percent_complete: 25, estimate_hours: null }],
  });
  assert.equal(evm.ev, 250);
  assert.ok(evm.spi < 0.5, `behind schedule, spi ${evm.spi}`);
  assert.equal(evm.cpi, 0.5); // EV 250 / AC 500
  assert.equal(evm.eac, 2000); // BAC / CPI
  assert.equal(evm.vac, -1000); // BAC - EAC
  assert.ok(evm.sv < 0 && evm.cv < 0);
});

test('computeEvm: estimate-weighted earned value', () => {
  // Two tasks: a 100%-done 90h task and a 0% 10h task → 90% weighted complete
  const evm = computeEvm({
    budget: 1000,
    actual_cost: null,
    start_date: null,
    end_date: null,
    tasks: [
      { percent_complete: 100, estimate_hours: 90 },
      { percent_complete: 0, estimate_hours: 10 },
    ],
  });
  assert.equal(evm.percent_complete, 90);
  assert.equal(evm.ev, 900);
  assert.equal(evm.cpi, null); // no AC → cost metrics unknown
  // no schedule dates → PV defaults to EV, so schedule reads as on-plan (SPI 1)
  assert.equal(evm.spi, 1);
  assert.equal(evm.sv, 0);
});

test('computeEvm: missing budget yields null cost metrics, not zeros', () => {
  const evm = computeEvm({ budget: null, actual_cost: null, tasks: [{ percent_complete: 50, estimate_hours: null }] });
  assert.equal(evm.bac, null);
  assert.equal(evm.ev, null);
  assert.equal(evm.spi, null);
  assert.equal(evm.eac, null);
});

test('indexHealth and riskHealth banding', () => {
  assert.equal(indexHealth(1.1), 'green');
  assert.equal(indexHealth(0.9), 'amber');
  assert.equal(indexHealth(0.7), 'red');
  assert.equal(indexHealth(null), 'unknown');
  assert.equal(riskHealth(0), 'green');
  assert.equal(riskHealth(2), 'amber');
  assert.equal(riskHealth(3), 'red');
});
