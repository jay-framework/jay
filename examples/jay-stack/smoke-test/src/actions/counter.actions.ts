import { makeJayAction, makeJayQuery } from '@jay-framework/fullstack-component';
import { COUNTER_SERVICE, type CounterService } from '../counter-service';

export const getCount = makeJayQuery('counter.getCount')
    .withServices(COUNTER_SERVICE)
    .withHandler(async (_input: {}, counter: CounterService) => {
        return { count: counter.getCount() };
    });

export const increment = makeJayAction('counter.increment')
    .withServices(COUNTER_SERVICE)
    .withHandler(async (_input: {}, counter: CounterService) => {
        const newCount = counter.increment();
        return { count: newCount };
    });
