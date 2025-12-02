import { DATABASE } from './database';
import { loadParams } from './loaders';
import { renderSlowly, renderFast } from './renderers';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
export const page = makeJayStackComponent()
    .withProps()
    .withServices(DATABASE)
    .withLoadParams(loadParams)
    .withSlowlyRender(renderSlowly)
    .withFastRender(renderFast);
