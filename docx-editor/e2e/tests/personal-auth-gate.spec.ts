/**
 * PersonalAuthGate end-to-end: drives the React modal at
 * /examples/vite/src/App.tsx in `?e2e=auth-gate` mode against a
 * mocked Casual gateway.
 *
 * The Casual gateway isn't running during the Playwright suite —
 * `page.route()` intercepts every /auth/* request and replies with a
 * fixture matching the real backend's JSON envelope shape (see
 * backend/internal/auth/personal/routes.go).
 *
 * Each scenario tests one flow:
 *   - login happy path → modal hides, signed-in surface renders
 *   - login wrong password → inline error
 *   - login → toggle to signup → create account → modal hides
 *   - signup weak password → inline error
 *   - email already signed in (/auth/me 200 first) → modal never renders
 */
import { expect, test } from '@playwright/test';

interface AuthState {
  /** Mocked /auth/me result. Starts unauth'd; flips to signed-in after login/signup. */
  signedIn: boolean;
  user: { userId: string; email: string; displayName: string; isAdmin: boolean; createdAt: string };
}

const DEFAULT_USER = {
  userId: 'user_42',
  email: 'alex@example.com',
  displayName: 'Alex',
  isAdmin: false,
  createdAt: '2026-01-01T00:00:00Z',
};

async function mockAuth(page: import('@playwright/test').Page, opts?: {
  /** Initial signed-in state. Default false (gate opens immediately). */
  signedInAtBoot?: boolean;
  /** Override the password the login mock accepts. Default 'passw0rd!'. */
  goodPassword?: string;
  /** Override the email the signup mock rejects as taken. Default null. */
  takenEmail?: string;
}) {
  const state: AuthState = {
    signedIn: opts?.signedInAtBoot ?? false,
    user: { ...DEFAULT_USER },
  };
  const goodPassword = opts?.goodPassword ?? 'passw0rd!';

  await page.route('**/auth/me', async (route) => {
    if (state.signedIn) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.user) });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'not_authenticated', message: 'no session' }),
      });
    }
  });

  await page.route('**/auth/login', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    if (body.password !== goodPassword) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'invalid_credentials', message: 'no match' }),
      });
      return;
    }
    state.signedIn = true;
    state.user.email = body.email;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.user) });
  });

  await page.route('**/auth/signup', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    if (opts?.takenEmail && body.email === opts.takenEmail) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'email_taken', message: 'already' }),
      });
      return;
    }
    if (body.password && body.password.length < 8) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'weak_password', message: 'too short' }),
      });
      return;
    }
    state.signedIn = true;
    state.user.email = body.email;
    if (body.displayName) state.user.displayName = body.displayName;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(state.user) });
  });
}

test.describe('PersonalAuthGate', () => {
  test('renders the modal when /auth/me returns 401', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    await expect(page.getByTestId('personal-auth-gate')).toBeVisible();
    await expect(page.getByTestId('personal-auth-email')).toBeVisible();
    await expect(page.getByTestId('personal-auth-password')).toBeVisible();
    // Submit disabled until both fields are filled.
    await expect(page.getByTestId('personal-auth-submit')).toBeDisabled();
  });

  test('login happy path → modal hides + signed-in content renders', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('personal-auth-email').fill('alex@example.com');
    await page.getByTestId('personal-auth-password').fill('passw0rd!');
    await page.getByTestId('personal-auth-submit').click();
    await expect(page.getByTestId('signed-in-content')).toBeVisible();
    await expect(page.getByTestId('personal-auth-gate')).toBeHidden();
  });

  test('login wrong password → inline error, modal stays open', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('personal-auth-email').fill('alex@example.com');
    await page.getByTestId('personal-auth-password').fill('wrongpass');
    await page.getByTestId('personal-auth-submit').click();
    await expect(page.getByTestId('personal-auth-error')).toContainText(/don.t match/i);
    await expect(page.getByTestId('personal-auth-gate')).toBeVisible();
  });

  test('toggle to signup → create account → success', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('personal-auth-toggle').click();
    // Submit button label flips after toggle.
    await expect(page.getByTestId('personal-auth-submit')).toContainText(/create account/i);
    await page.getByTestId('personal-auth-email').fill('new@example.com');
    await page.getByTestId('personal-auth-password').fill('passw0rd!');
    await page.getByTestId('personal-auth-displayname').fill('New User');
    await page.getByTestId('personal-auth-submit').click();
    await expect(page.getByTestId('signed-in-content')).toBeVisible();
  });

  test('signup weak password → inline error', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('personal-auth-toggle').click();
    await page.getByTestId('personal-auth-email').fill('new@example.com');
    // 8+ chars satisfies the HTML5 minLength so we POST and the
    // server-side check kicks in. Here we fake "weak" via 9 chars
    // that the mock treats as too short by forcing a 400.
    await page.getByTestId('personal-auth-password').fill('passw0rd');
    // Override the mock to reject this length: set up a fresh route
    // that always returns weak_password.
    await page.route('**/auth/signup', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'weak_password', message: 'too short' }),
      });
    });
    await page.getByTestId('personal-auth-submit').click();
    await expect(page.getByTestId('personal-auth-error')).toContainText(/at least 8 characters/i);
  });

  test('already signed in → modal never renders', async ({ page }) => {
    await mockAuth(page, { signedInAtBoot: true });
    await page.goto('/?e2e=auth-gate');
    await expect(page.getByTestId('signed-in-content')).toBeVisible();
    await expect(page.getByTestId('personal-auth-gate')).toBeHidden();
  });

  test('UserMenu — shows displayName and toggles dropdown', async ({ page }) => {
    await mockAuth(page, { signedInAtBoot: true });
    await page.goto('/?e2e=auth-gate');
    await expect(page.getByTestId('user-menu')).toBeVisible();
    await expect(page.getByTestId('user-menu')).toContainText('Alex');
    // Dropdown is hidden until the trigger is clicked.
    await expect(page.getByTestId('user-menu-dropdown')).toBeHidden();
    await page.getByTestId('user-menu').click();
    await expect(page.getByTestId('user-menu-dropdown')).toBeVisible();
    await expect(page.getByTestId('user-menu-signout')).toBeVisible();
  });

  test('sign-out → /auth/logout fires + modal returns', async ({ page }) => {
    let logoutCalled = false;
    await mockAuth(page, { signedInAtBoot: true });
    // Wire the logout mock — flips the shared state back to
    // unauth'd so the gate re-renders the modal.
    await page.route('**/auth/logout', async (route) => {
      logoutCalled = true;
      // Re-route /auth/me to 401 so the gate's next probe sees the
      // unauth'd state.
      await page.route('**/auth/me', async (subroute) => {
        await subroute.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'not_authenticated', message: 'no session' }),
        });
      });
      await route.fulfill({ status: 204 });
    });

    await page.goto('/?e2e=auth-gate');
    await expect(page.getByTestId('signed-in-content')).toBeVisible();

    await page.getByTestId('user-menu').click();
    await page.getByTestId('user-menu-signout').click();

    // Modal returns; signed-in surface is hidden.
    await expect(page.getByTestId('personal-auth-gate')).toBeVisible();
    await expect(page.getByTestId('signed-in-content')).toBeHidden();
    expect(logoutCalled).toBe(true);
  });

  test('UserMenu — outside click closes the dropdown', async ({ page }) => {
    await mockAuth(page, { signedInAtBoot: true });
    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('user-menu').click();
    await expect(page.getByTestId('user-menu-dropdown')).toBeVisible();
    // Click on a neutral area outside the dropdown.
    await page.getByTestId('signed-in-content').click({ position: { x: 100, y: 100 } });
    await expect(page.getByTestId('user-menu-dropdown')).toBeHidden();
  });
});
