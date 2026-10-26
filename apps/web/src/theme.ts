import { createTheme, type CSSVariablesResolver } from '@mantine/core';

// Indigo is the neutral brand colour, never a status colour. Shade 8, not Mantine's default 6: white button text and
// indigo links on white need it to pass WCAG AA (4.5:1); shade 6 is about 4:1.
export const theme = createTheme({
  primaryColor: 'indigo',
  primaryShade: 8,
});

// Mantine's default "dimmed" text is gray.6, about 3.3:1 on white, which fails WCAG AA (4.5:1).
// gray.7 is about 8:1, so every `c="dimmed"` in the app stays readable.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--mantine-color-dimmed': 'var(--mantine-color-gray-7)' },
  dark: {},
});
