import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './test-ui', fullyParallel: false, workers: 1, use: { browserName: 'chromium', headless: true }, reporter: 'list' });
