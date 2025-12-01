//@ts-ignore
import { DB, AUTH } from './services';
//@ts-ignore
import { loadParams } from './loaders';
//@ts-ignore
import { renderSlow, renderFast } from './renderers';
//@ts-ignore
import { ThemeContext, UserContext } from './contexts';
//@ts-ignore
import { Component } from './component';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps()
    .withServices(DB, AUTH)
    .withContexts(ThemeContext, UserContext)
    .withLoadParams(loadParams)
    .withSlowlyRender(renderSlow)
    .withFastRender(renderFast)
    .withInteractive(Component);

