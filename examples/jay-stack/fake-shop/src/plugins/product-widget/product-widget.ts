import {
    makeJayStackComponent,
    makeJayQuery,
    phaseOutput,
    RenderPipeline,
    Signals,
} from '@jay-framework/fullstack-component';
import {
    ProductWidgetContract,
    ProductWidgetRefs,
    ProductWidgetSlowViewState,
    ProductWidgetFastViewState,
} from './product-widget.jay-contract';
import { createSignal, Props } from '@jay-framework/component';
import {
    PRODUCTS_DATABASE_SERVICE,
    ProductsDatabaseService,
} from '../../products-database';
import {
    INVENTORY_SERVICE,
    InventoryService,
} from '../../inventory-service';

export interface ProductWidgetProps {
    productId: string;
}

interface WidgetCarryForward {
    productId: string;
}

export const productWidget = makeJayStackComponent<ProductWidgetContract>()
    .withProps<ProductWidgetProps>()
    .withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE)
    .withSlowlyRender(
        async (props: ProductWidgetProps, productsDb: ProductsDatabaseService) => {
            const products = await productsDb.getProducts();
            const product = products.find((p) => p.id === props.productId);

            if (!product) {
                return phaseOutput<ProductWidgetSlowViewState, WidgetCarryForward>(
                    { name: 'Unknown Product', price: 0, sku: 'N/A' },
                    { productId: props.productId },
                );
            }

            return phaseOutput<ProductWidgetSlowViewState, WidgetCarryForward>(
                { name: product.name, price: product.price, sku: product.sku },
                { productId: product.id },
            );
        },
    )
    .withFastRender(
        async (
            props: ProductWidgetProps,
            carryForward: WidgetCarryForward,
            productsDb: ProductsDatabaseService,
            inventoryService: InventoryService,
        ) => {
            const Pipeline = RenderPipeline.for<ProductWidgetFastViewState, WidgetCarryForward>();
            const inStock = await inventoryService.isInStock(carryForward.productId);

            return Pipeline.ok({}).toPhaseOutput(() => ({
                viewState: { inStock },
                carryForward,
            }));
        },
    )
    .withInteractive(
        (
            props: Props<ProductWidgetProps>,
            refs: ProductWidgetRefs,
            fastViewState: Signals<ProductWidgetFastViewState>,
            carryForward: WidgetCarryForward,
        ) => {
            const [inStock, setInStock] = createSignal(carryForward.productId !== '');

            refs.addToCart.onclick(() => {
                console.log(`Adding product ${carryForward.productId} to cart`);
            });

            return {
                render: () => ({
                    inStock,
                }),
            };
        },
    );

// ============================================================================
// Plugin Actions — agents use these to discover valid prop values
// ============================================================================

/**
 * List available products with their IDs.
 *
 * Agents call this action to discover valid `productId` values for the
 * product-widget component:
 *
 *   jay-stack action product-widget/listProducts
 *
 * Returns all products with id, name, and price.
 */
export const listProducts = makeJayQuery('productWidget.listProducts')
    .withCaching({ maxAge: 300 })
    .withServices(PRODUCTS_DATABASE_SERVICE)
    .withHandler(async (input: {}, productsDb: ProductsDatabaseService) => {
        const products = await productsDb.getProducts();
        return products.map((p) => ({
            productId: p.id,
            name: p.name,
            price: p.price,
        }));
    });
