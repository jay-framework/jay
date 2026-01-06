import { makeJayInit } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { createJayContext, registerGlobalContext } from '@jay-framework/runtime';
import { createDbService, DB_SERVICE } from './db-service';

interface MyPluginConfig {
    apiUrl: string;
    featureEnabled: boolean;
}

const CONFIG_CONTEXT = createJayContext<MyPluginConfig>();

export const init = makeJayInit()
    .withServer(async () => {
        // Server-only code
        const db = await createDbService();
        registerService(DB_SERVICE, db);

        return {
            apiUrl: process.env.API_URL || '/api',
            featureEnabled: true,
        };
    })
    .withClient((data) => {
        // Client-only code
        registerGlobalContext(CONFIG_CONTEXT, {
            apiUrl: data.apiUrl,
            featureEnabled: data.featureEnabled,
        });
    });
