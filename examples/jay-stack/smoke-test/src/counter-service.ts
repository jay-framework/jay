import { createJayService } from '@jay-framework/fullstack-component';

export interface CounterService {
    getCount(): number;
    increment(): number;
}

export const COUNTER_SERVICE = createJayService<CounterService>('Counter');

export function createCounterService(): CounterService {
    let count = 0;
    return {
        getCount: () => count,
        increment: () => ++count,
    };
}
