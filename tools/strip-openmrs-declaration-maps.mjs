/**
 * OpenMRS packages ship *.d.ts.map that point at their src/*.ts(x).
 * `tsc` follows those maps and typechecks node_modules source, which:
 *  - redeclares globals (e.g. __webpack_share_scopes__) against dist .d.ts
 *  - surfaces third-party version skew (e.g. nested @internationalized/date)
 *
 * Strip the maps so consumers only typecheck against published .d.ts (+ skipLibCheck).
 */
import { readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = [join(process.cwd(), 'node_modules', '@openmrs')];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.d.ts.map')) {
      try {
        unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  }
}

for (const root of roots) {
  try {
    if (statSync(root).isDirectory()) walk(root);
  } catch {
    /* package not installed yet */
  }
}
