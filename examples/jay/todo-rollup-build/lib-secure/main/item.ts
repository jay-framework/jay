import { render } from './item.jay-html';
import { FunctionsRepository, makeJayComponentBridge } from '@jay-framework/secure';
import { JayEvent } from '@jay-framework/runtime';

export interface ItemProps {
    title: string;
    isCompleted: boolean;
}

export const funcRepository: FunctionsRepository = {
    '1': ({ event }: JayEvent<Event, any>) => (event.target as HTMLInputElement).value,
    '2': ({ event }: JayEvent<KeyboardEvent, any>) => event.which,
};
export const Item = makeJayComponentBridge(render, { funcRepository });
