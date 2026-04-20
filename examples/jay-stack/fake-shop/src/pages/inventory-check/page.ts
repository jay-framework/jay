import {
    makeJayStackComponent,
    PageProps,
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
import { createSignal } from '@jay-framework/component';
import { PRODUCTS_DATABASE_SERVICE, ProductsDatabaseService } from '../../products-database';
import { checkInventory, InventoryCheckResult } from '../../actions/inventory-check.actions';

interface InventoryCheckCarryForward {
    totalCount: number;
}

async function renderFastChanging(props: PageProps, productsDb: ProductsDatabaseService) {
    const Pipeline = RenderPipeline.for<PageFastViewState, InventoryCheckCarryForward>();
    const products = await productsDb.getProducts();

    return Pipeline.ok({}).toPhaseOutput(() => ({
        viewState: {
            totalCount: products.length,
            status: 'idle',
            checkedCount: 0,
            results: [],
        },
        carryForward: { totalCount: products.length },
    }));
}

function inventoryCheckConstructor(
    props: Props<PageProps>,
    refs: PageElementRefs,
    fastViewState: Signals<PageFastViewState>,
    carryForward: InventoryCheckCarryForward,
) {
    const [status, setStatus] = createSignal('idle');
    const [checkedCount, setCheckedCount] = createSignal(0);
    const [results, setResults] = createSignal<InventoryCheckResult[]>([]);

    refs.startCheck.onclick(async () => {
        setStatus('checking');
        setCheckedCount(0);
        setResults([]);

        for await (const result of checkInventory()) {
            setResults((prev) => [...prev, result]);
            setCheckedCount((prev) => prev + 1);
        }

        setStatus('done');
    });

    return {
        render: () => ({
            status,
            checkedCount,
            results,
        }),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withServices(PRODUCTS_DATABASE_SERVICE)
    .withFastRender(renderFastChanging)
    .withInteractive(inventoryCheckConstructor);
