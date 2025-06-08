import { render } from './headless-component.jay-contract';
import { makeJayStackComponent, partialRender } from 'jay-fullstack-component';

export const headless = makeJayStackComponent<typeof render>()
    .withProps()
    .withSlowlyRender(async () =>
        partialRender(
            {
                content: 'This is from the headless component',
            },
            {},
        ),
    );
