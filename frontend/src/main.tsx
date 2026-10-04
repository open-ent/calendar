import { EdificeClientProvider, EdificeThemeProvider } from '@open-ent/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { router } from './routes';

import './i18n';
import './index.css';

// Le bootstrap openent n'est PAS bundlé : il est chargé au runtime via
// <link href="/assets/themes/openent-bootstrap/index.css"> dans index.html et dans la vue
// backend (view-src/calendar-react.html), comme pour blog / wiki / video. C'est cette feuille
// partagée qui porte les couleurs de marque par déploiement (data-product / data-theme) ;
// le paquet npm, lui, reste figé sur la palette compilée au dernier build.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <EdificeClientProvider params={{ app: 'calendar' }}>
        <EdificeThemeProvider>
          <RouterProvider router={router} />
        </EdificeThemeProvider>
      </EdificeClientProvider>
    </QueryClientProvider>
  </StrictMode>,
);
