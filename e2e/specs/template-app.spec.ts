import { test, expect } from '@playwright/test';
import { RootPage } from '../pages';

test('Template app loads and displays all core components', async ({ page }) => {
  const rootPage = new RootPage(page);
  await rootPage.goto();

  await expect(page).toHaveURL(/\/openmrs\/spa\/root/);

  await expect(rootPage.welcomeHeading).toBeVisible();
  await expect(
    page.getByText('The following examples demonstrate some key features of the O3 framework'),
  ).toBeVisible();
});
