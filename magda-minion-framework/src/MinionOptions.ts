import * as express from "express";

import { MinionArguments } from "./commonYargs";
import {
    Record,
    AspectDefinition
} from "@magda/typescript-common/dist/generated/registry/api";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

export default class MinionOptions {
    argv: MinionArguments;
    id: string;
    aspects: string[];
    optionalAspects: string[];
    writeAspectDefs: AspectDefinition[];
    async?: boolean;
    onRecordFound: (record: Record, registry: Registry) => Promise<void>;
    express?: () => express.Express;
    maxRetries?: number;
    concurrency?: number;
    tenantId?: number;
}
