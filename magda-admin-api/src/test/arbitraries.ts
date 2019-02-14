import * as _ from "lodash";

import jsc from "@magda/typescript-common/dist/test/jsverify";
import {
    stringArb,
    dateStringArb,
    arbFlatMap
} from "@magda/typescript-common/dist/test/arbitraries";

export const configArb = jsc.record({
    type: stringArb,
    name: stringArb,
    sourceUrl: stringArb
});

const statusArb = jsc.oneof([
    jsc.elements(["active", "failed", "succeeded"]),
    stringArb
]);

export const jobArb = jsc.record({
    startTime: dateStringArb,
    completionTime: dateStringArb,
    status: statusArb
});

const connectorIdArb = stringArb;

export interface ConfigState {
    type: string;
    name: string;
    sourceUrl: string;
}

export interface JobState {
    startTime: string;
    completionTime: string;
    status: string;
}

export interface ConnectorState {
    config: ConfigState;
    job: JobState;
}

export interface State {
    [connectorId: string]: ConnectorState;
}

export const stateArb: jsc.Arbitrary<State> = arbFlatMap(
    jsc.array(connectorIdArb),
    (connectorIds: string[]) => {
        const connectorStates = _(connectorIds)
            .map(connectorId => [
                connectorId,
                jsc.record({
                    config: jsc.oneof([configArb, jsc.constant(undefined)]),
                    job: jsc.oneof([jobArb, jsc.constant(undefined)])
                })
            ])
            .fromPairs()
            .value();

        if (connectorIds.length > 0) {
            return jsc.record(connectorStates);
        } else {
            return jsc.constant({} as _.Dictionary<any>);
        }
    },
    connectorStates => {
        return _.keys(connectorStates);
    }
);
