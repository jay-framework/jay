import {render} from './collections.jay.html';
import {makeJayComponentBridge} from "jay-secure";

interface CollectionsProps {
    cycles: number
}

export const Collections = makeJayComponentBridge(render);