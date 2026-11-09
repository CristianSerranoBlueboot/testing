import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parse as parseEnv } from 'dotenv';

export const ROOT = path.resolve(__dirname, '..');

export type User = { nomina: string; role: string; tipo?: string };
export type Environment = { url: string; login: 'tec-adfs' | 'sap-id' };
export type Project = {
  name: string;
  secrets: string;
  passwordKey: string;
  environments: Record<string, Environment>;
  apps: Record<string, string>;
  users: User[];
  launchpad?: Record<string, string[]>;
  /** Diálogos a cerrar al abrir una app (p. ej. encuestas): texto que contiene y botón. */
  dismiss?: { text: string; button: string }[];
};

/** Destino elegido por bin/e2e.mjs: `<cliente>/<proyecto>` y ambiente. */
export function target() {
  const t = process.env.E2E_TARGET;
  if (!t) throw new Error('Falta E2E_TARGET (<cliente>/<proyecto>). Correr con `pnpm e2e`.');
  const [client, project] = t.split('/');
  return { client, project, env: process.env.E2E_ENV || 'qa' };
}

export function projectDir(client: string, project: string) {
  return path.join(ROOT, 'clients', client, project);
}

let cache: { project: Project; secrets: Record<string, string> } | undefined;

export function load() {
  if (cache) return cache;
  const { client, project: name } = target();
  const file = path.join(projectDir(client, name), 'project.yaml');
  const project = parseYaml(fs.readFileSync(file, 'utf8')) as Project;
  const secretsFile = path.resolve(ROOT, project.secrets);
  const secrets = fs.existsSync(secretsFile) ? parseEnv(fs.readFileSync(secretsFile)) : {};
  cache = { project, secrets };
  return cache;
}

export function environment(): Environment {
  const { project } = load();
  const { env } = target();
  const e = project.environments?.[env];
  if (!e) throw new Error(`Ambiente "${env}" no definido en project.yaml`);
  return e;
}

/** Usuario a usar para un rol: `E2E_USER` si se pidió uno de ese rol, si no el primero. */
export function userFor(role: string): User {
  const { project } = load();
  const candidates = project.users.filter(u => u.role === role);
  if (!candidates.length) throw new Error(`No hay usuarios con rol "${role}" en project.yaml`);
  const forced = process.env.E2E_USER;
  return candidates.find(u => u.nomina === forced) || candidates[0];
}

export function passwordFor(user: User): string {
  const { project, secrets } = load();
  const key = project.passwordKey.replace('{nomina}', user.nomina);
  const value = secrets[key] ?? process.env[key];
  if (!value) throw new Error(`Falta la contraseña ${key} en ${project.secrets}`);
  return value;
}
