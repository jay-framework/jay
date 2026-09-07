import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const siteHeader = makeJayStackComponent()
    .withProps<{ logoUrl: string }>()
    .withSlowlyRender(async (props: { logoUrl: string }) =>
        phaseOutput({ logoUrl: props.logoUrl, headerTitle: 'Test Shop' }, {}),
    );
