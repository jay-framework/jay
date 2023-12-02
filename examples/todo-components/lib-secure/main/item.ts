import { render } from './item.jay-html';
import { makeJayComponentBridge } from 'jay-secure';
import { funcRepository } from './native-funcs';

export interface ItemProps {
    title: string;
    isCompleted: boolean;
}

export const Item = makeJayComponentBridge(render, { funcRepository });
