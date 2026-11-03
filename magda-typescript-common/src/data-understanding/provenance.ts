/**
 * Provenance semantics shared by the Data Understanding aspects
 * (`data-dictionary`, `distribution-contract`, ...).
 *
 * Design: `docs/design/data-understanding-layer-design.md`
 *
 * Each aspect has its own typed provenance model (e.g. `DataDictionaryProvenance`,
 * `DistributionContractProvenance`); these helpers implement the common rules
 * over the properties every model shares.
 */

/** An open vocabulary: the listed values are documented, any other string is permitted. */
export type OpenVocabulary<T extends string> = T | (string & {});

export type ProvenanceMethod = OpenVocabulary<
    | "authoritative-import"
    | "harvested"
    | "inferred"
    | "manual"
    | "agent-generated"
>;

export type ProvenanceReviewStatus = OpenVocabulary<
    "unreviewed" | "reviewed" | "custodian-approved" | "rejected"
>;

/** The provenance properties every Data Understanding aspect shares. */
export interface DataUnderstandingProvenance {
    method?: ProvenanceMethod;
    reviewStatus?: ProvenanceReviewStatus;
    [key: string]: unknown;
}

/** A node that can carry its own (and property-level) provenance. */
export interface ProvenanceAware<
    P extends DataUnderstandingProvenance = DataUnderstandingProvenance
> {
    provenance?: P;
    propertyProvenance?: { [propertyName: string]: P };
}

/**
 * Whether a provenance object states an origin (`method`) or review state
 * (`reviewStatus`). Only such objects override inherited provenance: an empty
 * or detail-only object (e.g. `{}` or `{ "generator": "x" }`) must not mask the
 * parent's provenance, or human-owned metadata could lose its protection.
 */
export function hasProvenanceStatement(
    provenance: unknown
): provenance is DataUnderstandingProvenance {
    if (
        typeof provenance !== "object" ||
        provenance === null ||
        Array.isArray(provenance)
    ) {
        return false;
    }
    const { method, reviewStatus } = provenance as DataUnderstandingProvenance;
    return (
        (typeof method === "string" && method.length > 0) ||
        (typeof reviewStatus === "string" && reviewStatus.length > 0)
    );
}

/**
 * Resolve the effective provenance of a node (or of one of its properties).
 *
 * `root` is the aspect (whose `provenance` is the default); `nodes` is the
 * ancestor chain below it, outermost first, e.g. `[entity, field]` or
 * `[operation, parameter]`.
 *
 * Resolution is "nearest wins" without merging:
 *
 * 1. `node.propertyProvenance[property]` of the innermost node (when `property`
 *    is given);
 * 2. the nearest `provenance` on the node chain (innermost first);
 * 3. the aspect-level `provenance`.
 *
 * At each step, only provenance that states a `method` or `reviewStatus`
 * counts (see `hasProvenanceStatement`); anything else is skipped.
 *
 * Returns `undefined` when no provenance is recorded anywhere.
 */
export function getEffectiveProvenance<P extends DataUnderstandingProvenance>(
    root: { provenance?: P } | undefined,
    nodes: Array<ProvenanceAware<P> | undefined> = [],
    property?: string
): P | undefined {
    const chain = nodes.filter((node) => !!node);
    const innermost = chain.length ? chain[chain.length - 1] : undefined;
    if (property && innermost?.propertyProvenance) {
        const propProvenance = innermost.propertyProvenance[property];
        if (hasProvenanceStatement(propProvenance)) {
            return propProvenance;
        }
    }
    for (let i = chain.length - 1; i >= 0; i--) {
        if (hasProvenanceStatement(chain[i].provenance)) {
            return chain[i].provenance;
        }
    }
    return hasProvenanceStatement(root?.provenance)
        ? root.provenance
        : undefined;
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
    provenance: DataUnderstandingProvenance | undefined
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
    provenance: DataUnderstandingProvenance | undefined
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
