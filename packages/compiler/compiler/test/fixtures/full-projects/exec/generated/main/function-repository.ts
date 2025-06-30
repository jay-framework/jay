import { FunctionsRepository } from '@jay-framework/secure';

export const funcRepository: FunctionsRepository = {
    '0': () => new Promise((resolve) => requestAnimationFrame(resolve)),
    '1': () => new Promise((resolve) => requestAnimationFrame(resolve)),
};
