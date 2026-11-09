import { test, expect } from '../../../lib/fixtures';
import { abrirPostulacion, boton, dialogo, estado } from './lib/postulacion';

// HU 1 – «Ver respuesta a Clarificación» siempre activo para consulta por rol.
// Datos de QA (2026-11-09): postulaciones y relaciones leídas de la BD, no se modifican.
//   9951  conv. cerrada, resultados publicados, clarificación respondida, comité evaluó (3)
//         postulante L00556704, representante L00579532, coordinador/secretario L00000021
//   9954  conv. cerrada, resultados publicados, respondida; miembro de subcomité L00369652
//   10008 conv. en curso, sin publicar, solicitada con plazo vencido (2026-10-05), comité evaluó (1)
//         postulante L00556704, representante L00571505
//   10014 conv. en curso, resultados publicados, solicitada en plazo (2027-11-12); postulante L00003899
//   10002 conv. en curso, respondida, comité sin evaluar; representante L00369652
//   9934  sin clarificación; postulante L00556704

type Caso = {
  titulo: string; tags: string; nomina: string; id: number; role?: string; admin?: boolean;
  esperado: 'ver' | 'oculto'; soloLectura?: boolean;
};

const casos: Caso[] = [
  { titulo: 'CA1 postulante ve la respuesta con convocatoria cerrada', tags: '@postulante', nomina: 'L00556704', id: 9951, role: 'postulante', esperado: 'ver', soloLectura: true },
  { titulo: 'CA1 admin ve la respuesta con convocatoria cerrada', tags: '@admin', nomina: 'L01472357', id: 9951, admin: true, esperado: 'ver' },
  { titulo: 'CA1 coordinador/secretario ve la respuesta con convocatoria cerrada', tags: '@subcomite', nomina: 'L00000021', id: 9951, role: 'subcomite', esperado: 'ver' },
  { titulo: 'CA1 miembro de subcomité ve la respuesta con convocatoria cerrada', tags: '@miembrosubcomite', nomina: 'L00369652', id: 9954, role: 'miembrosubcomite', esperado: 'ver' },
  { titulo: 'CA2 sin clarificación no hay botón', tags: '@postulante', nomina: 'L00556704', id: 9934, role: 'postulante', esperado: 'oculto' },
  { titulo: 'RN4 postulante con plazo vencido: solo lectura', tags: '@postulante', nomina: 'L00556704', id: 10008, role: 'postulante', esperado: 'ver', soloLectura: true },
  { titulo: 'RN4 postulante con resultados publicados: solo lectura', tags: '@postulante', nomina: 'L00003899', id: 10014, role: 'postulante', esperado: 'ver', soloLectura: true },
  { titulo: 'RN5 representante ve la respuesta tras evaluación del comité (resultados publicados)', tags: '@representante', nomina: 'L00579532', id: 9951, role: 'representante', esperado: 'ver', soloLectura: true },
  { titulo: 'RN5 representante ve la respuesta tras evaluación del comité (sin publicar)', tags: '@representante', nomina: 'L00571505', id: 10008, role: 'representante', esperado: 'ver', soloLectura: true },
  { titulo: 'RN5 representante no ve la respuesta antes de la evaluación del comité', tags: '@representante', nomina: 'L00369652', id: 10002, role: 'representante', esperado: 'oculto' },
];

for (const c of casos) {
  test(`${c.titulo} (#${c.id}) @hu1 @postulaciones ${c.tags}`, async ({ asUser, openApp }) => {
    const page = await asUser(c.nomina);
    const frame = await abrirPostulacion(page, openApp, c.id, { role: c.role, admin: c.admin });
    const info = JSON.stringify(await estado(frame));

    if (c.esperado === 'oculto') {
      await expect(boton.ver(frame), info).toHaveCount(0);
      await expect(boton.responder(frame), info).toHaveCount(0);
      return;
    }

    await expect(boton.ver(frame), info).toBeVisible();
    await expect(boton.ver(frame), info).toBeEnabled();
    await expect(boton.responder(frame), info).toHaveCount(0);

    await boton.ver(frame).click();
    const d = dialogo(frame);
    await expect(d, info).toBeVisible({ timeout: 20_000 });
    if (c.soloLectura) {
      await expect(d.getByRole('button', { name: 'Aceptar', exact: true }), info).toHaveCount(0);
      const editables = d.locator('textarea:not([readonly]):not([disabled])');
      await expect(editables, info).toHaveCount(0);
    }
  });
}
