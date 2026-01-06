import { makeJayInit } from '@jay-framework/fullstack-component';
import { createJayContext, registerGlobalContext } from '@jay-framework/runtime';
interface MyPluginConfig {
    apiUrl: string;
    featureEnabled: boolean;
}
const CONFIG_CONTEXT = createJayContext<MyPluginConfig>();
export const init = makeJayInit().withClient((data) => {
    // Client-only code
    registerGlobalContext(CONFIG_CONTEXT, {
        apiUrl: data.apiUrl,
        featureEnabled: data.featureEnabled,
    });
});
