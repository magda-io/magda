import { MinionArguments } from "../commonYargs";

export default function fakeArgv(options: {
    internalUrl: string;
    registryUrl: string;
    jwtSecret: string;
    userId: string;
    listenPort: number;
}): MinionArguments {
    return {
        ...options,
        $0: "",
        _: []
    };
}
