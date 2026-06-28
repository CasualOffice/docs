/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * PersonalAuthGate end-to-end: drives the React modal at
 * /examples/vite/src/App.tsx in `?e2e=auth-gate` mode against a
 * mocked collab server.
 *
 * The collab server isn't running during the Playwright suite —
 * `page.route()` intercepts every /auth/* request and replies with a
 * fixture matching collab's JSON envelope shape (see
 * CasualOffice/collab src/auth/personal-routes.ts): users wrap as
 * `{ user }`, profiles as `{ user, profile }` / `{ profile }`, errors
 * as `{ error }`. collab authenticates by username, not email.
 *
 * Each scenario tests one flow:
 *   - login happy path → modal hides, signed-in surface renders
 *   - login wrong password → inline error
 *   - login → toggle to signup → create account → modal hides
 *   - signup weak password → inline error
 *   - already signed in (/auth/me 200 first) → modal never renders
 */
import { expect, test } from '@playwright/test';

interface AuthState {
  /** Mocked /auth/me result. Starts unauth'd; flips to signed-in after login/signup. */
  signedIn: boolean;
  user: { id: number; username: string; isAdmin: boolean; createdAt: number };
}

const DEFAULT_USER = {
  id: 42,
  username: 'alex',
  isAdmin: false,
  createdAt: 1_700_000_000_000,
};

async function mockAuth(
  page: import('@playwright/test').Page,
  opts?: {
    /** Initial signed-in state. Default false (gate opens immediately). */
    signedInAtBoot?: boolean;
    /** Override the password the login mock accepts. Default 'passw0rd!'. */
    goodPassword?: string;
    /** Override the username the signup mock rejects as taken. Default null. */
    takenUsername?: string;
  }
) {
  const state: AuthState = {
    signedIn: opts?.signedInAtBoot ?? false,
    user: { ...DEFAULT_USER },
  };
  const goodPassword = opts?.goodPassword ?? 'passw0rd!';

  await page.route('**/auth/me', async (route) => {
    if (state.signedIn) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: state.user }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthenticated' }),
      });
    }
  });

  await page.route('**/auth/login', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    if (body.password !== goodPassword) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid-credentials' }),
      });
      return;
    }
    state.signedIn = true;
    state.user.username = body.username;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: state.user }),
    });
  });

  await page.route('**/auth/signup', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    if (opts?.takenUsername && body.username === opts.takenUsername) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'username-taken' }),
      });
      return;
    }
    if (body.password && body.password.length < 8) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'weak-password' }),
      });
      return;
    }
    state.signedIn = true;
    state.user.username = body.username;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ user: state.user }),
    });
  });
}

test.describe('PersonalAuthGate', () => {
  test('renders the modal when /auth/me returns 401', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    await expect(page.getByTestId('personal-auth-gate')).toBeVisible();
    await expect(page.getByTestId('personal-auth-username')).toBeVisible();
    await expect(page.getByTestId('personal-auth-password')).toBeVisible();
    // Submit disabled until both fields are filled.
    await expect(page.getByTestId('personal-auth-submit')).toBeDisabled();
  });

  test('login happy path → modal hides + signed-in content renders', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('personal-auth-username').fill('alex');
    await page.getByTestId('personal-auth-password').fill('passw0rd!');
    await page.getByTestId('personal-auth-submit').click();
    await expect(page.getByTestId('signed-in-content')).toBeVisible();
    await expect(page.getByTestId('personal-auth-gate')).toBeHidden();
  });

  test('login wrong password → inline error, modal stays open', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('personal-auth-username').fill('alex');
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
    await page.getByTestId('personal-auth-username').fill('newuser');
    await page.getByTestId('personal-auth-password').fill('passw0rd!');
    await page.getByTestId('personal-auth-submit').click();
    await expect(page.getByTestId('signed-in-content')).toBeVisible();
  });

  test('signup weak password → inline error', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('personal-auth-toggle').click();
    await page.getByTestId('personal-auth-username').fill('newuser');
    // 8 chars satisfies the HTML5 minLength so we POST; the mock below
    // forces the server-side weak-password rejection.
    await page.getByTestId('personal-auth-password').fill('passw0rd');
    await page.route('**/auth/signup', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'weak-password' }),
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

  test('UserMenu — shows the username and toggles dropdown', async ({ page }) => {
    await mockAuth(page, { signedInAtBoot: true });
    await page.goto('/?e2e=auth-gate');
    await expect(page.getByTestId('user-menu')).toBeVisible();
    await expect(page.getByTestId('user-menu')).toContainText('alex');
    // Dropdown is hidden until the trigger is clicked.
    await expect(page.getByTestId('user-menu-dropdown')).toBeHidden();
    await page.getByTestId('user-menu').click();
    await expect(page.getByTestId('user-menu-dropdown')).toBeVisible();
    await expect(page.getByTestId('user-menu-signout')).toBeVisible();
  });

  test('sign-out → /auth/logout fires + modal returns', async ({ page }) => {
    let logoutCalled = false;
    await mockAuth(page, { signedInAtBoot: true });
    await page.route('**/auth/logout', async (route) => {
      logoutCalled = true;
      // Re-route /auth/me to 401 so the gate's next probe sees the
      // unauth'd state.
      await page.route('**/auth/me', async (subroute) => {
        await subroute.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'unauthenticated' }),
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

  test('ProfileSettings — opens, loads, saves, updates UserMenu', async ({ page }) => {
    await mockAuth(page, { signedInAtBoot: true });

    let profileGets = 0;
    let patchBody: Record<string, unknown> | null = null;
    const profile = {
      displayName: 'Alex',
      email: 'alex@example.com',
      timezone: 'America/Los_Angeles',
      hasAvatar: false,
      preferences: { locale: 'en-US' } as Record<string, unknown>,
    };
    await page.route('**/auth/profile', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        profileGets += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: DEFAULT_USER, profile }),
        });
      } else if (req.method() === 'PATCH') {
        patchBody = JSON.parse(req.postData() ?? '{}');
        Object.assign(profile, patchBody);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ profile }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('user-menu').click();
    await page.getByTestId('user-menu-profile').click();

    // Dialog opens + GET /auth/profile fires.
    await expect(page.getByTestId('profile-settings')).toBeVisible();
    await expect(page.getByTestId('profile-settings-displayname')).toHaveValue('Alex');
    await expect(page.getByTestId('profile-settings-timezone')).toHaveValue('America/Los_Angeles');
    expect(profileGets).toBe(1);

    // Edit displayName + timezone, save.
    await page.getByTestId('profile-settings-displayname').fill('Alex Tomato');
    await page.getByTestId('profile-settings-timezone').fill('UTC');
    await page.getByTestId('profile-settings-save').click();

    // Dialog closes + PATCH carried the patch (locale preserved in
    // preferences) + UserMenu updated.
    await expect(page.getByTestId('profile-settings')).toBeHidden();
    expect(patchBody).toEqual({
      displayName: 'Alex Tomato',
      timezone: 'UTC',
      preferences: { locale: 'en-US' },
    });
    await expect(page.getByTestId('user-menu')).toContainText('Alex Tomato');
  });

  test('ProfileSettings — cancel discards edits', async ({ page }) => {
    await mockAuth(page, { signedInAtBoot: true });
    await page.route('**/auth/profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: DEFAULT_USER,
            profile: {
              displayName: 'Alex',
              email: 'alex@example.com',
              timezone: 'UTC',
              hasAvatar: false,
              preferences: {},
            },
          }),
        });
      } else {
        // PATCH should never fire from this test.
        await route.fulfill({ status: 500, body: 'should not be called' });
      }
    });
    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('user-menu').click();
    await page.getByTestId('user-menu-profile').click();
    await page.getByTestId('profile-settings-displayname').fill('changed-but-cancelled');
    await page.getByTestId('profile-settings-cancel').click();
    await expect(page.getByTestId('profile-settings')).toBeHidden();
    // UserMenu still shows the original identity.
    await expect(page.getByTestId('user-menu')).toContainText('alex');
  });

  test('forgot-password — link visible in login mode, reveals CLI instructions', async ({
    page,
  }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    // Link is visible in the default login mode.
    await expect(page.getByTestId('personal-auth-forgot-toggle')).toBeVisible();
    // Panel is hidden until the link is clicked.
    await expect(page.getByTestId('personal-auth-forgot-panel')).toBeHidden();
    // Pre-filling username so the rendered command shows the account.
    await page.getByTestId('personal-auth-username').fill('alex');
    await page.getByTestId('personal-auth-forgot-toggle').click();
    const panel = page.getByTestId('personal-auth-forgot-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('casual-docs reset-password');
    await expect(panel).toContainText('alex');
  });

  test('forgot-password — link hidden in signup mode + collapses on toggle', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/?e2e=auth-gate');
    await page.getByTestId('personal-auth-forgot-toggle').click();
    await expect(page.getByTestId('personal-auth-forgot-panel')).toBeVisible();
    await page.getByTestId('personal-auth-toggle').click();
    // Now in signup mode — the forgot link should be gone.
    await expect(page.getByTestId('personal-auth-forgot-toggle')).toBeHidden();
    await expect(page.getByTestId('personal-auth-forgot-panel')).toBeHidden();
    // Toggling back to login — panel stays collapsed (sticky-open
    // across mode flips would be confusing UX).
    await page.getByTestId('personal-auth-toggle').click();
    await expect(page.getByTestId('personal-auth-forgot-toggle')).toBeVisible();
    await expect(page.getByTestId('personal-auth-forgot-panel')).toBeHidden();
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
