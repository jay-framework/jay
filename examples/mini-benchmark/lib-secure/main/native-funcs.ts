import { FunctionsRepository } from 'jay-secure';

export const funcRepository: FunctionsRepository = {
    '1': ({ event }) => (event.target as HTMLSelectElement).selectedIndex,
    '2': ({ event }) => (event.target as HTMLInputElement).value,
    '3': () => new Promise((resolve) => requestAnimationFrame(resolve)),
};
