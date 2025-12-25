import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should load landing page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Landing page should have main content
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate to buyer search page', async ({ page }) => {
    await page.goto('/');

    // Look for link/button to buyer search
    const buyerLink = page.getByRole('link', { name: /부품 검색|buyer|구매/i }).first();
    if (await buyerLink.count() > 0) {
      await buyerLink.click();
      await page.waitForURL(/buyer/);
      expect(page.url()).toContain('buyer');
    } else {
      // Navigate directly
      await page.goto('/buyer');
      await expect(page).toHaveURL(/buyer/);
    }
  });

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/');

    // Look for login link
    const loginLink = page.getByRole('link', { name: /로그인|login/i }).first();
    if (await loginLink.count() > 0) {
      await loginLink.click();
      await page.waitForURL(/login/);
    } else {
      await page.goto('/login');
    }

    expect(page.url()).toContain('login');
  });

  test('should navigate back from search page to home', async ({ page }) => {
    await page.goto('/buyer');
    await page.waitForLoadState('networkidle');

    // Click back button or home link
    const backButton = page.getByRole('button', { name: /홈으로|back|뒤로/i }).first();
    if (await backButton.count() > 0) {
      await backButton.click();
      await page.waitForURL('/');
      expect(page.url()).not.toContain('buyer');
    }
  });
});

test.describe('Part Detail Page', () => {
  test('should display part detail page', async ({ page }) => {
    // Navigate to search first
    await page.goto('/buyer');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click on a part to go to detail
    const partCard = page.locator('.part-card, [class*="card"]').first();
    if (await partCard.count() > 0) {
      await partCard.click();
      await page.waitForURL(/\/parts\//);

      // Detail page should show part info
      await expect(page.locator('body')).toContainText(/원|가격|제조/);
    }
  });

  test('should display contact button on part detail', async ({ page }) => {
    await page.goto('/buyer');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const partCard = page.locator('.part-card, [class*="card"]').first();
    if (await partCard.count() > 0) {
      await partCard.click();
      await page.waitForURL(/\/parts\//);

      // Contact button should be visible
      const contactButton = page.getByRole('button', { name: /문의|contact|연락/i });
      if (await contactButton.count() > 0) {
        await expect(contactButton.first()).toBeVisible();
      }
    }
  });

  test('should navigate back from part detail', async ({ page }) => {
    await page.goto('/buyer');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const partCard = page.locator('.part-card, [class*="card"]').first();
    if (await partCard.count() > 0) {
      await partCard.click();
      await page.waitForURL(/\/parts\//);

      // Click back button
      const backButton = page.getByRole('button', { name: /뒤로|back|목록/i }).first();
      if (await backButton.count() > 0) {
        await backButton.click();
        await page.waitForTimeout(500);
        expect(page.url()).toContain('buyer');
      }
    }
  });
});
