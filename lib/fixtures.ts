import { test as base, chromium, expect, type Browser, type Frame, type Page } from '@playwright/test';
import { environment, load, userFor } from './config';
import { loggedPage } from './auth';

// browserless corta cada conexión a los 5 min (TIMEOUT): un navegador por test, no por worker.
// Se conecta por CDP para no atar la versión del cliente a las que soporta browserless.
async function connect(): Promise<Browser> {
  const url = process.env.BROWSERLESS_URL || 'ws://browserless.browserless.svc.cluster.local:3000/chromium';
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error('Falta BROWSERLESS_TOKEN');
  return chromium.connectOverCDP(url, { headers: { Authorization: `Bearer ${token}` } });
}

/**
 * Cierra los diálogos de `dismiss` (project.yaml) que estén abiertos. Algunos (encuestas)
 * aparecen con demora: llamarla también después de cargar datos, antes de interactuar.
 */
export async function dismissDialogs(frame: Frame, waitMs = 3_000) {
  for (const d of load().project.dismiss ?? []) {
    const dialog = frame.locator('.sapMDialog', { hasText: d.text });
    if (await dialog.isVisible({ timeout: waitMs }).catch(() => false)) {
      await dialog.getByRole('button', { name: d.button }).click();
      await dialog.waitFor({ state: 'hidden' });
    }
  }
}

type Fixtures = {
  /** Página con sesión iniciada con el usuario del rol pedido. */
  as: (role: string) => Promise<Page>;
  /** Página con sesión iniciada con un usuario puntual (nómina de project.yaml). */
  asUser: (nomina: string) => Promise<Page>;
  /**
   * Navega al intent de la app (clave de `apps` en project.yaml) y devuelve el frame donde
   * corre: Work Zone carga cada app en un iframe (`ui5appruntime.html`), no en la página.
   * `hash` se agrega al intent (parámetros `?x=y` y/o ruta interna `&/ruta`).
   */
  openApp: (page: Page, app: string, hash?: string) => Promise<Frame>;
};

export const test = base.extend<Fixtures & { remote: Browser }>({
  remote: async ({}, use) => {
    const browser = await connect();
    await use(browser);
    await browser.close();
  },
  as: async ({ remote }, use) => {
    await use(role => loggedPage(remote, userFor(role)));
  },
  asUser: async ({ remote }, use) => {
    await use(nomina => {
      const user = load().project.users.find(u => u.nomina === nomina);
      if (!user) throw new Error(`Usuario ${nomina} no definido en project.yaml`);
      return loggedPage(remote, user);
    });
  },
  openApp: async ({}, use) => {
    await use(async (page, app, hash = '') => {
      const intent = load().project.apps[app];
      if (!intent) throw new Error(`App "${app}" no definida en project.yaml`);
      await page.goto(environment().url + '#' + intent + hash);
      const handle = await page.waitForSelector('iframe[src*="ui5appruntime"]', { timeout: 60_000 });
      const frame = await handle.contentFrame();
      if (!frame) throw new Error(`No se encontró el iframe de la app "${app}"`);
      // Listo cuando hay un componente propio (no sap.*) registrado y ningún busy indicator
      // visible (UI5 deja nodos de busy ocultos en el DOM).
      await frame.waitForFunction(() => {
        const reg = (window as any).sap?.ui?.core?.Component?.registry;
        const own = reg?.filter((c: any) => !String(c.getManifestEntry?.('sap.app')?.id || 'sap.').startsWith('sap.'));
        const busy = [...document.querySelectorAll<HTMLElement>('.sapUiLocalBusyIndicator')]
          .some(e => e.offsetParent !== null);
        return own?.length > 0 && !busy;
      }, null, { timeout: 90_000 });
      await dismissDialogs(frame);
      return frame;
    });
  },
});

export { expect };
