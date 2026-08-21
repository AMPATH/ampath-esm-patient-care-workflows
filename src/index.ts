/**
 * This is the entrypoint file of the application. It communicates the
 * important features of this microfrontend to the app shell. It
 * connects the app shell to the React application(s) that make up this
 * microfrontend.
 */
import { getAsyncLifecycle, getSyncLifecycle, defineConfigSchema } from '@openmrs/esm-framework';
import { createDashboardLink } from '@openmrs/esm-patient-common-lib';
import { patientChartExtensionMeta } from './dashboard.meta';
import { configSchema } from './config-schema';

const moduleName = '@ampath/esm-patient-care-workflows-app';

const options = {
  featureName: 'patient-care-workflows',
  moduleName,
};

/**
 * This tells the app shell how to obtain translation files: that they
 * are JSON files in the directory `../translations` (which you should
 * see in the directory structure).
 */
export const importTranslation = require.context('../translations', false, /.json$/, 'lazy');

/**
 * This function performs any setup that should happen at microfrontend
 * load-time (such as defining the config schema) and then returns an
 * object which describes how the React application(s) should be
 * rendered.
 */
export function startupApp() {
  defineConfigSchema(moduleName, configSchema);
}

/**
 * This named export tells the app shell that the default export of `root.component.tsx`
 * should be rendered when the route matches `root`. The full route
 * will be `openmrsSpaBase() + 'root'`, which is usually
 * `/openmrs/spa/root`.
 */
export const root = getAsyncLifecycle(() => import('./root.component'), options);

export const patientCareDashboardLink = getSyncLifecycle(
  createDashboardLink({
    ...patientChartExtensionMeta,
  }),
  options,
);

export const patientCareExtensionRoot = getAsyncLifecycle(
  () => import('./patient-care/patient-care.component'),
  options,
);

export const programManagerWorkspace = getAsyncLifecycle(
  () => import('./patient-care/program-manager-workspace.component'),
  options
);

export const ampathVisitWorkspace = getAsyncLifecycle(
  () => import('./patient-care/ampath-visit-workspace.component'),
  options
);
