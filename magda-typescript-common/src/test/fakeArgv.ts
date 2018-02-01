import { Arguments } from "yargs";

export default function fakeArgv(options: {
    internalUrl?: string;
    registryUrl?: string;
    jwtSecret?: string;
    userId?: string;
    listenPort?: number;
    dbHost?: string;
    dbPort?: number;
}): Arguments {
    return {
        ...options,
        $0: "",
        _: []
    };
}
