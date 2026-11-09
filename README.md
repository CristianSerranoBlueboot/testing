# testing

Pruebas E2E de las apps de los clientes de BlueBoot, con Playwright contra el
Chromium de browserless del cluster.

## Uso

```
pnpm install
pnpm e2e <cliente>/<proyecto> [--env qa] [--app X] [--hu N] [--role R] [--user NOMINA] [-- <args de playwright>]
```

Ejemplo: `pnpm e2e tec/clasificacion-docente --role postulante --app postulaciones`.

`--app`, `--hu` y `--role` filtran por los tags del título del test (`@postulaciones`,
`@hu1`, `@postulante`); combinados, el test tiene que tener todos.

## Estructura

| Ruta | Contenido |
|---|---|
| `clients/<cliente>/<proyecto>/project.yaml` | Ambientes, apps (intent FLP), usuarios por rol, apps esperadas en el launchpad |
| `clients/<cliente>/<proyecto>/*.spec.ts` | Tests del proyecto |
| `lib/config.ts` | Carga del `project.yaml` y de los secretos |
| `lib/auth.ts` | Login por IdP (`tec-adfs`, `sap-id`) y reuso de sesión |
| `lib/fixtures.ts` | Fixtures `as(rol)` y `openApp(page, app)` |
| `bin/e2e.mjs` | CLI: elige proyecto/ambiente y arma el `--grep` |

## Secretos

Las contraseñas no están en el repo. `project.yaml` indica el archivo (`secrets`,
relativo a la raíz del repo; para TEC, `../TEC/.env`) y la clave (`passwordKey`,
p. ej. `CD_PWD_{nomina}`).

browserless: `BROWSERLESS_TOKEN` del entorno; si falta, se lee del Secret
`browserless-config` (ns `browserless`) con `kubectl`. `BROWSERLESS_URL` cambia el
endpoint CDP (default `ws://browserless.browserless.svc.cluster.local:3000/chromium`).

## Comportamiento

- Un navegador por test: browserless corta cada conexión a los 5 min.
- Conexión por CDP: el cliente Playwright no depende de las versiones que soporta browserless.
- Sesión por usuario en `.auth/`, reusada 20 min para no repetir el login en el IdP.
- 2 workers: browserless admite 3 sesiones simultáneas y es compartido.
- Reportes: `playwright-report/<cliente>/<proyecto>/<env>/`.
