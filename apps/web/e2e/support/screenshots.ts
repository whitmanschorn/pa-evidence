import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

// Screenshots are for a human (or Claude) to look at, never for pixel diffs. The folder is gitignored.
const SCREENSHOT_DIR = fileURLToPath(new URL('../screenshots/', import.meta.url));

const WIDTHS = [
  { label: 'desktop', width: 1440 },
  { label: 'narrow', width: 390 },
];

export async function takeScreenshots(page: Page, name: string): Promise<void> {
  const originalSize = page.viewportSize();
  for (const { label, width } of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}${name}-${label}.png`, fullPage: true });
  }
  if (originalSize) {
    await page.setViewportSize(originalSize);
  }
}
