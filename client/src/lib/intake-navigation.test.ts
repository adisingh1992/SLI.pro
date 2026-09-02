import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok — ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL — ${name}: ${(error as Error).message}`);
  }
}

console.log("\nintake navigation — account access without module access\n");

const shell = readFileSync("client/src/components/wing/AppShell.tsx", "utf8");
const intake = readFileSync("client/src/pages/intake-chat.tsx", "utf8");
const profile = readFileSync("client/src/pages/wing/profile.tsx", "utf8");
const route = readFileSync("client/src/lib/protected-route.tsx", "utf8");

test("intake uses the real shell in account-only mode for every rendered stage", () => {
  assert.match(intake, /function IntakeShell/);
  assert.match(intake, /onOpenExplore=\{\(\) => \{\}\} accountOnly>/);
  assert.match(intake, /if \(state\.isLoading\)[\s\S]*?<IntakeShell>/);
  assert.match(intake, /if \(showClosing\)[\s\S]*?<IntakeShell>/);
  assert.match(intake, /return \(\s*<IntakeShell>[\s\S]*?label-eyebrow/);
});

test("the restricted shell removes module and secondary-account destinations", () => {
  assert.match(shell, /accountOnly \? \(\s*<div className="min-h-0 flex-1" \/>/);
  assert.match(shell, /\{!accountOnly && \(\s*<nav/);
  assert.match(shell, /href=\{accountOnly \? "\/branding-intake" : "\/"\}/);

  const menu = shell.slice(shell.indexOf("function AccountMenuItems"));
  assert.match(menu, /<MenuLink href="\/profile" label="Profile" \/>/);
  assert.match(menu, /\{!accountOnly && \([\s\S]*?href="\/milestones"[\s\S]*?href="\/settings"[\s\S]*?href="\/files"/);
  assert.match(menu, /\{signingOut \? "Signing out…" : "Sign out"\}/);
});

test("profile is the only non-intake route available before intake completes", () => {
  assert.match(route, /const isAvailableDuringIntake = isIntakePage \|\| path === "\/profile"/);
  assert.match(route, /!intakeCompleted && !isAvailableDuringIntake && !isIntakeError/);
  assert.doesNotMatch(route, /isAvailableDuringIntake[^;]*(?:settings|files|milestones|chat)/);
});

test("profile remains account-only and does not fetch module threads during intake", () => {
  assert.match(profile, /const accountOnly = brandingIntake\?\.completed !== true/);
  assert.match(profile, /enabled: !accountOnly/);
  assert.match(profile, /accountOnly=\{accountOnly\}/);
  assert.match(profile, /!accountOnly && exploreOpen/);
});

console.log(failed ? `\n${failed} failed\n` : "\nall passed\n");
if (failed) process.exit(1);
