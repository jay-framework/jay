import { makeJayInit } from '@jay-framework/fullstack-component';
import { createJayContext, registerGlobalContext } from '@jay-framework/runtime';

export const SHOP_CONFIG = createJayContext<{ shopName: string }>('shop-config');

export const init = makeJayInit()
    .withServer(async () => {
        return { shopName: 'Test Shop' };
    })
    .withClient((data: { shopName: string }) => {
        registerGlobalContext(SHOP_CONFIG, data);
    });
