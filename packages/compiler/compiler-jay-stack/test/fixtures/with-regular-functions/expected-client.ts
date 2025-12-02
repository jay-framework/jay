import { makeJayStackComponent } from '@jay-framework/fullstack-component';
function InteractiveComponent(props, refs) {
    return {
        render: () => ({ count: 42 }),
    };
}
export const page = makeJayStackComponent().withProps().withInteractive(InteractiveComponent);
export const otherPage = makeJayStackComponent().withProps();
