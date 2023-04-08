import {FunctionsRepository} from "../../../../lib/main/function-repository-types";

export const funcRepository: FunctionsRepository = {
    "1": ({event: Event}) => (event.target as HTMLInputElement).value,
    "2": ({event: Event}) => (event.target as HTMLInputElement).value
}