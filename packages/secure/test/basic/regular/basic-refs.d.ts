import {
    JayComponent,
    EventEmitter,
    ComponentCollectionProxy,
    EventTypeFrom,
    PropsFrom,
    ViewStateFrom,
    ElementFrom,
} from 'jay-runtime';
import { Basic } from './basic';

export type BasicComponentType = ReturnType<typeof Basic>;

export interface BasicRef<ParentVS>
    extends JayComponent<
        PropsFrom<BasicComponentType>,
        ViewStateFrom<BasicComponentType>,
        ElementFrom<BasicComponentType>
    > {}

export interface BasicRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, BasicRef<ParentVS>> {}
