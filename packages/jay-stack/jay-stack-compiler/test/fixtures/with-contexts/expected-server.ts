import { DB, AUTH } from './services';
import { loadParams } from './loaders';
import { renderSlow, renderFast } from './renderers';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
export const page = makeJayStackComponent()
    .withProps()
    .withServices(DB, AUTH)
    .withLoadParams(loadParams)
    .withSlowlyRender(renderSlow)
    .withFastRender(renderFast);


