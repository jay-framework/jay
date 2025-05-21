import { makeJayComponent } from 'jay-component';
import { render } from './headless-component.jay-contract';

export const headless = makeJayComponent(render, (props, refs) => ({
    render: () => ({
        content: 'This is from the headless component'
    })
})); 