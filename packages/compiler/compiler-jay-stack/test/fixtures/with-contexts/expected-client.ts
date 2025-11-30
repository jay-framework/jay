import { ThemeContext, UserContext } from './contexts';
import { Component } from './component';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
export const page = makeJayStackComponent()
    .withProps()
    .withContexts(ThemeContext, UserContext)
    .withInteractive(Component);

