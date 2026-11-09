import type { Frame, Page } from '@playwright/test';
import { dismissDialogs } from '../../../../lib/fixtures';

type OpenApp = (page: Page, app: string, hash?: string) => Promise<Frame>;

/**
 * Abre una postulación por ID en la app Postulaciones y espera a que el modelo global la
 * tenga cargada. Si el usuario tiene varios roles, elige `role` en el diálogo «Cambiar rol».
 */
export async function abrirPostulacion(
  page: Page, openApp: OpenApp, id: number, opts: { role?: string; admin?: boolean } = {},
): Promise<Frame> {
  const frame = await openApp(page, 'postulaciones', `${opts.admin ? '?modo=admin' : ''}&/postulacion/${id}`);

  if (opts.role) {
    const dialogo = frame.locator('#setRoleDialog');
    if (await dialogo.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await frame.evaluate(role => {
        const core = (window as any).sap.ui.getCore();
        core.byId('setRoleDialogSelectRol').setSelectedKey(role);
        core.byId('setRoleDialogConfirm').firePress();
      }, opts.role);
    }
  }

  await frame.waitForFunction(id => {
    const m = (window as any).sap?.ui?.getCore?.().getModel?.();
    return m && m.getProperty('/postulacion/id') === id && m.getProperty('/postulacion/currentStep') > 0;
  }, id, { timeout: 60_000 });
  // loadExpediente es asíncrono y completa currentStep/clarificación después: esperar a que
  // la app no tenga llamadas al backend pendientes (jQuery.ajax) durante 1 s. No sirve
  // `networkidle`: el shell de Work Zone hace polling y nunca queda quieto.
  await frame.waitForFunction(() => {
    const w = window as any;
    if (!w.jQuery || w.jQuery.active > 0) { w.__idleDesde = 0; return false; }
    w.__idleDesde = w.__idleDesde || Date.now();
    return Date.now() - w.__idleDesde > 1000;
  }, null, { timeout: 60_000, polling: 250 });
  await dismissDialogs(frame);
  return frame;
}

/** Estado del modelo relevante para diagnosticar un fallo. */
export function estado(frame: Frame) {
  return frame.evaluate(() => {
    const m = (window as any).sap.ui.getCore().getModel();
    return {
      rol: m.getProperty('/user/role'),
      estadoClarif: m.getProperty('/postulacion/clarificacion/estado'),
      vencida: m.getProperty('/postulacion/clarificacion/vencida'),
      currentStep: m.getProperty('/postulacion/currentStep'),
      resultadosPublicados: m.getProperty('/resultadosPublicados'),
      evaluacionSubcomite: m.getProperty('/postulacion/evaluacionSubcomite'),
    };
  });
}

export const boton = {
  ver: (f: Frame) => f.getByRole('button', { name: 'Ver respuesta clarif.' }),
  responder: (f: Frame) => f.getByRole('button', { name: 'Responder clarif.' }),
};

export const dialogo = (f: Frame) => f.locator('.sapMDialog[id$="dialogResponderClarificacion"]');
