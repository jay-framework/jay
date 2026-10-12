import {
    makeJayStackComponent,
    phaseOutput,
    clientError4xx,
    serverError5xx,
    type PageProps,
    type RequestQuery,
    type FastRenderResult,
} from '@jay-framework/fullstack-component';
import type { PageContract, PageSlowViewState } from './page.jay-html';

// DL#218 — a page that fails at request time with a caller-chosen status, to exercise the branded
// error pages end-to-end. The status comes from the `?status=` query param (fast phase only),
// defaulting to 500. A 4xx status returns clientError4xx, a 5xx returns serverError5xx; the response
// resolves through the matching error page (exact → family → plain text). Examples:
//   /throw-error/            → 500 → pages/5xx (family)
//   /throw-error/?status=504 → 504 → pages/504 (exact)
//   /throw-error/?status=503 → 503 → pages/5xx (family)
export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>({ title: 'Throw Error Trigger' }, {}),
    )
    .withFastRender(async (props: PageProps & RequestQuery): Promise<FastRenderResult<{}, {}>> => {
        const parsed = Number.parseInt(props.query.status ?? '', 10);
        const status = Number.isNaN(parsed) ? 500 : parsed;
        const message = `This page was asked to fail with status ${status}.`;
        const details = { source: 'throw-error smoke page', requested: String(status) };
        return status >= 400 && status < 500
            ? clientError4xx(status, message, { title: 'Requested client failure', details })
            : serverError5xx(status, message, { title: 'Requested server failure', details });
    });
