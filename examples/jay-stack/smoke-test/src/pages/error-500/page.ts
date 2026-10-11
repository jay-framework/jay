import {
    makeJayStackComponent,
    phaseOutput,
    serverError5xx,
    type PageProps,
} from '@jay-framework/fullstack-component';
import type { PageContract, PageSlowViewState } from './page.jay-html';

// DL#218 — a page that always fails at request time, to exercise the branded 5xx error page
// end-to-end. The slow phase renders static chrome at build; the fast phase returns a 500 outcome,
// so every request resolves through pages/5xx (exact → family) instead of this page's own body.
export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>({ title: 'Error 500 Trigger' }, {}),
    )
    .withFastRender(async () =>
        serverError5xx(500, 'This page always fails at request time.', {
            title: 'Something went wrong',
            details: { source: 'error-500 smoke page' },
        }),
    );
