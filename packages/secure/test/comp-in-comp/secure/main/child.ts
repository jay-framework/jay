import { render } from './child.jay.html';
import { makeJayComponentBridge } from '../../../../lib';

export interface ChildProps {
    textFromParent: string;
    id: string;
}

export const Child = makeJayComponentBridge(render);
