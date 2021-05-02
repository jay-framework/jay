import { JayElement } from 'jay-runtime';

interface O1 {
  s2: string;
  n2: number;
}

interface A1 {
  s3: string;
  n3: number;
}

interface ViewState {
  s1: string;
  n1: number;
  b1: boolean;
  o1: O1;
  a1: Array<A1>;
}

export declare function render(viewState: ViewState): JayElement<ViewState>;
