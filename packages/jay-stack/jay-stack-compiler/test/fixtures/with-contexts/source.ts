import { DB, AUTH } from './services';
import { loadParams } from './loaders';
import { renderSlow, renderFast } from './renderers';
import { ThemeContext, UserContext } from './contexts';
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
