import { makeJayStackComponent, partialRender } from 'jay-fullstack-component';
import { PageContract, render } from './page.jay-html';

export const page = makeJayStackComponent<PageContract>()
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
