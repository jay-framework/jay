import { render } from './comp.jay-html';
import { makeJayComponentBridge } from '../../../../lib/main/main-bridge';
import { funcRepository } from './native-funcs';

export interface CompProps {}

export const Comp = makeJayComponentBridge(render, { funcRepository });
