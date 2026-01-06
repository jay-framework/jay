import { makeJayInit } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { createDbService, DB_SERVICE } from './db-service';
export const init = makeJayInit().withServer(async () => {
    // Server-only code
    const db = await createDbService();
    registerService(DB_SERVICE, db);
    return {
        apiUrl: process.env.API_URL || '/api',
        featureEnabled: true,
    };
});
