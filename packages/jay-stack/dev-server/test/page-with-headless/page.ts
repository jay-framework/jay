import { makeJayStackComponent, partialRender } from 'jay-fullstack-component';
import { render } from './page.jay-html';

export const page = makeJayStackComponent<typeof render>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        partialRender(
            {
                title: 'Page with Headless',
                content: 'This page has a headless component',
            },
            {},
        ),
    );
