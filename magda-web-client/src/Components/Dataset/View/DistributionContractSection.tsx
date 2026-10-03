import React, { FunctionComponent } from "react";
import {
    DistributionContractAspect,
    DistributionContractAuthentication,
    DistributionContractOperation,
    DistributionContractPagination,
    DistributionContractParameter,
    DistributionContractSourceCapabilities
} from "@magda/typescript-common/dist/distribution-contract/model.js";
import { getEffectiveProvenance } from "@magda/typescript-common/dist/distribution-contract/provenance.js";
import { DataDictionaryAspect } from "@magda/typescript-common/dist/data-dictionary/model.js";
import { ProvenanceBadge, displayValue, isUrl } from "./DataDictionarySection";
import "./DistributionContractSection.scss";

const MAX_DISPLAYED_VALUES = 10;

const RESOURCE_ROLE_LABELS: { [role: string]: string } = {
    download: "Downloadable file",
    "data-service": "Data service",
    "metadata-service": "Metadata service",
    "query-service": "Query service",
    stream: "Stream",
    other: "Other"
};

const ACCESS_MODE_LABELS: { [mode: string]: string } = {
    "public-download": "Public download",
    "public-query": "Public query",
    "authenticated-query": "Query with authentication",
    "query-only": "Query only (no bulk download)",
    restricted: "Restricted",
    "manual-request": "On request"
};

const AUTHENTICATION_TYPE_LABELS: { [type: string]: string } = {
    none: "None (public)",
    "api-key": "API key",
    "http-basic": "HTTP Basic authentication",
    "http-bearer": "Bearer token",
    oauth2: "OAuth 2.0",
    "openid-connect": "OpenID Connect",
    "mutual-tls": "Mutual TLS (client certificate)",
    "custodian-approval": "Custodian approval",
    other: "Other"
};

const SPECIFICATION_TYPE_LABELS: { [type: string]: string } = {
    openapi: "OpenAPI specification",
    "json-schema": "JSON Schema",
    "arcgis-service-definition": "ArcGIS service definition",
    "ogc-capabilities": "OGC capabilities document",
    "ogc-api": "OGC API definition",
    stac: "STAC metadata",
    other: "Native specification"
};

const PARAMETER_LOCATION_LABELS: { [location: string]: string } = {
    path: "path",
    query: "query",
    header: "header",
    cookie: "cookie"
};

const CAPABILITY_LABELS: { [key: string]: string } = {
    allowedMethods: "Methods",
    maximumRecordsPerRequest: "Max records per request",
    bulkExportAvailable: "Bulk export available",
    supportsPagination: "Pagination",
    supportsSpatialFilter: "Spatial filter",
    supportsTemporalFilter: "Temporal filter",
    supportsAttributeFilter: "Attribute filter",
    outputFormats: "Output formats",
    rateLimit: "Rate limit"
};

const PAGINATION_LABELS: Array<[
    keyof DistributionContractPagination,
    string
]> = [
    ["limitParameter", "page size parameter"],
    ["offsetParameter", "offset parameter"],
    ["pageParameter", "page number parameter"],
    ["cursorParameter", "cursor parameter"],
    ["nextCursorPath", "next cursor at"],
    ["nextLinkPath", "next page URL at"],
    ["nextLinkRelation", "next page link relation"],
    ["totalPath", "total count at"]
];

function label(labels: { [key: string]: string }, value: string): string {
    return Object.prototype.hasOwnProperty.call(labels, value)
        ? labels[value]
        : value;
}

/** `PascalCase`/`camelCase` capability keys as words, e.g. `supportsStatistics` → `supports statistics`. */
function humanizeKey(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[-_]+/g, " ")
        .toLowerCase();
}

function describeCapabilityValue(value: unknown): string {
    if (value === true) {
        return "yes";
    }
    if (value === false) {
        return "no";
    }
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        return value.join(", ");
    }
    return displayValue(value);
}

const ExternalLink: FunctionComponent<React.PropsWithChildren<{
    href?: string;
}>> = ({ href, children }) =>
    isUrl(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
        </a>
    ) : null;

const ValueList: FunctionComponent<{ values: unknown[] }> = ({ values }) => {
    const shown = values.slice(0, MAX_DISPLAYED_VALUES);
    return (
        <>
            {shown.map((value, idx) => (
                <React.Fragment key={idx}>
                    {idx ? ", " : ""}
                    <code>{displayValue(value)}</code>
                </React.Fragment>
            ))}
            {values.length > shown.length
                ? ` (+${values.length - shown.length} more)`
                : ""}
        </>
    );
};

const Authentication: FunctionComponent<{
    authentication: DistributionContractAuthentication;
}> = ({ authentication }) => {
    const parts: React.ReactNode[] = [];
    if (authentication.type) {
        parts.push(
            <strong key="type">
                {label(AUTHENTICATION_TYPE_LABELS, authentication.type)}
            </strong>
        );
    }
    if (authentication.scheme) {
        parts.push(
            <span key="scheme">
                scheme <code>{authentication.scheme}</code>
            </span>
        );
    }
    if (authentication.name) {
        parts.push(
            <span key="name">
                sent as{" "}
                {authentication.location
                    ? `${label(
                          PARAMETER_LOCATION_LABELS,
                          authentication.location
                      )} `
                    : ""}
                <code>{authentication.name}</code>
            </span>
        );
    }
    if (authentication.scopes?.length) {
        parts.push(
            <span key="scopes">
                scopes: <ValueList values={authentication.scopes} />
            </span>
        );
    }
    return (
        <span className="distribution-contract__authentication">
            {parts.map((part, idx) => (
                <React.Fragment key={idx}>
                    {idx ? " · " : ""}
                    {part}
                </React.Fragment>
            ))}
            {authentication.description ? (
                <span className="distribution-contract__auth-description">
                    {parts.length ? " — " : ""}
                    {authentication.description}
                </span>
            ) : null}
            {isUrl(authentication.documentationUrl) ? (
                <>
                    {" "}
                    <ExternalLink href={authentication.documentationUrl}>
                        How to get access
                    </ExternalLink>
                </>
            ) : null}
        </span>
    );
};

const SourceCapabilities: FunctionComponent<{
    capabilities: DistributionContractSourceCapabilities;
}> = ({ capabilities }) => {
    const keys = Object.keys(capabilities).filter(
        (key) => capabilities[key] !== undefined
    );
    if (!keys.length) {
        return null;
    }
    return (
        <ul className="distribution-contract__capabilities">
            {keys.map((key) => (
                <li key={key}>
                    {Object.prototype.hasOwnProperty.call(
                        CAPABILITY_LABELS,
                        key
                    )
                        ? CAPABILITY_LABELS[key]
                        : humanizeKey(key)}
                    : {describeCapabilityValue(capabilities[key])}
                </li>
            ))}
        </ul>
    );
};

/**
 * A request/response body's `data-dictionary` entity: a link that shows the
 * entity in the Structure section when the distribution's dictionary
 * describes it, otherwise the plain entity id.
 */
const EntityReference: FunctionComponent<{
    entityId: string;
    dataDictionary?: DataDictionaryAspect;
    onSelectEntity?: (entityId: string) => void;
}> = ({ entityId, dataDictionary, onSelectEntity }) => {
    const entity = dataDictionary?.entities.find(
        (item) => item.id === entityId
    );
    if (!entity) {
        return (
            <span className="distribution-contract__entity-ref">
                <code>{entityId}</code>
                {dataDictionary ? (
                    <span className="distribution-contract__muted">
                        {" "}
                        (not described in Structure)
                    </span>
                ) : null}
            </span>
        );
    }
    const text =
        entity.name && entity.name !== entityId
            ? `${entity.name} (${entityId})`
            : entityId;
    return onSelectEntity ? (
        <button
            type="button"
            className="distribution-contract__entity-link"
            data-entity-id={entityId}
            onClick={() => onSelectEntity(entityId)}
        >
            {text}
        </button>
    ) : (
        <span className="distribution-contract__entity-ref">{text}</span>
    );
};

function describeRequired(parameter: DistributionContractParameter): string {
    if (parameter.required === true) {
        return "Required";
    }
    if (parameter.required === false) {
        return "Optional";
    }
    return "—";
}

const ParameterDetails: FunctionComponent<{
    parameter: DistributionContractParameter;
}> = ({ parameter }) => {
    const items: React.ReactNode[] = [];
    if (parameter.default !== undefined) {
        items.push(
            <span key="default">
                Default: <code>{displayValue(parameter.default)}</code>
            </span>
        );
    }
    if (Array.isArray(parameter.enum) && parameter.enum.length) {
        items.push(
            <span key="enum">
                Allowed values: <ValueList values={parameter.enum} />
            </span>
        );
    }
    if (parameter.minimum !== undefined || parameter.maximum !== undefined) {
        items.push(
            <span key="range">
                Range: {displayValue(parameter.minimum ?? "…")} –{" "}
                {displayValue(parameter.maximum ?? "…")}
            </span>
        );
    }
    if (
        parameter.minLength !== undefined ||
        parameter.maxLength !== undefined
    ) {
        items.push(
            <span key="length">
                Length: {parameter.minLength ?? 0} –{" "}
                {parameter.maxLength ?? "…"}
            </span>
        );
    }
    if (parameter.pattern) {
        items.push(
            <span key="pattern">
                Pattern: <code>{parameter.pattern}</code>
            </span>
        );
    }
    if (parameter.unit) {
        items.push(<span key="unit">Unit: {parameter.unit}</span>);
    }
    if (parameter.example !== undefined) {
        items.push(
            <span key="example">
                Example: <code>{displayValue(parameter.example)}</code>
            </span>
        );
    }
    if (!items.length) {
        return null;
    }
    return (
        <ul className="distribution-contract__constraints">
            {items.map((item, idx) => (
                <li key={idx}>{item}</li>
            ))}
        </ul>
    );
};

const PropertyProvenance: FunctionComponent<{
    contract: DistributionContractAspect;
    nodes: Array<DistributionContractOperation | DistributionContractParameter>;
}> = ({ contract, nodes }) => {
    const node = nodes[nodes.length - 1];
    const properties = node?.propertyProvenance
        ? Object.keys(node.propertyProvenance)
        : [];
    return (
        <>
            {properties.map((property) => (
                <div key={property}>
                    <ProvenanceBadge
                        label={property}
                        provenance={getEffectiveProvenance(
                            contract,
                            nodes,
                            property
                        )}
                    />
                </div>
            ))}
        </>
    );
};

const Parameters: FunctionComponent<{
    contract: DistributionContractAspect;
    operation: DistributionContractOperation;
    parameters: DistributionContractParameter[];
}> = ({ contract, operation, parameters }) => {
    // the operation/contract provenance covers parameters without their own
    const showProvenance = parameters.some(
        (parameter) => parameter.provenance || parameter.propertyProvenance
    );
    return (
        <div className="distribution-contract__table-wrapper">
            <table className="distribution-contract__table">
                <caption className="sr-only">
                    Parameters of {operation.label || operation.id}
                </caption>
                <thead>
                    <tr>
                        <th scope="col">Parameter</th>
                        <th scope="col">In</th>
                        <th scope="col">Type</th>
                        <th scope="col">Required</th>
                        <th scope="col">Description</th>
                        {showProvenance ? (
                            <th scope="col">Provenance</th>
                        ) : null}
                    </tr>
                </thead>
                <tbody>
                    {parameters.map((parameter, idx) => (
                        <tr
                            // names should be unique per location, but
                            // unvalidated data may repeat them
                            key={idx}
                            className="distribution-contract__parameter"
                            data-parameter-name={parameter.name}
                            data-parameter-location={parameter.location}
                        >
                            <td>
                                <code>{parameter.name}</code>
                                {parameter.sourceIdentifier &&
                                parameter.sourceIdentifier !==
                                    parameter.name ? (
                                    <div
                                        className="distribution-contract__muted"
                                        title="Native source identifier"
                                    >
                                        {parameter.sourceIdentifier}
                                    </div>
                                ) : null}
                            </td>
                            <td>
                                {label(
                                    PARAMETER_LOCATION_LABELS,
                                    parameter.location
                                )}
                            </td>
                            <td>
                                <code>{parameter.type}</code>
                                {parameter.format ? (
                                    <div className="distribution-contract__muted">
                                        {parameter.format}
                                    </div>
                                ) : null}
                            </td>
                            <td>{describeRequired(parameter)}</td>
                            <td>
                                {parameter.description ? (
                                    <div>{parameter.description}</div>
                                ) : null}
                                <ParameterDetails parameter={parameter} />
                            </td>
                            {showProvenance ? (
                                <td className="distribution-contract__parameter-provenance">
                                    {parameter.provenance ? (
                                        <ProvenanceBadge
                                            provenance={getEffectiveProvenance(
                                                contract,
                                                [operation, parameter]
                                            )}
                                        />
                                    ) : null}
                                    <PropertyProvenance
                                        contract={contract}
                                        nodes={[operation, parameter]}
                                    />
                                </td>
                            ) : null}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const Pagination: FunctionComponent<{
    pagination: DistributionContractPagination;
}> = ({ pagination }) => {
    const hints = PAGINATION_LABELS.filter(
        ([key]) => typeof pagination[key] === "string"
    );
    if (!pagination.type && !hints.length) {
        return null;
    }
    return (
        <li className="distribution-contract__pagination">
            Pagination
            {pagination.type ? (
                <>
                    : <code>{pagination.type}</code>
                </>
            ) : null}
            {hints.length ? (
                <>
                    {" "}
                    (
                    {hints.map(([key, text], idx) => (
                        <React.Fragment key={key}>
                            {idx ? ", " : ""}
                            {text} <code>{pagination[key] as string}</code>
                        </React.Fragment>
                    ))}
                    )
                </>
            ) : null}
        </li>
    );
};

const Operation: FunctionComponent<{
    contract: DistributionContractAspect;
    operation: DistributionContractOperation;
    dataDictionary?: DataDictionaryAspect;
    onSelectEntity?: (entityId: string) => void;
}> = ({ contract, operation, dataDictionary, onSelectEntity }) => {
    const { request, response } = operation;
    const parameters = operation.parameters ?? [];
    const entityReference = (entityId: string) => (
        <EntityReference
            entityId={entityId}
            dataDictionary={dataDictionary}
            onSelectEntity={onSelectEntity}
        />
    );
    const requestItems: React.ReactNode[] = [];
    if (request) {
        if (request.required !== undefined) {
            requestItems.push(request.required ? "required" : "optional");
        }
        if (request.mediaTypes?.length) {
            requestItems.push(<ValueList values={request.mediaTypes} />);
        }
        if (request.dictionaryEntity) {
            requestItems.push(
                <>structure: {entityReference(request.dictionaryEntity)}</>
            );
        }
    }
    const responseItems: React.ReactNode[] = [];
    if (response) {
        if (response.mediaTypes?.length) {
            responseItems.push(<ValueList values={response.mediaTypes} />);
        }
        if (response.statusCodes?.length) {
            responseItems.push(
                <>
                    status <ValueList values={response.statusCodes} />
                </>
            );
        }
        if (response.recordsPath !== undefined) {
            responseItems.push(
                <>
                    records at{" "}
                    <code title="JSON Pointer (RFC 6901)">
                        {response.recordsPath === ""
                            ? "(whole response)"
                            : response.recordsPath}
                    </code>
                </>
            );
        }
        if (response.dictionaryEntity) {
            responseItems.push(
                <>structure: {entityReference(response.dictionaryEntity)}</>
            );
        }
    }
    const joinItems = (items: React.ReactNode[]) =>
        items.map((item, idx) => (
            <React.Fragment key={idx}>
                {idx ? " · " : ""}
                {item}
            </React.Fragment>
        ));

    return (
        <div
            className="distribution-contract__operation"
            data-operation-id={operation.id}
        >
            <h5 className="distribution-contract__operation-name">
                {operation.label || operation.id}
                {operation.interactionType ? (
                    <span className="distribution-contract__tag">
                        {operation.interactionType}
                    </span>
                ) : null}
            </h5>
            {operation.method || operation.path ? (
                <div className="distribution-contract__signature">
                    {operation.method ? (
                        <span className="distribution-contract__method">
                            {operation.method}
                        </span>
                    ) : null}
                    {operation.path ? (
                        <code title="Operation path (relative to the service endpoint)">
                            {operation.path}
                        </code>
                    ) : null}
                </div>
            ) : null}
            {operation.purpose ? <p>{operation.purpose}</p> : null}
            <ul className="distribution-contract__operation-meta">
                {operation.endpointUrl ? (
                    <li>
                        Endpoint: <code>{operation.endpointUrl}</code>
                    </li>
                ) : null}
                {operation.authentication ? (
                    <li>
                        Authentication:{" "}
                        <Authentication
                            authentication={operation.authentication}
                        />
                    </li>
                ) : null}
                {requestItems.length ? (
                    <li className="distribution-contract__request">
                        Request body: {joinItems(requestItems)}
                        {request?.description ? (
                            <> — {request.description}</>
                        ) : null}
                    </li>
                ) : request?.description ? (
                    <li className="distribution-contract__request">
                        Request body: {request.description}
                    </li>
                ) : null}
                {responseItems.length ? (
                    <li className="distribution-contract__response">
                        Response: {joinItems(responseItems)}
                        {response?.description ? (
                            <> — {response.description}</>
                        ) : null}
                    </li>
                ) : response?.description ? (
                    <li className="distribution-contract__response">
                        Response: {response.description}
                    </li>
                ) : null}
                {response?.pagination ? (
                    <Pagination pagination={response.pagination} />
                ) : null}
                {operation.sourceCapabilities &&
                Object.keys(operation.sourceCapabilities).length ? (
                    <li>
                        Source capabilities:
                        <SourceCapabilities
                            capabilities={operation.sourceCapabilities}
                        />
                    </li>
                ) : null}
                {operation.provenance || operation.propertyProvenance ? (
                    <li>
                        {operation.provenance ? (
                            <ProvenanceBadge
                                provenance={getEffectiveProvenance(contract, [
                                    operation
                                ])}
                            />
                        ) : null}
                        <PropertyProvenance
                            contract={contract}
                            nodes={[operation]}
                        />
                    </li>
                ) : null}
                <li className="distribution-contract__muted">
                    Operation ID: <code>{operation.id}</code>
                    {operation.sourceIdentifier ? (
                        <>
                            {" "}
                            · source ID:{" "}
                            <code>{operation.sourceIdentifier}</code>
                        </>
                    ) : null}
                </li>
            </ul>
            {parameters.length ? (
                <Parameters
                    contract={contract}
                    operation={operation}
                    parameters={parameters}
                />
            ) : null}
        </div>
    );
};

/**
 * Read-only "How to use" section rendering the `distribution-contract` aspect
 * of a distribution: protocol and access mode, endpoint, documentation and
 * specification links, descriptive authentication, source capabilities, the
 * curated operations with their parameters, request/response metadata,
 * pagination hints and links to the request/response entities in the
 * Structure section, plus provenance and the last verification time.
 *
 * It only describes the interface: it never composes or executes requests.
 * `onSelectEntity` is called when a request/response entity link is followed;
 * links are only shown for entities of `dataDictionary`. `headingClassName`
 * replaces the default `section-heading` class of the "How to use" heading.
 */
const DistributionContractSection: FunctionComponent<{
    distributionContract: DistributionContractAspect;
    dataDictionary?: DataDictionaryAspect;
    onSelectEntity?: (entityId: string) => void;
    headingClassName?: string;
}> = ({
    distributionContract: contract,
    dataDictionary,
    onSelectEntity,
    headingClassName = "section-heading"
}) => {
    const operations = contract.operations ?? [];
    const specification = contract.specification;
    const specificationName = specification?.type
        ? label(SPECIFICATION_TYPE_LABELS, specification.type)
        : "Native specification";
    const hasCapabilities =
        !!contract.sourceCapabilities &&
        Object.keys(contract.sourceCapabilities).length > 0;

    return (
        <section
            className="distribution-contract"
            aria-labelledby="distribution-contract-heading"
        >
            <h3 className={headingClassName} id="distribution-contract-heading">
                How to use
            </h3>
            <dl className="distribution-contract__overview">
                {contract.protocol ? (
                    <>
                        <dt>Protocol</dt>
                        <dd>{contract.protocol}</dd>
                    </>
                ) : null}
                {contract.resourceRole ? (
                    <>
                        <dt>Resource</dt>
                        <dd>
                            {label(RESOURCE_ROLE_LABELS, contract.resourceRole)}
                        </dd>
                    </>
                ) : null}
                {contract.accessMode ? (
                    <>
                        <dt>Access</dt>
                        <dd>
                            {label(ACCESS_MODE_LABELS, contract.accessMode)}
                        </dd>
                    </>
                ) : null}
                {contract.endpointUrl ? (
                    <>
                        <dt>Endpoint</dt>
                        <dd>
                            <code className="distribution-contract__endpoint">
                                {contract.endpointUrl}
                            </code>
                        </dd>
                    </>
                ) : null}
                {contract.authentication ? (
                    <>
                        <dt>Authentication</dt>
                        <dd>
                            <Authentication
                                authentication={contract.authentication}
                            />
                        </dd>
                    </>
                ) : null}
                {isUrl(contract.documentationUrl) ||
                isUrl(specification?.url) ? (
                    <>
                        <dt>Documentation</dt>
                        <dd className="distribution-contract__links">
                            <ExternalLink href={contract.documentationUrl}>
                                API / service documentation
                            </ExternalLink>
                            {isUrl(specification?.url) ? (
                                <span
                                    title={
                                        specification?.fingerprint
                                            ? `Fingerprint: ${specification.fingerprint}`
                                            : undefined
                                    }
                                >
                                    <ExternalLink href={specification!.url}>
                                        {specificationName}
                                        {specification?.version
                                            ? ` (${specification.version})`
                                            : ""}
                                    </ExternalLink>
                                    {specification?.retrievedAt ? (
                                        <span className="distribution-contract__muted">
                                            {" "}
                                            retrieved{" "}
                                            {specification.retrievedAt}
                                        </span>
                                    ) : null}
                                </span>
                            ) : null}
                        </dd>
                    </>
                ) : null}
                <dt>Provenance</dt>
                <dd>
                    <ProvenanceBadge provenance={contract.provenance} />
                </dd>
                {contract.lastVerified ? (
                    <>
                        <dt>Last verified</dt>
                        <dd className="distribution-contract__last-verified">
                            {contract.lastVerified}
                        </dd>
                    </>
                ) : null}
            </dl>
            {hasCapabilities ? (
                <div className="distribution-contract__source-capabilities">
                    <span>Source capabilities</span>{" "}
                    <span className="distribution-contract__muted">
                        (as reported by the source)
                    </span>
                    <SourceCapabilities
                        capabilities={contract.sourceCapabilities!}
                    />
                </div>
            ) : null}
            <p className="distribution-contract__notice distribution-contract__muted">
                This describes how the source can be accessed. It does not grant
                access, and Magda does not run these operations for you.
            </p>
            {operations.length ? (
                <>
                    <h4 className="distribution-contract__operations-heading">
                        {operations.length === 1
                            ? "Operation"
                            : `Operations (${operations.length})`}
                    </h4>
                    {operations.map((operation, idx) => (
                        <Operation
                            // ids should be unique, but unvalidated data may
                            // repeat them
                            key={idx}
                            contract={contract}
                            operation={operation}
                            dataDictionary={dataDictionary}
                            onSelectEntity={onSelectEntity}
                        />
                    ))}
                </>
            ) : null}
        </section>
    );
};

export default DistributionContractSection;
