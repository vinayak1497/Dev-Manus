/**
 * Auth sky theme resolution.
 *
 * The inline script in `app/layout.tsx` and the toggle must agree on the
 * accepted values and on when the OS preference applies; these are the rules
 * that decide which scene a visitor sees on their very first paint.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  nextTheme,
  parseTheme,
  resolveTheme,
} from "../../lib/theme";

test("parseTheme accepts only the two scene names", () => {
  assert.equal(parseTheme("day"), "day");
  assert.equal(parseTheme("night"), "night");
  assert.equal(parseTheme("dark"), null);
  assert.equal(parseTheme(""), null);
  assert.equal(parseTheme(null), null);
  assert.equal(parseTheme(undefined), null);
});

test("an explicit choice always beats the OS preference", () => {
  assert.equal(resolveTheme("day", true), "day");
  assert.equal(resolveTheme("night", false), "night");
});

test("without a stored choice the OS preference decides", () => {
  assert.equal(resolveTheme(null, true), "night");
  assert.equal(resolveTheme(null, false), "day");
  assert.equal(resolveTheme("garbage", true), "night");
  assert.equal(resolveTheme("garbage", false), "day");
});

test("nextTheme flips both ways", () => {
  assert.equal(nextTheme("day"), "night");
  assert.equal(nextTheme("night"), "day");
});

test("storage key and attribute are the contract with the inline script", () => {
  assert.equal(THEME_STORAGE_KEY, "devops-safeguard-theme");
  assert.equal(THEME_ATTRIBUTE, "data-auth-theme");
});
