import {
    JayComponent,
    EventEmitter,
    ComponentCollectionProxy,
    EventTypeFrom,
    PropsFrom,
    ViewStateFrom,
    ElementFrom,
} from 'jay-runtime';
import { Comp } from './comp';

export type CompComponentType = ReturnType<typeof Comp>;

export interface CompRef<ParentVS>
    extends JayComponent<
        PropsFrom<CompComponentType>,
        ViewStateFrom<CompComponentType>,
        ElementFrom<CompComponentType>
    > {}

export interface CompRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, CompRef<ParentVS>> {}
