import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
} from '@jay-framework/fullstack-component';
import {
    PageContract,
    PageRefs,
    PageSlowViewState,
    PageFastViewState,
} from './page.jay-contract';
import { Props } from '@jay-framework/component';
import { PRODUCTS_DATABASE_SERVICE, ProductsDatabaseService } from '../../products-database';

interface ProductsCarryForward {}

async function renderSlowlyChanging(props: PageProps, productsDb: ProductsDatabaseService) {
    const Pipeline = RenderPipeline.for<PageSlowViewState, ProductsCarryForward>();

    return Pipeline.try(() => productsDb.getProducts())
        .recover(() => Pipeline.serverError(503, 'Failed to load products'))
        .toPhaseOutput((products) => ({
            viewState: { products },
            carryForward: {},
        }));
}

async function renderFastChanging(
    props: PageProps & ProductsCarryForward,
    productsDb: ProductsDatabaseService,
) {
    const Pipeline = RenderPipeline.for<PageFastViewState, ProductsCarryForward>();

    return Pipeline.ok({}).toPhaseOutput(() => ({
        viewState: {},
        carryForward: {},
    }));
}

function ProductsPageConstructor(
    props: Props<PageProps & ProductsCarryForward>,
    refs: PageRefs,
    fastViewState: Signals<PageFastViewState>, // Empty in this case
    fastCarryForward: ProductsCarryForward,
) {
    return {
        render: () => ({}),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withServices(PRODUCTS_DATABASE_SERVICE)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
