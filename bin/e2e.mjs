#!/usr/bin/env node
// pnpm e2e <cliente>/<proyecto> [--env qa] [--app X] [--hu N] [--role R] [--user NOMINA] [-- args de playwright]
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const sep = process.argv.indexOf('--');
const own = sep === -1 ? process.argv.slice(2) : process.argv.slice(2, sep);
const passthrough = sep === -1 ? [] : process.argv.slice(sep + 1);

const { values, positionals } = parseArgs({
  args: own,
  allowPositionals: true,
  options: {
    env: { type: 'string', default: 'qa' },
    app: { type: 'string' },
    hu: { type: 'string' },
    role: { type: 'string' },
    user: { type: 'string' },
  },
});

const targetArg = positionals[0];
if (!targetArg || !targetArg.includes('/')) {
  console.error('Uso: pnpm e2e <cliente>/<proyecto> [--env qa] [--app X] [--hu N] [--role R] [--user NOMINA]');
  process.exit(1);
}

const env = { ...process.env, E2E_TARGET: targetArg, E2E_ENV: values.env };
if (values.user) env.E2E_USER = values.user;

if (!env.BROWSERLESS_TOKEN) {
  try {
    env.BROWSERLESS_TOKEN = execFileSync('kubectl',
      ['-n', 'browserless', 'get', 'secret', 'browserless-config', '-o', 'jsonpath={.data.TOKEN}'],
      { encoding: 'utf8' }).trim();
    env.BROWSERLESS_TOKEN = Buffer.from(env.BROWSERLESS_TOKEN, 'base64').toString();
  } catch {
    console.error('Falta BROWSERLESS_TOKEN y no se pudo leer del Secret browserless-config.');
    process.exit(1);
  }
}

// Filtros por tag: todos los pedidos tienen que estar en el título del test.
const tags = [];
if (values.app) tags.push(`@${values.app}`);
if (values.hu) tags.push(`@hu${values.hu}`);
if (values.role) tags.push(`@${values.role}`);
const grep = tags.length ? ['--grep', tags.map(t => `(?=.*${t}\\b)`).join('')] : [];

const r = spawnSync('playwright', ['test', ...grep, ...passthrough], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
