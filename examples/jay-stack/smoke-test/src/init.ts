import { makeJayInit } from '@jay-framework/fullstack-component';
import { registerService, onShutdown } from '@jay-framework/stack-server-runtime';
import { COUNTER_SERVICE, createCounterService } from './counter-service';

export const init = makeJayInit()
    .withServer(async () => {
        const counter = createCounterService();
        registerService(COUNTER_SERVICE, counter);
        onShutdown(async () => {});
        return {};
    })
    .withClient(() => {});
