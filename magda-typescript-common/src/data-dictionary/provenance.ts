import {
    DataDictionaryAspect,
    DataDictionaryProvenance,
    DataDictionaryProvenanceAware
} from "./model.js";

/**
 * Resolve the effective provenance of a node (or of one of its properties).
 *
 * `nodes` is the ancestor chain below the dictionary, outermost first, e.g.
 * `[entity, field]`, `[entity, dimension]` or `[relationship]`.
 *
 * Resolution is "nearest wins" without merging:
 *
 * 1. `node.propertyProvenance[property]` of the innermost node (when `property`
 *    is given);
 * 2. the nearest `provenance` on the node chain (innermost first);
 * 3. the dictionary-level `provenance`.
 *
 * Returns `undefined` when no provenance is recorded anywhere.
 */
export function getEffectiveProvenance(
    dictionary: Pick<DataDictionaryAspect, "provenance"> | undefined,
    nodes: Array<DataDictionaryProvenanceAware | undefined> = [],
    property?: string
): DataDictionaryProvenance | undefined {
    const chain = nodes.filter((node) => !!node);
    const innermost = chain.length ? chain[chain.length - 1] : undefined;
    if (property && innermost?.propertyProvenance) {
        const propProvenance = innermost.propertyProvenance[property];
        if (propProvenance && typeof propProvenance === "object") {
            return propProvenance;
        }
    }
    for (let i = chain.length - 1; i >= 0; i--) {
        if (chain[i].provenance && typeof chain[i].provenance === "object") {
            return chain[i].provenance;
        }
    }
    return dictionary?.provenance;
}

/**
 * Whether metadata with this provenance is human-authored or human-reviewed and
 * so must not be overwritten by an automatic producer (e.g. on re-harvest)
 * without explicit review.
 *
 * Protected: `method: "manual"`, or `reviewStatus` of `reviewed` /
 * `custodian-approved`. A `rejected` review status is never protected.
 */
export function isProtectedProvenance(
    provenance: DataDictionaryProvenance | undefined
): boolean {
    if (!provenance) {
        return false;
    }
    if (provenance.reviewStatus === "rejected") {
        return false;
    }
    return (
        provenance.method === "manual" ||
        provenance.reviewStatus === "reviewed" ||
        provenance.reviewStatus === "custodian-approved"
    );
}

/**
 * Whether metadata with this provenance should be treated as advisory rather
 * than authoritative: inferred, agent-generated, unknown origin, or rejected,
 * unless it has since been reviewed/approved.
 */
export function isAdvisoryProvenance(
    provenance: DataDictionaryProvenance | undefined
): boolean {
    if (!provenance) {
        return true;
    }
    if (provenance.reviewStatus === "rejected") {
        return true;
    }
    if (
        provenance.reviewStatus === "reviewed" ||
        provenance.reviewStatus === "custodian-approved"
    ) {
        return false;
    }
    return !(
        provenance.method === "authoritative-import" ||
        provenance.method === "harvested" ||
        provenance.method === "manual"
    );
}
