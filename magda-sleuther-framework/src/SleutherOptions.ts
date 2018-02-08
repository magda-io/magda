import * as express from "express";

import { SleutherArguments } from "./commonYargs";
import {
    Record,
    AspectDefinition
} from "@magda/typescript-common/dist/generated/registry/api";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

export default class SleutherOptions {
    argv: SleutherArguments;
    id: string;
    aspects: string[];
    optionalAspects: string[];
    writeAspectDefs: AspectDefinition[];
    async?: boolean;
    onRecordFound: (record: Record, registry: Registry) => Promise<void>;
    express?: () => express.Express;
    maxRetries?: number;
    concurrency?: number;
}
