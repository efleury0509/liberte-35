import { defineConfig, devices } from '@playwright/test';

// Tests de parcours de l'interface, dans un vrai navigateur, sur un écran
// d'ordinateur (priorité au bureau, cahier 2). L'interface tourne en mode
// « aperçu » : aucune donnée n'est enregistrée.
// CHROME_PATH permet d'utiliser un Chrome déjà installé ; sinon Playwright
// utilise son propre Chromium (sur GitHub Actions).

const cheminChrome = process.env.CHROME_PATH;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
    locale: 'fr-CA',
    launchOptions: cheminChrome ? { executablePath: cheminChrome } : {},
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
