import { test, expect } from '../../../lib/fixtures';

// Verifica qué versión del front está desplegada buscando marcas de los últimos cambios
// en los recursos que sirve el html5-repo. Ajustar las marcas al cambiar de entrega.
const checks: Record<string, { app: string; ns: string; files: Record<string, string> }> = {
  postulaciones: {
    app: 'postulaciones',
    ns: 'postulaciones',
    files: {
      'view/Postulacion.view.xml': 'clarificacion/vencida',
      'css/style.css': 'margin: 0 auto 0.5rem',
      'visor.js': 'visor-archivo',
      'i18n/i18n.properties': 'msgSinInformacionPerfilUnico',
    },
  },
  missubcomites: {
    app: 'missubcomites',
    ns: 'missubcomites',
    files: { 'i18n/i18n.properties': 'msgSinInformacionPerfilUnico' },
  },
};

for (const [name, c] of Object.entries(checks)) {
  test(`deploy ${name} @deploy @${name}`, async ({ as, openApp }) => {
    const page = await as('postulante');
    const frame = await openApp(page, c.app);
    const results = await frame.evaluate(async ({ ns, files }) => {
      const sap = (window as any).sap;
      const out: Record<string, string> = {};
      for (const [file, marker] of Object.entries(files)) {
        const url = sap.ui.require.toUrl(`${ns}/${file}`);
        const r = await fetch(url);
        out[file] = !r.ok ? `HTTP ${r.status}` : (await r.text()).includes(marker) ? 'ok' : 'sin marca';
      }
      return out;
    }, c);
    console.log(name, JSON.stringify(results));
    expect(Object.values(results).every(v => v === 'ok'), JSON.stringify(results)).toBe(true);
  });
}
