import { MinionArguments } from "../commonYargs";

export default function fakeArgv(options: {
    internalUrl: string;
    registryUrl: string;
    enableMultiTenant: boolean;
    tenantUrl: string;
    jwtSecret: string;
    userId: string;
    listenPort: number;
    crawlerRecordFetchNumber?: number;
}): MinionArguments {
    return {
        ...options,
        retries: 0
    };
}
