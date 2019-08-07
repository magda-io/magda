import uuidv4 from "uuid/v4";

import { Contact } from "Components/Editing/Editors/contactEditor";
import { licenseLevel } from "constants/DatasetConstants";
import { fetchOrganization } from "api-clients/RegistryApis";
import { config } from "config";

export type File = {
    title: string;
    description?: string;
    issued?: string;
    modified: Date;
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
    usage: Usage;

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
    contactPointFull?: Contact[];
    contactPointDisplay?: string;
    publisher?: OrganisationAutocompleteChoice;
    landingPage?: string;
    importance?: string;
    accrualPeriodicity?: string;
    accrualPeriodicityRecurrenceRule?: string;
    collaborationOrganization?: string[];
    productionDetails?: string;
    creationSystem?: string;
    creation_isOpenData?: boolean;
    accessLevel?: string;
    accessNotesTemp?: string;
};

type DatasetPublishing = {
    state: string;
    level: string;
    notesToApprover?: string;
};

type SpatialCoverage = {
    bbox?: [number, number, number, number];
    lv1Id?: string;
    lv2Id?: string;
    lv3Id?: string;
    lv4Id?: string;
    lv5Id?: string;
};

export type State = {
    files: File[];
    dataset: Dataset;
    datasetPublishing: DatasetPublishing;
    processing: boolean;
    spatialCoverage: SpatialCoverage;
    temporalCoverage: TemporalCoverage;
    datasetUsage: Usage;
    datasetAccess: Access;
    _licenseLevel: string;
    _lastModifiedDate: string;
    _createdDate: string;
    isPublishing: boolean;
};

type TemporalCoverage = {
    intervals: Interval[];
};

export type Interval = {
    start?: Date;
    end?: Date;
};

type Usage = {
    licenseLevel?: string;
    license?: string;
    disseminationLimits?: string[];
    securityClassification?: string;
};

type Access = {
    url?: string;
    notes?: string;
    downloadURL?: string;
};

function createBlankState(): State {
    return {
        files: [],
        processing: false,
        dataset: {
            title: "Untitled",
            languages: ["eng"],
            contactPointDisplay: "role"
        },
        datasetPublishing: {
            state: "draft",
            level: "agency"
        },
        spatialCoverage: {},
        temporalCoverage: {
            intervals: []
        },
        datasetUsage: {
            license: licenseLevel.government
        },
        datasetAccess: {},
        isPublishing: false,
        _createdDate: new Date().toISOString(),
        _lastModifiedDate: new Date().toISOString(),
        _licenseLevel: "dataset"
    };
}

// saving data in the local storage for now
// TODO: consider whether it makes sense to store this in registery as a custom state or something
export async function loadState(id: string): Promise<State> {
    const stateString = localStorage[id];
    let state: State;
    if (stateString) {
        state = JSON.parse(stateString);
    } else {
        state = createBlankState();
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

    if (state.files.length === 0 && state._licenseLevel !== "dataset") {
        state._licenseLevel = "dataset";
    }

    state._lastModifiedDate = new Date().toISOString();
    const dataset = JSON.stringify(state);
    localStorage[id] = dataset;
    return id;
}
