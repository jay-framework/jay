import { createJayService } from '@jay-framework/stack-server-runtime';

export interface InventoryService {
    getAvailableUnits(productId: string): Promise<number>;
    isInStock(productId: string): Promise<boolean>;
}

export const INVENTORY_SERVICE = createJayService<InventoryService>('Inventory');

const availabilityMap = new Map([
    ['1', 1],
    ['2', 0],
    ['3', 12],
    ['4', 13],
    ['5', 0],
    ['6', 2],
    ['7', 3],
    ['8', 4],
    ['9', 0],
    ['10', 0],
]);

export function createInventoryService(): InventoryService {
    return {
        async getAvailableUnits(productId: string) {
            return availabilityMap.get(productId) ?? 0;
        },
        
        async isInStock(productId: string) {
            const units = await this.getAvailableUnits(productId);
            return units > 0;
        },
    };
}
