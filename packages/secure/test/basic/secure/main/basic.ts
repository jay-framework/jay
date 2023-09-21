import { render } from './basic.jay.html';
import { makeJayComponentBridge } from '../../../../lib';

export interface BasicProps {
    firstName: string;
    lastName: string;
}

export const Basic = makeJayComponentBridge(render);
