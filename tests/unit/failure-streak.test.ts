/**
 * Consecutive genuine external failures — the `failureThreshold` counter.
 *
 * The streak is what decides whether a real failure becomes an incident. These
 * tests pin the exact semantics the product promises:
 *
 *   threshold 1 -> the first qualifying failure counts;
 *   threshold 3 -> the third CONSECUTIVE failure counts, not the first;
 *   a healthy observation resets the sequence;
 *   demo / synthetic / simulation / monitor-probe rows never count;
 *   re-reading the same observations can never inflate the count.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  countConsecutiveExternalFailures,
  isGenuineExternalObservation,
  type ExternalObservationRow,
} from "../../lib/monitoring/failure-streak";

function row(
  status: string,
  source = "external",
  isDemo: boolean | null = false,
): ExternalObservationRow {
  return { status, source, is_demo: isDemo };
}

/** Newest-first, exactly as the persisted query returns them. */
const fail = (n: number): ExternalObservationRow[] =>
  Array.from({ length: n }, () => row("critical"));
const ok = (): ExternalObservationRow => row("healthy");

/**
 * Build history the way the database hands it back: oldest-first in, newest
 * first out. Getting this backwards silently inverts every streak assertion,
 * so the helper exists rather than hand-written `[...a, b]` arrays.
 */
function historyNewestFirst(chronological: ExternalObservationRow[]): ExternalObservationRow[] {
  return [...chronological].reverse();
}

test("genuine observations are external, non-demo rows only", () => {
  assert.equal(isGenuineExternalObservation(row("critical")), true);
  assert.equal(isGenuineExternalObservation(row("critical", "probe")), false);
  assert.equal(isGenuineExternalObservation(row("critical", "synthetic")), false);
  assert.equal(isGenuineExternalObservation(row("critical", "simulation")), false);
  assert.equal(isGenuineExternalObservation(row("critical", "external", true)), false);
});

test("threshold 1 counts a single qualifying failure", () => {
  assert.equal(countConsecutiveExternalFailures(fail(1), 1), 1);
  assert.equal(countConsecutiveExternalFailures([], 1), 0);
});

test("threshold 3 does not count fewer than three consecutive failures", () => {
  assert.equal(countConsecutiveExternalFailures(fail(1), 3), 1);
  assert.equal(countConsecutiveExternalFailures(fail(2), 3), 2);
  assert.equal(countConsecutiveExternalFailures(fail(3), 3), 3);
  assert.equal(countConsecutiveExternalFailures(fail(9), 3), 3);
});

test("a healthy observation resets the consecutive sequence", () => {
  // chronologically: fail, fail, healthy, fail
  const history = historyNewestFirst([...fail(2), ok(), ...fail(1)]);
  assert.equal(countConsecutiveExternalFailures(history, 3), 1);
  // chronologically: fail, healthy, fail, fail
  const recoveredThenFailedTwice = historyNewestFirst([...fail(1), ok(), ...fail(2)]);
  assert.equal(countConsecutiveExternalFailures(recoveredThenFailedTwice, 3), 2);
});

test("an all-healthy history counts zero", () => {
  assert.equal(countConsecutiveExternalFailures([ok(), ok(), ok()], 3), 0);
});

test("a non-terminal genuine reading (unknown/maintenance) neither counts nor resets", () => {
  // chronologically: critical, unknown  -> the newest reading is inconclusive
  assert.equal(countConsecutiveExternalFailures(historyNewestFirst([...fail(1), row("unknown")]), 3), 0);
  // chronologically: critical, critical, maintenance, critical, unknown
  const history = historyNewestFirst([
    ...fail(2),
    row("maintenance"),
    ...fail(1),
    row("unknown"),
  ]);
  assert.equal(countConsecutiveExternalFailures(history, 3), 0);
});

test("a warning counts as a qualifying failure, like a critical", () => {
  assert.equal(countConsecutiveExternalFailures([row("warning"), row("warning")], 3), 2);
  assert.equal(countConsecutiveExternalFailures([row("warning")], 1), 1);
});

test("demo, synthetic and simulation rows never contribute", () => {
  const history: ExternalObservationRow[] = [
    row("critical", "simulation", true),
    row("critical", "synthetic", true),
    row("critical", "probe"),
    row("critical", "external", true),
  ];
  assert.equal(countConsecutiveExternalFailures(history, 1), 0);
});

test("a non-genuine healthy row does not clear a genuine failure streak", () => {
  // A demo "recovered" signal is not evidence about the configured endpoint.
  // chronologically: critical, critical, synthetic-healthy
  const history = historyNewestFirst([
    ...fail(2),
    row("healthy", "synthetic", true),
  ]);
  assert.equal(countConsecutiveExternalFailures(history, 3), 2);
});

test("the same observations counted twice give the same answer", () => {
  // chronologically: fail x4 -> newest-first is four identical critical rows
  const history = historyNewestFirst(fail(4));
  const once = countConsecutiveExternalFailures(history, 3);
  const twice = countConsecutiveExternalFailures(history, 3);
  assert.equal(once, twice);
  assert.equal(once, 3);
});

test("an invalid threshold is treated as 1 rather than opening nothing", () => {
  assert.equal(countConsecutiveExternalFailures(fail(1), 0), 1);
  assert.equal(countConsecutiveExternalFailures(fail(1), Number.NaN), 1);
});