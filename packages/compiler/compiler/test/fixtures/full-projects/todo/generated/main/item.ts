// @ts-expect-error Cannot find module
import { render } from './item.jay-html?jay-mainSandbox';
import { makeJayComponentBridge, FunctionsRepository } from 'jay-secure';
import { JayEvent } from 'jay-runtime';
interface ItemProps {
    title: string;
    isCompleted: boolean;
}
const ESCAPE_KEY = 27;
const ENTER_KEY = 13;
const funcRepository: FunctionsRepository = {
    // @ts-ignore
    '0': ({ event }: JayEvent<any, any>) => ({ $0: event.target.value }),
    '1': ({ event }: JayEvent<any, any>) => {
        if (event.which === ESCAPE_KEY) {
        } else if (event.which === ENTER_KEY) {
        }
        return { $0: event.which };
    },
};
export const Item = makeJayComponentBridge(render, { funcRepository });
