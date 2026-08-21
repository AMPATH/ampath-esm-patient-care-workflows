const extendConfig = require('openmrs/default-webpack-config');

const sourceOnlyOpenmrsPackages = ['@openmrs/esm-patient-common-lib', '@openmrs/esm-styleguide'];

function isExcludedFromTranspilation(modulePath) {
  if (!/[\\/]node_modules[\\/]/.test(modulePath)) {
    return false; // our own source — always transpile
  }
  const normalized = modulePath.split('\\').join('/');
  return !sourceOnlyOpenmrsPackages.some((pkg) => normalized.includes(`node_modules/${pkg}/`));
}

function usesSwcLoader(rule) {
  const entries = Array.isArray(rule.use) ? rule.use : [rule.use];
  return entries.some((entry) => String((entry && entry.loader) || entry).includes('swc-loader'));
}

function excludeNodeModulesFromTypeCheck(config) {
  for (const plugin of config.plugins || []) {
    if (plugin && plugin.constructor && plugin.constructor.name === 'ForkTsCheckerWebpackPlugin') {
      plugin.options = plugin.options || {};
      plugin.options.issue = plugin.options.issue || {};
      const existing = plugin.options.issue.exclude;
      const excludes = Array.isArray(existing) ? existing.slice() : existing ? [existing] : [];
      excludes.push({ file: '**/node_modules/**' });
      plugin.options.issue.exclude = excludes;
    }
  }
}

module.exports = (env, argv = {}) => {
  const config = extendConfig(env, argv);

  for (const rule of config.module.rules || []) {
    if (rule && rule.use && usesSwcLoader(rule)) {
      rule.exclude = isExcludedFromTranspilation;
    }
  }

  excludeNodeModulesFromTypeCheck(config);

  return config;
};
