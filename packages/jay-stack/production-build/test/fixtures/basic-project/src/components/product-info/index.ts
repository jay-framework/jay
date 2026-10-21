import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const productInfo = makeJayStackComponent()
    .withProps<{ slug: string }>()
    .withSlowlyRender(async (props: { slug: string }) =>
        phaseOutput({ title: `Product ${props.slug}` }, {}),
    );
