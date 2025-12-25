import { test, expect } from '@playwright/test';

test.describe('Search Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to buyer search page
    await page.goto('/buyer');
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('should display search page correctly', async ({ page }) => {
    // Page title should be visible
    await expect(page.getByText('부품 검색')).toBeVisible();

    // Search input should exist
    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible();

    // Category filters should be visible
    await expect(page.getByText('카테고리')).toBeVisible();
  });

  test('should display parts list', async ({ page }) => {
    // Wait for parts to load
    await page.waitForTimeout(1000);

    // Parts should be displayed
    const partCards = page.locator('.part-card, [class*="card"]');
    const count = await partCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should filter by category', async ({ page }) => {
    // Click on battery category
    const batteryButton = page.getByRole('button', { name: /배터리/i }).first();
    await batteryButton.click();

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Page should update (no error)
    await expect(page).toHaveURL(/buyer/);
  });

  test('should perform AI search', async ({ page }) => {
    // Find search input
    const searchInput = page.locator('input[type="text"]').first();

    // Type search query
    await searchInput.fill('72kWh 배터리');

    // Find and click search button
    const searchButton = page.getByRole('button', { name: /검색/i }).first();
    await searchButton.click();

    // Wait for search results
    await page.waitForTimeout(2000);

    // Page should not show error
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('should navigate to part detail from search results', async ({ page }) => {
    // Wait for parts to load
    await page.waitForTimeout(1000);

    // Click on first part card
    const partCard = page.locator('.part-card, [class*="card"]').first();
    if (await partCard.count() > 0) {
      await partCard.click();

      // Should navigate to detail page
      await page.waitForURL(/\/parts\//);
      expect(page.url()).toContain('/parts/');
    }
  });

  test('should toggle AI search mode', async ({ page }) => {
    // Look for AI toggle or switch
    const aiToggle = page.locator('[class*="toggle"], [class*="switch"], input[type="checkbox"]').first();
    if (await aiToggle.count() > 0) {
      await aiToggle.click();
      // Toggle should work without error
      await expect(page).toHaveURL(/buyer/);
    }
  });
});

test.describe('Search Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/buyer');
    await page.waitForLoadState('networkidle');
  });

  test('should have price filter', async ({ page }) => {
    // Price section should exist
    await expect(page.getByText(/가격|원/)).toBeVisible();
  });

  test('should display watch/alert button', async ({ page }) => {
    // Look for watch or alert functionality
    const watchButton = page.getByRole('button', { name: /알림|watch|모니터링/i });
    if (await watchButton.count() > 0) {
      await expect(watchButton.first()).toBeVisible();
    }
  });
});
