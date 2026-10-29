import { defineConfig, devices } from '@playwright/test';

// Test Manager serverless runs Chromium only - keep a single chromium project.
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    // TM_REPORT=1: report the run into UiPath Test Manager (needs uip login + scripts/tm-sync.mjs)
    ...(process.env.TM_REPORT ? [['./tests/support/tm-reporter.js']] : [])
  ],
  use: {
    trace: 'on',
    screenshot: 'on',
    // Real WebMCP (document.modelContext) - same as chrome://flags #enable-webmcp-testing
    launchOptions: { args: ['--enable-features=WebMCPTesting'] }
  },
  projects: [
    // PW_CHANNEL=chrome runs in the installed Google Chrome instead of Playwright's Chromium
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined } }
  ]
});
