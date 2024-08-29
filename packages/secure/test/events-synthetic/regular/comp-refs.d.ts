import {
    ComponentCollectionProxy,
} from 'jay-runtime';
import { Comp } from './comp';

export type CompComponentType<ParentVS> = ReturnType<typeof Comp<ParentVS>>;

export interface CompRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, CompRef<ParentVS>> {}
