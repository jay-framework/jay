import {makeJayStackComponent, partialRender} from '@jay-framework/fullstack-component';
//@ts-ignore
import { DATABASE } from './database';

async function renderSlowly(props: any, database: DATABASE) {
    const data = await database.query('SELECT * FROM products');
    return partialRender({ products: data }, {});
}

function InteractiveComponent(props: any, refs: any) {
    return {
        render: () => ({ count: 42 }),
    };
}

export const myComponent = makeJayStackComponent()
    .withProps()
    .withServices(DATABASE)
    .withSlowlyRender(renderSlowly)
    .withInteractive(InteractiveComponent);

