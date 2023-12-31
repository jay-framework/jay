import { render } from './main.jay-html';
import {FunctionsRepository, makeJayComponentBridge} from 'jay-secure';

export interface MainProps {}

export const funcRepository: FunctionsRepository = {
    '1': ({ event }) => (event.target as HTMLSelectElement).selectedIndex,
    '2': ({ event }) => (event.target as HTMLInputElement).value,
};

export const Main = makeJayComponentBridge(render, { funcRepository });
