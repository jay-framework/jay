//@ts-ignore
import { DATABASE } from './database';
import { makeJayStackComponent, partialRender } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps()
    .withServices(DATABASE)
    .withSlowlyRender(async (props, database: DATABASE) => {
        const data = await database.query('SELECT * FROM users');
        return partialRender({ users: data }, {});
    })
    .withInteractive((props, refs) => {
        return {
            render: () => ({ count: 42 }),
        };
    });

