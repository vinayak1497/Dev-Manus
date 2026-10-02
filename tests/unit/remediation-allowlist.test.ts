/**
 * Remediation allowlist tests (acceptance §15/§24).
 *
 * The allowlist is the choke point that stops any arbitrary command reaching an
 * engine. These assert it is CLOSED: only the three known demo actions pass,
 * and there is deliberately no EXECUTE_ARBITRARY_COMMAND.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  REMEDIATION_ACTION_TYPES,
  REMEDIATION_ALLOWLIST,
  isAllowedRemediation,
  requireRemediationSpec,
} from "../../lib/remediation/actions";

test("the allowlist contains exactly the three known demo actions", () => {
  assert.deepEqual(
    [...REMEDIATION_ACTION_TYPES].sort(),
    ["RESTART_DEMO_SERVICE", "RETRY_HEALTH_CHECK", "ROLLBACK_DEMO_DEPLOYMENT"].sort(),
  );
});

test("there is no arbitrary-command action on the allowlist", () => {
  assert.equal(isAllowedRemediation("EXECUTE_ARBITRARY_COMMAND"), false);
  assert.equal(isAllowedRemediation("rm -rf /"), false);
  assert.equal(isAllowedRemediation("DROP TABLE incidents"), false);
});

test("isAllowedRemediation rejects non-string / empty / unknown values", () => {
  assert.equal(isAllowedRemediation(null), false);
  assert.equal(isAllowedRemediation(undefined), false);
  assert.equal(isAllowedRemediation(42), false);
  assert.equal(isAllowedRemediation(""), false);
  assert.equal(isAllowedRemediation("restart_demo_service"), false); // case-sensitive
});

test("each known type accepts and resolves to a consistent spec", () => {
  for (const type of REMEDIATION_ACTION_TYPES) {
    assert.equal(isAllowedRemediation(type), true);
    const spec = requireRemediationSpec(type);
    assert.equal(spec.type, type);
    assert.equal(spec, REMEDIATION_ALLOWLIST[type]);
    assert.ok(spec.title.length > 0);
    assert.ok(["low", "medium", "high"].includes(spec.risk));
  }
});

test("requireRemediationSpec throws (fails closed) for anything off-list", () => {
  assert.throws(() => requireRemediationSpec("EXECUTE_ARBITRARY_COMMAND"), /allowlist/i);
  assert.throws(() => requireRemediationSpec(null), /allowlist/i);
});

test("only RETRY_HEALTH_CHECK claims it does not restore health", () => {
  assert.equal(REMEDIATION_ALLOWLIST.RETRY_HEALTH_CHECK.restoresHealth, false);
  assert.equal(REMEDIATION_ALLOWLIST.RESTART_DEMO_SERVICE.restoresHealth, true);
  assert.equal(REMEDIATION_ALLOWLIST.ROLLBACK_DEMO_DEPLOYMENT.restoresHealth, true);
});
