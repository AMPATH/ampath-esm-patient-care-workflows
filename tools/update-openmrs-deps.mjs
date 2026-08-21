import { execSync } from 'node:child_process';

try {
  // Keep OpenMRS tooling and shared libs on the latest next tags so Module
  // Federation shares the same @openmrs/esm-patient-common-lib singleton as
  // the patient chart apps (12.x). Stale 11.x locks cause runtime errors like
  // "useStartVisitIfNeeded is not a function".
  execSync(`yarn up --fixed '@openmrs/*@next' 'openmrs@next'`, {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
} catch (error) {
  console.error(`Error while updating dependencies: ${error.message ?? error}`);
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
} catch (error) {
  // git diff-index --quite HEAD --
  // exits with status 1 if there are changes; we only need to run yarn verify if there are changes
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
