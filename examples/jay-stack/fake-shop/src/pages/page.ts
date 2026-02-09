import {
    makeJayStackComponent,
    PageProps,
    phaseOutput,
    RenderPipeline,
    Signals,
} from '@jay-framework/fullstack-component';
import {
    PageElementRefs,
    PageContract,
    PageSlowViewState,
    PageFastViewState,
} from './page.jay-html';
import { Props } from '@jay-framework/component';
import { PRODUCTS_DATABASE_SERVICE, ProductsDatabaseService } from '../products-database';

interface HomePageCarryForward {}

async function renderSlowlyChanging(props: PageProps, productsDb: ProductsDatabaseService) {
    // Featured products: first 3 products, pre-rendered at build time
    const products = await productsDb.getProducts();
    const featured = products.slice(0, 3).map((p) => ({ _id: p.id }));

    return phaseOutput<PageSlowViewState, HomePageCarryForward>({ featuredProducts: featured }, {});
}

async function renderFastChanging(
    props: PageProps,
    carryForward: HomePageCarryForward,
    productsDb: ProductsDatabaseService,
) {
    const Pipeline = RenderPipeline.for<PageFastViewState, HomePageCarryForward>();
    const products = await productsDb.getProducts();
    const allProducts = products.map((p) => ({ _id: p.id }));

    return Pipeline.ok({}).toPhaseOutput(() => ({
        viewState: { allProducts },
        carryForward: {},
    }));
}

function homePageConstructor(
    props: Props<PageProps>,
    refs: PageElementRefs,
    fastViewState: Signals<PageFastViewState>,
    carryForward: HomePageCarryForward,
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
    .withInteractive(homePageConstructor);
