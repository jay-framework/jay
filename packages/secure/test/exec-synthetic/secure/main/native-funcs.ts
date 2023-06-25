import {FunctionsRepository} from "../../../../lib";

export const funcRepository: FunctionsRepository = {
    "1": (elem, viewState) => {
        return elem.innerHTML;
    },
    "2": () => {
        return document.title;
    },
    "3": (elem, viewState) => {
        return elem.innerHTML;
    }
}