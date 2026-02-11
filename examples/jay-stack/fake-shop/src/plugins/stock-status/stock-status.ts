import { makeJayStackComponent, RenderPipeline, Signals } from '@jay-framework/fullstack-component';
import {
    StockStatusContract,
    StockStatusRefs,
    StockStatusFastViewState,
} from './stock-status.jay-contract';
import { createSignal, Props } from '@jay-framework/component';
import { INVENTORY_SERVICE, InventoryService } from '../../inventory-service';

export interface StockStatusProps {
    productId: string;
}

interface StockCarryForward {
    productId: string;
}

// No .withSlowlyRender() → this is a fast-only component!
// Safe to use inside interactive forEach.
// Because there's no slow phase, fastRender receives (props, ...services) directly —
// no carryForward parameter (carryForward is only injected when withSlowlyRender is used).
export const stockStatus = makeJayStackComponent<StockStatusContract>()
    .withProps<StockStatusProps>()
    .withServices(INVENTORY_SERVICE)
    .withFastRender(async (props: StockStatusProps, inventoryService: InventoryService) => {
        const Pipeline = RenderPipeline.for<StockStatusFastViewState, StockCarryForward>();
        const units = await inventoryService.getAvailableUnits(props.productId);
        const inStock = units > 0;

        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { units, inStock },
            carryForward: { productId: props.productId },
        }));
    })
    .withInteractive(
        (
            props: Props<StockStatusProps>,
            refs: StockStatusRefs,
            fastViewState: Signals<StockStatusFastViewState>,
            carryForward: StockCarryForward,
        ) => {
            const [units, setUnits] = fastViewState.units;
            const [inStock, setInStock] = fastViewState.inStock;

            refs.refreshButton.onclick(() => {
                // In a real app, this would re-fetch from the server
                console.log(`Refreshing stock for product ${carryForward.productId}`);
            });

            return {
                render: () => ({
                    units,
                    inStock,
                }),
            };
        },
    );
