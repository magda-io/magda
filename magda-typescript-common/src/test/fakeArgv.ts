import { Arguments } from "yargs";

export default function fakeArgv(options: any): Arguments {
    return {
        ...options,
        $0: "",
        _: []
    };
}
