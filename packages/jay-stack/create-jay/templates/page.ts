import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { PageContract } from './page.jay-contract';

const AIDITOR_DEV_PATH = '/aiditor';

export const page = makeJayStackComponent<PageContract>()
    .withSlowlyRender(async () => {
        return phaseOutput(
            {
                title: 'Welcome to Jay',
                description: 'Your project is ready — here are three ways to start building.',
            },
            {},
        );
    })
    .withInteractive((_props, refs) => {
        refs.openAiditor.onclick(() => {
            window.open(AIDITOR_DEV_PATH, '_blank', 'noopener,noreferrer');
        });
    });
