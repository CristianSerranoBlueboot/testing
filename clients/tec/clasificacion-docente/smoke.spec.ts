import { test, expect } from '../../../lib/fixtures';
import { load } from '../../../lib/config';

const { project } = load();

// Login y launchpad por rol: cada rol entra y ve sus apps.
for (const role of [...new Set(project.users.map(u => u.role))]) {
  test(`login ${role} @smoke @${role}`, async ({ as }) => {
    const page = await as(role);
    const expected = project.launchpad?.[role];
    if (!expected) {
      await expect(page.locator('a[href*="-display"]').first()).toBeVisible({ timeout: 60_000 });
      return;
    }
    for (const app of expected) {
      await expect(page.locator(`a[href*="#${project.apps[app]}"]`).first()).toBeVisible({ timeout: 60_000 });
    }
  });
}

// Cada app del launchpad de cada rol abre sin diálogo de error.
for (const [role, apps] of Object.entries(project.launchpad ?? {})) {
  for (const app of apps) {
    test(`abre ${app} como ${role} @smoke @${role} @${app}`, async ({ as, openApp }) => {
      const page = await as(role);
      const frame = await openApp(page, app);
      await expect(frame.locator('.sapMMessageBoxError, .sapMDialogError')).toHaveCount(0);
    });
  }
}
