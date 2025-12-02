import { DATABASE } from './database';
import { makeJayStackComponent, partialRender } from '@jay-framework/fullstack-component';
async function renderSlowly(props, database) {
    const data = await database.query('SELECT * FROM users');
    return partialRender({ users: data }, {});
}
export const page = makeJayStackComponent()
    .withProps()
    .withServices(DATABASE)
    .withSlowlyRender(renderSlowly);
export const otherPage = makeJayStackComponent()
    .withProps()
    .withServices(DATABASE)
    .withSlowlyRender(renderSlowly);


