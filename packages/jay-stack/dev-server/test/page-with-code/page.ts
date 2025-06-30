import { makeJayStackComponent, partialRender } from '@jay-framework/fullstack-component';
import { PageContract, render } from './page.jay-html';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        partialRender(
            {
                title: 'Page with Code',
                content: 'This page has both a jay-html file and a code file',
            },
            {},
        ),
    );
