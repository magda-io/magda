import {
    DistributionContractAspect,
    DistributionContractProvenance,
    DistributionContractProvenanceAware
} from "./model.js";
import {
    getEffectiveProvenance as getEffectiveProvenanceGeneric,
    hasProvenanceStatement as hasProvenanceStatementGeneric,
    isAdvisoryProvenance as isAdvisoryProvenanceGeneric,
    isProtectedProvenance as isProtectedProvenanceGeneric
} from "../data-understanding/provenance.js";

// Same rules as `data-dictionary` (shared implementation in
// `../data-understanding/provenance.ts`), typed for the contract model.

/**
 * Whether a provenance object states an origin (`method`) or review state
 * (`reviewStatus`). Only such objects override inherited provenance: an empty
 * or detail-only object (e.g. `{}` or `{ "generator": "x" }`) must not mask the
 * parent's provenance, or human-owned metadata could lose its protection.
 */
export function hasProvenanceStatement(
    provenance: unknown
): provenance is DistributionContractProvenance {
    return hasProvenanceStatementGeneric(provenance);
}

/**
 * Resolve the effective provenance of a contract node (or of one of its
 * properties).
 *
 * `nodes` is the ancestor chain below the contract, outermost first, e.g.
 * `[operation]` or `[operation, parameter]`.
 *
 * Resolution is "nearest wins" without merging:
 *
 * 1. `node.propertyProvenance[property]` of the innermost node (when `property`
 *    is given);
 * 2. the nearest `provenance` on the node chain (parameter, then operation);
 * 3. the contract-level `provenance`.
 *
 * At each step, only provenance that states a `method` or `reviewStatus`
 * counts (see `hasProvenanceStatement`); anything else is skipped.
 *
 * Returns `undefined` when no provenance is recorded anywhere.
 */
export function getEffectiveProvenance(
    contract: Pick<DistributionContractAspect, "provenance"> | undefined,
    nodes: Array<DistributionContractProvenanceAware | undefined> = [],
    property?: string
): DistributionContractProvenance | undefined {
    return getEffectiveProvenanceGeneric(contract, nodes, property);
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
    provenance: DistributionContractProvenance | undefined
): boolean {
    return isProtectedProvenanceGeneric(provenance);
}

/**
 * Whether metadata with this provenance should be treated as advisory rather
 * than authoritative: inferred, agent-generated, unknown origin, or rejected,
 * unless it has since been reviewed/approved.
 */
export function isAdvisoryProvenance(
    provenance: DistributionContractProvenance | undefined
): boolean {
    return isAdvisoryProvenanceGeneric(provenance);
}
