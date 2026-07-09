import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { PageContract } from './page.jay-contract';

export const page = makeJayStackComponent<PageContract>()
    .withSlowlyRender(async () => {
        return phaseOutput(
            {
                title: 'Welcome to Jay',
                description: 'Your project is ready. Edit src/pages/page.jay-html to get started.',
            },
            {},
        );
    });
