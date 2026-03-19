import { HeadlessComponentContract, render } from './headless-component.jay-contract';
import { makeJayStackComponent, partialRender } from '@jay-framework/fullstack-component';

export const headless = makeJayStackComponent<HeadlessComponentContract>()
    .withProps()
    .withSlowlyRender(async () =>
        partialRender(
            {
                content: 'This is from the headless component',
            },
            {},
        ),
    );
