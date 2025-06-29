import { JayContract } from '@jay-framework/runtime';
import {
    CounterViewState,
    CounterRefs,
    CounterRepeatedRefs,
} from '../counter/counter.jay-contract';

export interface NamedContractViewState {
    title: string;
    counter: CounterViewState;
}

export interface NamedContractRefs {
    counter: CounterRefs;
}

export interface NamedContractRepeatedRefs {
    counter: CounterRepeatedRefs;
}

export type NamedContractContract = JayContract<NamedContractViewState, NamedContractRefs>;
