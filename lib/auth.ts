import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { ROOT, environment, passwordFor, target, type User } from './config';

// La sesión del launchpad vive en cookies de sesión del lado del servidor: se reusa
// mientras sea reciente para no volver a pasar por el IdP en cada test.
const SESSION_MAX_AGE_MS = 20 * 60 * 1000;

function sessionFile(user: User) {
  const { client, project, env } = target();
  return path.join(ROOT, '.auth', `${client}_${project}_${env}_${user.nomina}.json`);
}

function freshSession(file: string) {
  return fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < SESSION_MAX_AGE_MS;
}

function isLoginPage(page: Page) {
  return /\/login|nidp|accounts\.sap\.com/.test(page.url());
}

async function loginTecAdfs(page: Page, user: User) {
  await page.getByRole('link', { name: /tec\.mx/i }).click();
  await page.locator('#Ecom_User_ID').fill(user.nomina);
  await page.locator('#Ecom_Password').fill(passwordFor(user));
  await page.keyboard.press('Enter');
}

async function loginSapId(page: Page, user: User) {
  await page.getByRole('link', { name: /Default Identity Provider/i }).click();
  await page.locator('#j_username').fill(user.nomina);
  await page.keyboard.press('Enter');
  await page.locator('input[type=password]').fill(passwordFor(user));
  await page.keyboard.press('Enter');
}

/** Abre una página con sesión iniciada como `user`, en el home del launchpad. */
export async function loggedPage(browser: Browser, user: User): Promise<Page> {
  const env = environment();
  const file = sessionFile(user);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(freshSession(file) ? { storageState: file } : {}),
  });
  const page = await context.newPage();
  await page.goto(env.url + '#Shell-home');

  if (isLoginPage(page)) {
    if (env.login === 'tec-adfs') await loginTecAdfs(page, user);
    else await loginSapId(page, user);
    await page.waitForURL(u => u.href.startsWith(env.url), { timeout: 60_000 }).catch(async () => {
      const error = await page.locator('.error, [class*=error], [role=alert]').first().innerText().catch(() => '');
      throw new Error(`Login falló para ${user.nomina} (${user.role}): ${error || page.url()}`);
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await context.storageState({ path: file });
  }
  return page;
}
