import uuidv4 from "uuid/v4";

import { ContactPointDisplayOption } from "constants/DatasetConstants";
import { fetchOrganization } from "api-clients/RegistryApis";
import { config } from "config";
import { User } from "reducers/userManagementReducer";

export type File = {
    title: string;
    description?: string;
    issued?: string;
    modified: Date;
    license?: string;
    rights?: string;
    accessURL?: string;
    accessNotes?: string;
    downloadURL?: string;
    byteSize?: number;
    mediaType?: string;
    format?: string;

    datasetTitle: string;
    author?: string;
    keywords?: string[];
    themes?: string[];
    temporalCoverage?: any;
    spatialCoverage?: any;

    similarFingerprint?: any;
    equalHash?: string;

    _state: FileState;
    _progress?: number;
};

export enum FileState {
    Added,
    Reading,
    Processing,
    Ready
}

export function fileStateToText(state: FileState) {
    switch (state) {
        case FileState.Added:
            return "Added";
        case FileState.Reading:
            return "Reading";
        case FileState.Processing:
            return "Processing";
        case FileState.Ready:
            return "Ready";
        default:
            return "Unknown";
    }
}

export type OrganisationAutocompleteChoice = {
    existingId?: string;
    name: string;
};

export type Dataset = {
    title: string;
    description?: string;
    issued?: Date;
    modified?: Date;
    languages?: string[];
    keywords?: string[];
    themes?: string[];
    owningOrgUnitId?: string;
    contactPointDisplay?: string;
    publisher?: OrganisationAutocompleteChoice;
    landingPage?: string;
    importance?: string;
    accrualPeriodicity?: string;
    accrualPeriodicityRecurrenceRule?: string;
    accessLevel?: string;
    accessNotesTemp?: string;
    defaultLicense?: string;
};

export type Provenance = {
    mechanism?: string;
    sourceSystem?: string;
    derivedFrom?: string[];
    affiliatedOrganizations?: OrganisationAutocompleteChoice[];
    isOpenData?: boolean;
};

export type DatasetPublishing = {
    state: string;
    level: string;
    notesToApprover?: string;
    contactPointDisplay?: ContactPointDisplayOption;
};

type SpatialCoverage = {
    bbox?: [number, number, number, number];
    lv1Id?: string;
    lv2Id?: string;
    lv3Id?: string;
    lv4Id?: string;
    lv5Id?: string;
};

type InformationSecurity = {
    disseminationLimits?: string;
    classification?: string;
};

export type State = {
    files: File[];
    dataset: Dataset;
    datasetPublishing: DatasetPublishing;
    processing: boolean;
    spatialCoverage: SpatialCoverage;
    temporalCoverage: TemporalCoverage;
    datasetAccess: Access;
    informationSecurity: InformationSecurity;
    provenance: Provenance;

    _lastModifiedDate: string;
    _createdDate: string;

    licenseLevel: "dataset" | "distribution";

    isPublishing: boolean;
    error: Error | null;
};

type TemporalCoverage = {
    intervals: Interval[];
};

export type Interval = {
    start?: Date;
    end?: Date;
};

type Access = {
    location?: string;
    notes?: string;
};

function createBlankState(user: User): State {
    return {
        files: [],
        processing: false,
        dataset: {
            title: "Untitled",
            languages: ["eng"],
            owningOrgUnitId: user.orgUnitId,
            defaultLicense: "world"
        },
        datasetPublishing: {
            state: "draft",
            level: "agency",
            contactPointDisplay: "members"
        },
        spatialCoverage: {},
        temporalCoverage: {
            intervals: []
        },
        datasetAccess: {},
        informationSecurity: {},
        provenance: {},
        licenseLevel: "dataset",
        isPublishing: false,
        error: null,
        _createdDate: new Date().toISOString(),
        _lastModifiedDate: new Date().toISOString()
    };
}

// saving data in the local storage for now
// TODO: consider whether it makes sense to store this in registry as a custom state or something
export async function loadState(id: string, user: User): Promise<State> {
    const stateString = localStorage[id];
    let state: State;
    if (stateString) {
        state = JSON.parse(stateString);
    } else {
        state = createBlankState(user);
    }

    if (
        !state.dataset.publisher &&
        typeof config.defaultOrganizationId !== "undefined"
    ) {
        const org = await fetchOrganization(config.defaultOrganizationId);
        state.dataset.publisher = {
            name: org.name,
            existingId: org.id
        };
    }

    return state;
}

export function saveState(state: State, id = "") {
    id = id || `dataset-${uuidv4()}`;
    state = Object.assign({}, state);

    state._lastModifiedDate = new Date().toISOString();
    const dataset = JSON.stringify(state);
    localStorage[id] = dataset;
    return id;
}
