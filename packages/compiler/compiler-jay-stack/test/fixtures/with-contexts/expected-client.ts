//@ts-ignore
import { ThemeContext, UserContext } from './contexts?jay-client';
//@ts-ignore
import { Component } from './component?jay-client';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
export const page = makeJayStackComponent()
    .withProps()
    .withContexts(ThemeContext, UserContext)
    .withInteractive(Component);
