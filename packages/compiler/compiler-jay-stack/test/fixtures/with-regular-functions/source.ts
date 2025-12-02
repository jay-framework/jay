//@ts-ignore
import { DATABASE } from './database';
import { makeJayStackComponent, partialRender } from '@jay-framework/fullstack-component';

async function renderSlowly(props, database) {
    const data = await database.query('SELECT * FROM users');
    return partialRender({ users: data }, {});
}

function InteractiveComponent(props, refs) {
    return {
        render: () => ({ count: 42 }),
    };
}

export const page = makeJayStackComponent()
    .withProps()
    .withServices(DATABASE)
    .withSlowlyRender(renderSlowly)
    .withInteractive(InteractiveComponent);

export const otherPage = makeJayStackComponent()
    .withProps()
    .withServices(DATABASE)
    .withSlowlyRender(renderSlowly);
