import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    { name: 'edge', use: { channel: 'msedge' } },
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:5188',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: [
    {
      command: 'npm run dev -- --port 5188 --strictPort --mode test',
      url: 'http://127.0.0.1:5188',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm run server:dev',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: false,
      timeout: 30000,
      env: { DATABASE_PATH: 'server-data/e2e.sqlite' },
    },
  ],
});
