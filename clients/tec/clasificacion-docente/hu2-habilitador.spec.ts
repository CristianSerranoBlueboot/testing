import { test, expect } from '../../../lib/fixtures';
import { environment } from '../../../lib/config';
import { abrirPostulacion } from './lib/postulacion';

// HU 2 – Mejoras del habilitador. Solo lectura: ningún caso crea ni modifica datos en QA
// (CA03 bloquea por red cualquier llamada a postulaciones_create).
// Datos QA (2026-11-09): L00556704 (nómina < 3.500.000, BD '00556704') tiene #9951 y #10008
// (convocatoria en curso); L03514594 (>= 3.500.000, BD '3514594') tiene #9950.

/** Modelo global de la app (Postulaciones guarda todo en sap.ui.getCore().getModel()). */
const modelo = (frame: any, path: string) =>
  frame.evaluate((p: string) => (window as any).sap.ui.getCore().getModel().getProperty(p), path);

// CA01 – la nómina con o sin ceros identifica al usuario con un único registro.
for (const [nomina, postulacion] of [['L00556704', 9951], ['L03514594', 9950]] as const) {
  test(`CA01 ${nomina} se identifica y ve sus postulaciones (#${postulacion}) @hu2 @postulaciones @postulante`, async ({ asUser, openApp }) => {
    const page = await asUser(nomina);
    const frame = await openApp(page, 'postulaciones');
    await frame.waitForFunction(() => {
      const m = (window as any).sap.ui.getCore().getModel();
      return Array.isArray(m.getProperty('/postulaciones')) && m.getProperty('/postulaciones').length > 0;
    }, null, { timeout: 60_000 });
    const ids: number[] = (await modelo(frame, '/postulaciones')).map((p: any) => p.id ?? p.ID);
    expect(ids, `postulaciones visibles: ${ids.join(',')}`).toContain(postulacion);
    await expect(frame.locator('.sapMMessageBoxError')).toHaveCount(0);
  });
}

test('CA02 usuario sin Perfil Único ve el mensaje amigable @hu2 @postulaciones', async () => {
  test.skip(true, 'No hay en QA un usuario que entre al IdP del Tec y no exista en Perfil Único.');
});

// CA03 – segunda postulación en la misma convocatoria: mensaje y sin alta.
test('CA03 no permite una segunda postulación en la convocatoria en curso @hu2 @postulaciones @postulante', async ({ asUser, openApp }) => {
  const page = await asUser('L00556704');
  const altas: string[] = [];
  await page.context().route(/postulaciones_create/, route => { altas.push(route.request().url()); return route.abort(); });

  const frame = await openApp(page, 'postulaciones', '&/postulacion');
  await frame.waitForFunction(() => {
    const t = (window as any).sap.ui.getCore().getModel().getProperty('/tipoPostulaciones');
    return Array.isArray(t) && t.length > 0;
  }, null, { timeout: 60_000 });
  const tipos: any[] = await modelo(frame, '/tipoPostulaciones');
  const conExistente = tipos.find(t => t.postulacionExistenteId);
  expect(conExistente, `tipoPostulaciones: ${JSON.stringify(tipos)}`).toBeTruthy();

  await frame.getByRole('button', { name: conExistente.name, exact: true }).first().click();
  const aviso = frame.locator('.sapMMessageBox');
  await expect(aviso).toBeVisible({ timeout: 15_000 });
  await expect(aviso).toContainText('Ya cuentas con una postulación registrada');
  expect(altas, 'no debe llamar a postulaciones_create').toHaveLength(0);
});

// CA04 – el ícono del Tec vuelve al menú principal desde un módulo.
test('CA04 el ícono del Tec lleva al menú principal @hu2 @postulaciones @postulante', async ({ asUser, openApp }) => {
  const page = await asUser('L00556704');
  await openApp(page, 'postulaciones', '&/postulacion/9951');
  const logo = page.locator('#shell-header-logo, [id$="-logo"], .sapUshellShellIco, ui5-shellbar [slot="logo"], img[alt*="Tecnol" i]').first();
  await expect(logo, 'no se encontró el logo en el header').toBeVisible({ timeout: 20_000 });
  await logo.click();
  await expect(page).toHaveURL(new RegExp(environment().url.replace(/[.?]/g, '\\$&') + '.*#Shell-home'), { timeout: 20_000 });
});

// CA05 / CA06 – un documento del expediente se abre en pestaña nueva, con opción de descarga.
test('CA05/CA06 documento del expediente abre en pestaña nueva y permite descargar @hu2 @postulaciones @postulante', async ({ asUser, openApp }) => {
  const page = await asUser('L00556704');
  const frame = await abrirPostulacion(page, openApp, 9951, { role: 'postulante' });
  // Llamadas al repositorio documental, para diagnosticar si falla el repositorio o la app.
  const llamadas: string[] = [];
  page.context().on('response', r => {
    if (/Xtender|documentos_|url-documento|TECDOC/i.test(r.url())) llamadas.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`);
  });
  page.context().on('requestfailed', r => {
    if (/Xtender|documentos_|url-documento|TECDOC/i.test(r.url())) llamadas.push(`FALLO ${r.failure()?.errorText} ${r.url().slice(0, 160)}`);
  });

  const linkId: string | undefined = await frame.evaluate(() => {
    const sap = (window as any).sap;
    const link = sap.ui.core.Element.registry.filter((c: any) =>
      c.getMetadata().getName() === 'sap.m.Link' && /\/archivos\/lista\//.test(c.getBindingContext()?.getPath() || ''))[0];
    return link?.getId();
  });
  expect(linkId, 'la postulación no tiene documentos en el expediente').toBeTruthy();
  const nombre = await frame.evaluate((id: string) => (window as any).sap.ui.getCore().byId(id).getText(), linkId!);

  const [pestania] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 30_000 }),
    frame.evaluate((id: string) => (window as any).sap.ui.getCore().byId(id).firePress(), linkId!),
  ]);
  // URL real del documento (si el host no resuelve, pestania.url() queda en chrome-error://).
  const destinos: string[] = [];
  pestania.on('request', r => { if (r.isNavigationRequest()) destinos.push(r.url()); });
  await pestania.waitForLoadState('domcontentloaded');
  expect(page.url(), 'la pestaña original no debe navegar').toContain('#Postulaciones-display');

  // CA05: la pestaña recibe el documento (visor propio, visor del repositorio o PDF nativo).
  await expect.poll(async () => destinos.find(u => u !== 'about:blank') || pestania.url(),
    { timeout: 90_000, message: `documento: ${nombre}\n${llamadas.join('\n')}` }).not.toBe('about:blank');
  const destino = destinos.find(u => u !== 'about:blank') || pestania.url();

  // El visor de Xtender vive en la red interna del Tec: desde browserless (cluster) no
  // resuelve, así que su contenido y su descarga no se pueden verificar acá.
  if (/^https?:\/\/[^/]*\.tec\.mx\//.test(destino) && pestania.url().startsWith('chrome-error://')) {
    test.info().annotations.push({ type: 'no verificable', description: `visor interno del Tec: ${new URL(destino).host}` });
    return;
  }
  const pdfNativo = pestania.locator('embed[type="application/pdf"]');
  const descargar = pestania.getByRole('button', { name: /descargar/i });
  // CA06: opción de descargar el original.
  await expect(pdfNativo.or(descargar).first(), `documento ${nombre} en ${pestania.url()}`).toBeVisible({ timeout: 30_000 });
});
