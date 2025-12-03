//@ts-ignore
import { DATABASE } from './database';
//@ts-ignore
import { loadParams } from './loaders';
//@ts-ignore
import { renderSlowly, renderFast } from './renderers';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
export const page = makeJayStackComponent()
    .withProps()
    .withServices(DATABASE)
    .withLoadParams(loadParams)
    .withSlowlyRender(renderSlowly)
    .withFastRender(renderFast);
