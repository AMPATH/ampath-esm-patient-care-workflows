import type { Page, Locator } from '@playwright/test';

export class RootPage {
  readonly page: Page;
  readonly welcomeHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.welcomeHeading = page.getByRole('heading', { name: /welcome to the o3 template app/i });
  }

  async goto() {
    await this.page.goto('/openmrs/spa/root');
    await this.welcomeHeading.waitFor();
  }

  async waitForPageLoad() {
    await this.welcomeHeading.waitFor();
  }
}
