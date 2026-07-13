import { MagdaClient } from "./client.js";
import { registryRecord, recordsAspect } from "./endpoints.js";
import { OutputMode, printData, note } from "./output.js";

export type PublishState = "published" | "draft";

export interface AffectedRecord {
    id: string;
    type: "dataset" | "distribution";
    state: PublishState;
}

// Report each affected record and its new state, honouring the output contract
// (data -> stdout, summary -> stderr). Shared by the dataset and dist commands.
export function renderPublishResult(
    records: AffectedRecord[],
    mode: OutputMode
): void {
    const state = records[0].state;
    if (mode === "human") {
        for (const r of records) {
            process.stdout.write(`${r.type.padEnd(13)}${r.id}\t${r.state}\n`);
        }
        const verb = state === "published" ? "Published" : "Unpublished";
        if (records[0].type === "dataset") {
            const distCount = records.length - 1;
            note(
                `${verb} dataset ${records[0].id}` +
                    (distCount ? ` and ${distCount} distribution(s).` : `.`)
            );
        } else {
            note(`${verb} distribution ${records[0].id}.`);
        }
    } else {
        printData(mode, { state, records });
    }
}

// Set the `publishing` aspect's `state` across a list of records in a single
// transactional bulk request. ?merge=true deep-merges { state } into the
// existing aspect (preserving other publishing fields) and upserts if absent.
export async function setPublishingState(
    client: MagdaClient,
    recordIds: string[],
    state: PublishState
): Promise<void> {
    await client.json("PUT", recordsAspect("publishing"), {
        query: { merge: true },
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordIds, data: { state } })
    });
}

// Read a dataset's distribution ids from its dataset-distributions aspect.
// Array elements may be id strings or dereferenced records ({ id }).
export async function getDistributionIds(
    client: MagdaClient,
    datasetId: string
): Promise<string[]> {
    const record = await client.json<any>("GET", registryRecord(datasetId), {
        query: [["optionalAspect", "dataset-distributions"]]
    });
    const distributions: unknown[] =
        record.aspects?.["dataset-distributions"]?.distributions ?? [];
    return distributions.map((d) =>
        typeof d === "string" ? d : (d as { id: string }).id
    );
}

export async function publishDataset(
    client: MagdaClient,
    datasetId: string,
    opts: { state: PublishState; withoutDistributions: boolean }
): Promise<AffectedRecord[]> {
    const distIds = opts.withoutDistributions
        ? []
        : await getDistributionIds(client, datasetId);
    const recordIds = [datasetId, ...distIds];
    await setPublishingState(client, recordIds, opts.state);
    return recordIds.map((id, i) => ({
        id,
        type: i === 0 ? "dataset" : "distribution",
        state: opts.state
    }));
}

export async function publishDistribution(
    client: MagdaClient,
    distId: string,
    state: PublishState
): Promise<AffectedRecord[]> {
    await setPublishingState(client, [distId], state);
    return [{ id: distId, type: "distribution", state }];
}
