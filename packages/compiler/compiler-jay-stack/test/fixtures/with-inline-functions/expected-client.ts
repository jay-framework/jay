import { makeJayStackComponent } from '@jay-framework/fullstack-component';
export const page = makeJayStackComponent()
    .withProps()
    .withInteractive((props, refs) => {
        return {
            render: () => ({ count: 42 }),
        };
    });

