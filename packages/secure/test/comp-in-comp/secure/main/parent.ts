import { render } from './parent.jay-html';
import { makeJayComponentBridge } from '../../../../lib';

export interface ParentProps {}

export const Parent = makeJayComponentBridge(render);
