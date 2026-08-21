/**
 * From here, the application is pretty typical React, but with lots of
 * support from `@openmrs/esm-framework`.
 *
 * Check out the Config docs:
 *   https://openmrs.github.io/openmrs-esm-core/#/main/config
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './root.scss';

const Root: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className={styles.container}>
      <h3 className={styles.welcome}>{t('welcomeText', 'Welcome to the O3 Template app')}</h3>
      <p className={styles.explainer}>
        {t('explainer', 'The following examples demonstrate some key features of the O3 framework')}.
      </p>
    </div>
  );
};

export default Root;
