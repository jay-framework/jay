import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

interface SpotlightProps {
    slug: string;
}

export const spotlight = makeJayStackComponent()
    .withProps<SpotlightProps>()
    .withSlowlyRender(async (props: SpotlightProps) =>
        phaseOutput(
            {
                product: {
                    name: `Product ${props.slug}`,
                    imageUrl: `https://example.com/${props.slug}.jpg`,
                },
            },
            { slug: props.slug },
        ),
    )
    .withFastRender(async (props: SpotlightProps, carryForward: { slug: string }) =>
        phaseOutput({ product: { price: '$99.00' } }, carryForward),
    );
