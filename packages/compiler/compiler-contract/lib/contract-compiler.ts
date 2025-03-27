import {WithValidations} from "jay-compiler-shared";
import {Contract} from "./contract";


export function compileContract(contract: WithValidations<Contract>): WithValidations<string> {
    return new WithValidations<string>("")
}