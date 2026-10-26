import AxeBuilder from '@axe-core/playwright';
import { findForbiddenTerms } from '@pa/shared';
import { expect, type Page } from '@playwright/test';

// Invariant 5, applied to what the nurse actually sees: the rendered text and the tab title.
export async function expectNoForbiddenTerms(page: Page): Promise<void> {
  const visibleText = await page.evaluate(() => `${document.title}\n${document.body.innerText}`);
  expect(findForbiddenTerms(visibleText)).toEqual([]);
}

// Every page must pass axe, including colour contrast (this is what catches an unreadable yellow badge).
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.map((violation) => {
    const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
    return `${violation.id}: ${violation.help} [${targets}]`;
  });
  expect(violations).toEqual([]);
}
