/**
 * Placeholder headless full-stack component for test fixtures.
 * Uses makeJayStackComponent with the builder pattern matching real plugin components.
 */
import { createSignal, type Props } from '@jay-framework/component';
import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import {
    type ProductCardContract,
    type ProductCardProps,
    type ProductCardRefs,
    type ProductCardSlowViewState,
    type ProductCardFastViewState,
    type ProductCardInteractiveViewState,
} from './product-card.jay-contract';

interface ProductCardCarryForward {
    name: string;
}

export const productCard = makeJayStackComponent<ProductCardContract>()
    .withProps<ProductCardProps>()
    .withSlowlyRender(async (props) => {
        return phaseOutput<ProductCardSlowViewState, ProductCardCarryForward>(
            { name: `Product ${props.productId}` },
            { name: `Product ${props.productId}` },
        );
    })
    .withFastRender(async (props: ProductCardProps, carryForward: ProductCardCarryForward) => {
        const Pipeline = RenderPipeline.for<ProductCardFastViewState, ProductCardCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { price: 0 },
            carryForward,
        }));
    })
    .withInteractive(
        (
            _props: Props<ProductCardProps>,
            refs: ProductCardRefs,
            fastVS: Signals<ProductCardInteractiveViewState>,
            _carryForward: ProductCardCarryForward,
        ) => {
            const [price] = fastVS.price;

            refs.addToCart.onclick(() => {
                // placeholder
            });

            return {
                render: () => ({
                    price,
                }),
            };
        },
    );
