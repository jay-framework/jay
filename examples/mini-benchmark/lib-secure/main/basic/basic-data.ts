import { render as BasicRender } from './basic.jay.html';
import { makeJayComponentBridge } from 'jay-secure';

interface BasicProps {
    cycles: number;
}

export const Basic = makeJayComponentBridge(BasicRender);
