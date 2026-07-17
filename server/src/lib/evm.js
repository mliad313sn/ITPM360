import { query } from '../db.js';

// Earned Value Management metrics for a project.
//   BAC  Budget at Completion      = project.budget
//   EV   Earned Value              = BAC × weighted % complete
//   PV   Planned Value             = BAC × schedule-elapsed ratio
//   AC   Actual Cost               = project.actual_cost
//   SV   Schedule Variance         = EV − PV      SPI = EV / PV
//   CV   Cost Variance             = EV − AC      CPI = EV / AC
//   EAC  Estimate at Completion    = BAC / CPI
//   VAC  Variance at Completion    = BAC − EAC
// Any metric whose inputs are missing is returned as null so the UI can
// render "n/a" rather than a misleading zero.

function ratioClamp(n, d) {
  if (!d || d <= 0) return null;
  return Math.max(0, Math.min(1, n / d));
}

export function computeEvm({ budget, actual_cost, start_date, end_date, tasks, now = new Date() }) {
  const bac = budget != null ? Number(budget) : null;
  const ac = actual_cost != null ? Number(actual_cost) : null;

  // Weighted percent complete: weight each task by its estimate (fallback 1).
  let weightSum = 0;
  let earnedSum = 0;
  for (const t of tasks) {
    const w = t.estimate_hours != null ? Number(t.estimate_hours) : 1;
    weightSum += w;
    earnedSum += w * (Number(t.percent_complete) / 100);
  }
  const percentComplete = weightSum > 0 ? earnedSum / weightSum : 0;

  // Schedule-elapsed ratio drives Planned Value.
  let plannedRatio = percentComplete; // no dates → assume on plan (SV=0)
  if (start_date && end_date) {
    const s = new Date(start_date).getTime();
    const e = new Date(end_date).getTime();
    plannedRatio = ratioClamp(now.getTime() - s, e - s) ?? (now.getTime() >= e ? 1 : 0);
  }

  const ev = bac != null ? bac * percentComplete : null;
  const pv = bac != null ? bac * plannedRatio : null;
  const sv = ev != null && pv != null ? ev - pv : null;
  const spi = ev != null && pv ? ev / pv : null;
  const cv = ev != null && ac != null ? ev - ac : null;
  const cpi = ev != null && ac ? ev / ac : null;
  const eac = bac != null && cpi ? bac / cpi : null;
  const vac = bac != null && eac != null ? bac - eac : null;

  const round = (v, dp = 2) => (v == null ? null : Number(v.toFixed(dp)));

  return {
    bac: round(bac), ac: round(ac),
    ev: round(ev), pv: round(pv),
    percent_complete: round(percentComplete * 100, 1),
    planned_percent: round(plannedRatio * 100, 1),
    sv: round(sv), spi: round(spi, 3),
    cv: round(cv), cpi: round(cpi, 3),
    eac: round(eac), vac: round(vac),
  };
}

// Derive RAG health for a performance index (SPI or CPI). >=0.95 green,
// >=0.85 amber, below red. Null index → unknown.
export function indexHealth(index) {
  if (index == null) return 'unknown';
  if (index >= 0.95) return 'green';
  if (index >= 0.85) return 'amber';
  return 'red';
}

// Scope/quality health proxied by open high-severity risk exposure.
export function riskHealth(highRiskCount) {
  if (highRiskCount >= 3) return 'red';
  if (highRiskCount >= 1) return 'amber';
  return 'green';
}

// Capture today's EVM point for every project (idempotent per day) — the
// S-curve's data source. Called daily by the scanner.
export async function captureEvmSnapshots() {
  const { rows: projects } = await query(
    'SELECT id, budget, actual_cost, start_date, end_date FROM projects'
  );
  let captured = 0;
  for (const p of projects) {
    const { rows: tasks } = await query(
      'SELECT percent_complete, estimate_hours FROM tasks WHERE project_id = $1',
      [p.id]
    );
    const e = computeEvm({ ...p, tasks });
    await query(
      `INSERT INTO evm_snapshots (project_id, captured_on, pv, ev, ac, spi, cpi, percent_complete)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id, captured_on)
       DO UPDATE SET pv = EXCLUDED.pv, ev = EXCLUDED.ev, ac = EXCLUDED.ac,
                     spi = EXCLUDED.spi, cpi = EXCLUDED.cpi, percent_complete = EXCLUDED.percent_complete`,
      [p.id, e.pv, e.ev, e.ac, e.spi, e.cpi, e.percent_complete]
    );
    captured++;
  }
  return captured;
}

export async function projectEvm(projectId, project) {
  const p =
    project ??
    (await query('SELECT budget, actual_cost, start_date, end_date FROM projects WHERE id = $1', [projectId])).rows[0];
  const [{ rows: tasks }, { rows: riskRows }] = await Promise.all([
    query('SELECT percent_complete, estimate_hours FROM tasks WHERE project_id = $1', [projectId]),
    query(
      `SELECT count(*)::int AS high FROM risks
       WHERE project_id = $1 AND status IN ('open','mitigating') AND severity >= 12`,
      [projectId]
    ),
  ]);
  const evm = computeEvm({ ...p, tasks });
  return {
    ...evm,
    schedule_health: indexHealth(evm.spi),
    cost_health: indexHealth(evm.cpi),
    scope_health: riskHealth(riskRows[0].high),
    high_risk_count: riskRows[0].high,
  };
}
