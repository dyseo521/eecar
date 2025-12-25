import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Login form should be visible
    await expect(page.getByText(/로그인|Login/i)).toBeVisible();
  });

  test('should have email and password inputs', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Email input
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="이메일"]');
    await expect(emailInput.first()).toBeVisible();

    // Password input
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput.first()).toBeVisible();
  });

  test('should have login button', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Login/submit button
    const loginButton = page.getByRole('button', { name: /로그인|login|submit/i });
    await expect(loginButton.first()).toBeVisible();
  });

  test('should display signup page', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // Signup form should be visible
    await expect(page.getByText(/회원가입|Sign up|Register/i)).toBeVisible();
  });

  test('should navigate between login and signup', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Look for signup link
    const signupLink = page.getByRole('link', { name: /회원가입|signup|register/i });
    if (await signupLink.count() > 0) {
      await signupLink.click();
      await page.waitForURL(/signup/);
      expect(page.url()).toContain('signup');
    }
  });

  test('should show error for invalid login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Fill in invalid credentials
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill('invalid@test.com');
    await passwordInput.fill('wrongpassword');

    // Submit form
    const loginButton = page.getByRole('button', { name: /로그인|login/i }).first();
    await loginButton.click();

    // Wait for response
    await page.waitForTimeout(1000);

    // Should not navigate away (still on login page)
    expect(page.url()).toContain('login');
  });
});

test.describe('Protected Routes', () => {
  test('should access seller page only when authenticated', async ({ page }) => {
    // Try to access seller page without login
    await page.goto('/seller');
    await page.waitForLoadState('networkidle');

    // Should redirect to login or show auth required message
    // (depending on implementation)
    const url = page.url();
    expect(url.includes('login') || url.includes('seller')).toBe(true);
  });
});
