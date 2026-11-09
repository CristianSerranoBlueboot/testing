import { defineConfig } from '@playwright/test';
import { projectDir, target } from './lib/config';

const { client, project, env } = target();

export default defineConfig({
  testDir: projectDir(client, project),
  outputDir: `test-results/${client}/${project}/${env}`,
  // browserless del cluster acepta 3 sesiones simultáneas y es compartido.
  workers: 2,
  timeout: 4 * 60 * 1000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: `playwright-report/${client}/${project}/${env}` }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
