import { createTheme, type CSSVariablesResolver } from '@mantine/core';

// Phase 8 adds the status palette here. Indigo is the neutral brand colour, never a status colour.
export const theme = createTheme({
  primaryColor: 'indigo',
});

// Mantine's default "dimmed" text is gray.6, about 3.3:1 on white, which fails WCAG AA (4.5:1).
// gray.7 is about 8:1, so every `c="dimmed"` in the app stays readable.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--mantine-color-dimmed': 'var(--mantine-color-gray-7)' },
  dark: {},
});
