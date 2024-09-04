import { ComponentCollectionProxy } from 'jay-runtime';
import { Basic } from './basic';

export type BasicComponentType<ParentVS> = ReturnType<typeof Basic<ParentVS>>;

export interface BasicRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, BasicComponentType<ParentVS>> {}
