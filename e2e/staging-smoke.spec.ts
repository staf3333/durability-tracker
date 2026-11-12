import { expect, test } from '@playwright/test';

test.skip(process.env.STAGING_SMOKE !== '1', 'Runs only against the staging deployment');

test('staging is unmistakable, synthetic, same-origin, and PWA scoped', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  const response = await page.goto('/');
  await expect(page.getByRole('status')).toContainText('STAGING · synthetic data only');
  await expect(page.locator('.buildid')).toContainText('staging · build');
  await page.getByLabel('Day plan').selectOption('mon');
  await expect(page.getByRole('button', { name: 'Open Lower A' })).toContainText('In progress');
  await page.getByLabel('Day plan').selectOption('tue');
  await expect(page.getByRole('button', { name: 'Open Shooting / WOTW' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Daily microdose' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Upper 1' })).toBeVisible();
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: /Open Lower A from/i }).click();
  await expect(page.getByRole('heading', { name: 'Lower A' })).toBeVisible();
  await expect(page.getByText('24 kg × 8')).toBeVisible();
  await page.getByRole('button', { name: /Back to history/i }).click();

  const origin = new URL(page.url()).origin;
  const expectedOrigin = process.env.STAGING_EXPECTED_ORIGIN
    ?? 'https://staging.stafinthelab.com';
  expect(origin).toBe(expectedOrigin);
  expect(requests.every((url) => !url.startsWith('https://stafinthelab.com'))).toBe(true);
  if (expectedOrigin === 'https://staging.stafinthelab.com') {
    expect(response?.headers()['content-security-policy']).toContain("connect-src 'self'");
  }

  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  })).toBe(`${origin}/`);

  const apiOrigin = await page.evaluate(async () => {
    const response = await fetch('/api/sync');
    return new URL(response.url).origin;
  });
  expect(apiOrigin).toBe(origin);
});
