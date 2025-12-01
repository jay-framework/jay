//@ts-ignore
import { ThemeContext, UserContext } from './contexts';
//@ts-ignore
import { Component } from './component';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
export const page = makeJayStackComponent()
    .withProps()
    .withContexts(ThemeContext, UserContext)
    .withInteractive(Component);

