
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
])

export function getAvailableUnits(productId: string): Promise<number> {
    return Promise.resolve(availabilityMap[productId])
}