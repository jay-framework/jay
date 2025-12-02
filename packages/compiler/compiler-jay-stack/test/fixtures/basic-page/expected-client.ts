//@ts-ignore
import { InteractiveComponent } from './interactive';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
export const page = makeJayStackComponent().withProps().withInteractive(InteractiveComponent);
