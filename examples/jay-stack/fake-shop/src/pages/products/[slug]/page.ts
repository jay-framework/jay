import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    UrlParams,
    Signals,
} from '@jay-framework/fullstack-component';
import {
    PageRefs,
    PageContract,
    Type,
    PageSlowViewState,
    PageFastViewState,
} from './page.jay-contract';
import { Props, createSignal } from '@jay-framework/component';
import { PRODUCTS_DATABASE_SERVICE, ProductsDatabaseService } from '../../../products-database';
import { INVENTORY_SERVICE, InventoryService } from '../../../inventory-service';
import { createActionCaller, ActionError } from '@jay-framework/stack-client-runtime';

// Create client-side action callers
// In a future version, this will be handled automatically by a build transform
const addToCartAction = createActionCaller<
    { productId: string; quantity: number },
    { cartItemCount: number; message: string }
>('cart.addToCart', 'POST');

interface ProductPageParams extends UrlParams {
    slug: string;
}

interface ProductsCarryForward {
    productId: string;
}
interface ProductAndInventoryCarryForward {
    productId: string;
    inStock: boolean;
}

async function* urlLoader([productsDb, inventory]: [
    ProductsDatabaseService,
    InventoryService,
]): AsyncIterable<ProductPageParams[]> {
    const products = await productsDb.getProducts();
    yield products.map(({ slug }) => ({ slug }));
}

async function renderSlowlyChanging(
    props: PageProps & ProductPageParams,
    productsDb: ProductsDatabaseService,
) {
    const Pipeline = RenderPipeline.for<PageSlowViewState, ProductsCarryForward>();

    return Pipeline.try(() => productsDb.getProductBySlug(props.slug))
        .recover(() => Pipeline.serverError(503, 'Database unavailable'))
        .map((product) =>
            product ? product : Pipeline.notFound(`Product not found: ${props.slug}`),
        )
        .toPhaseOutput((product) => ({
            viewState: {
                name: product.name,
                sku: product.sku,
                price: product.price,
                id: product.id,
                type: Type.physical,
            },
            carryForward: { productId: product.id },
        }));
}

async function renderFastChanging(
    props: PageProps & ProductPageParams,
    carryForward: ProductsCarryForward,
    productsDb: ProductsDatabaseService,
    inventory: InventoryService,
) {
    const Pipeline = RenderPipeline.for<PageFastViewState, ProductAndInventoryCarryForward>();

    return Pipeline.try(() => inventory.getAvailableUnits(carryForward.productId))
        .recover(() => Pipeline.serverError(503, 'Inventory service unavailable'))
        .map((availableUnits) => availableUnits > 0)
        .toPhaseOutput((inStock) => ({
            viewState: { inStock },
            carryForward: {
                productId: carryForward.productId,
                inStock,
            },
        }));
}

function ProductsPageConstructor(
    props: Props<PageProps & ProductPageParams & ProductAndInventoryCarryForward>,
    refs: PageRefs,
    fastViewState: Signals<PageFastViewState>,
    fastCarryForward: ProductAndInventoryCarryForward,
) {
    // Can access fast view state reactively
    const [getInStock, setInStock] = fastViewState.inStock;

    // Can access carry forward as plain object
    const { productId, inStock } = fastCarryForward;

    // Local state for add to cart UI
    const [isAdding, setIsAdding] = createSignal(false);
    const [cartMessage, setCartMessage] = createSignal<string | null>(null);
    const [cartError, setCartError] = createSignal<string | null>(null);

    // Handle add to cart button click
    refs.addToCart.onclick(async () => {
        setIsAdding(true);
        setCartError(null);
        setCartMessage(null);

        try {
            const result = await addToCartAction({
                productId: productId,
                quantity: 1,
            });
            setCartMessage(result.message);
            console.log(`[Cart] Added to cart! Total items: ${result.cartItemCount}`);
        } catch (error) {
            if (error instanceof ActionError) {
                setCartError(error.message);
                console.error(`[Cart] Error: ${error.code} - ${error.message}`);
            } else {
                setCartError('Failed to add to cart. Please try again.');
                console.error('[Cart] Unknown error:', error);
            }
        } finally {
            setIsAdding(false);
        }
    });

    return {
        render: () => ({
            // Future: could bind these to UI elements
            // isAdding: isAdding(),
            // cartMessage: cartMessage(),
            // cartError: cartError(),
        }),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE)
    .withLoadParams(urlLoader)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
