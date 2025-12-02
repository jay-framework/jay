//@ts-ignore
import { DB, AUTH } from './services?jay-server';
//@ts-ignore
import { loadParams } from './loaders?jay-server';
//@ts-ignore
import { renderSlow, renderFast } from './renderers?jay-server';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
export const page = makeJayStackComponent()
    .withProps()
    .withServices(DB, AUTH)
    .withLoadParams(loadParams)
    .withSlowlyRender(renderSlow)
    .withFastRender(renderFast);
