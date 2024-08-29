import {
    JayComponent,
    EventEmitter,
    ComponentCollectionProxy,
    EventTypeFrom,
    PropsFrom,
    ViewStateFrom,
    ElementFrom,
} from 'jay-runtime';
import { Parent } from './parent';

export type ParentComponentType<ParentVS> = ReturnType<typeof Parent<ParentVS>>;

export interface ParentRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, ParentRef<ParentVS>> {}
