import { makeJayInit } from '@jay-framework/fullstack-component';

export const init = makeJayInit()
    .withServer(async () => {
        return { shopName: 'Test Shop' };
    });
