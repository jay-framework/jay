const availabilityMap = new Map([
    ['LAP-001', 1],
    ['PHN-002', 0],
]);

export function getAvailableUnits(inventoryItemId: string): Promise<number> {
    return Promise.resolve(availabilityMap.get(inventoryItemId));
}
