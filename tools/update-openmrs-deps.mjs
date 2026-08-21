import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Bump OpenMRS packages in the lockfile to current `next`, without committing
 * resolved version numbers into package.json (form-engine-lib / patient-chart pattern).
 *
 * Keep tooling on latest next so Module Federation shares the same
 * @openmrs/esm-patient-common-lib singleton as patient chart apps (12.x).
 * Stale 11.x locks cause runtime errors like "useStartVisitIfNeeded is not a function".
 */
try {
  execSync(`yarn up '@openmrs/*@next' 'openmrs@next'`, {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
} catch (error) {
  console.error(`Error while updating dependencies: ${error.message ?? error}`);
  process.exit(1);
}

try {
  const pkgPath = 'package.json';
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = pkg[section];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (name === 'openmrs' || name.startsWith('@openmrs/')) {
        deps[name] = 'next';
      }
    }
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
} catch (error) {
  console.error(`Error while restoring next ranges in package.json: ${error.message ?? error}`);
  process.exit(1);
}

try {
  execSync(`yarn`, {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
} catch (error) {
  console.error(`Error while reinstalling after package.json reset: ${error.message ?? error}`);
  process.exit(1);
}

try {
  execSync(`yarn dedupe`, {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
} catch (error) {
  console.error(`Error while deduplicating dependencies: ${error.message ?? error}`);
  process.exit(1);
}

try {
  execSync(`git diff-index --quiet HEAD --`, {
    stdio: 'ignore',
    windowsHide: true,
  });
  process.exit(0);
} catch {
  // Changes exist — run verify
}

try {
  execSync(`yarn verify`, {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
} catch (error) {
  console.error(`Error while running yarn verify: ${error.message ?? error}. Updates require manual intervention.`);
  process.exit(1);
}
