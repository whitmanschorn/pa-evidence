import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { SessionProvider } from './session';
import { cssVariablesResolver, theme } from './theme';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('index.html has no #root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      <SessionProvider>
        <BrowserRouter basename="/ui">
          <App />
        </BrowserRouter>
      </SessionProvider>
    </MantineProvider>
  </StrictMode>,
);
