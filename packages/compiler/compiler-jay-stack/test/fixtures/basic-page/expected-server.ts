//@ts-ignore
import { DATABASE } from './database?jay-server';
//@ts-ignore
import { loadParams } from './loaders?jay-server';
//@ts-ignore
import { renderSlowly, renderFast } from './renderers?jay-server';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
export const page = makeJayStackComponent()
    .withProps()
    .withServices(DATABASE)
    .withLoadParams(loadParams)
    .withSlowlyRender(renderSlowly)
    .withFastRender(renderFast);
