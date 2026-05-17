import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const cartBadge = makeJayStackComponent()
    .withProps<{ label?: string }>()
    .withSlowlyRender(async (props: { label?: string }) =>
        phaseOutput({ badgeLabel: props.label || 'Cart' }, {}),
    )
    .withFastRender(async (_props: {}, _carryForward: {}) =>
        phaseOutput({ count: 3 }, {}),
    );
