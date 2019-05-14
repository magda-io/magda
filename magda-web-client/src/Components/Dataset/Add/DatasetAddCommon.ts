import uuidv4 from "uuid/v4";

import { Contact } from "Components/Editing/Editors/contactEditor";

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

type Dataset = {
    title: string;
    description?: string;
    issued?: Date;
    modified?: Date;
    languages?: string[];
    keywords?: string[];
    themes?: string[];
    contactPointFull?: Contact[];
    contactPointDisplay?: string;
    publisher?: string;
    landingPage?: string;
    importance?: string;
    accrualPeriodicity?: string;
    creation_affiliatedOrganisation?: string[];
    creation_sourceSystem?: string;
    creation_mechanism?: string;
    creation_isOpenData?: boolean;
    accessLevel?: string;
    accessNotesTemp?: string;
};

type DatasetPublishing = {
    state: string;
    level: string;
};

type SpatialCoverage = {
    bbox?: [number, number, number, number];
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
    _lastModifiedDate: string;
    _createdDate: string;
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

export function createBlankState(): State {
    return {
        files: [],
        processing: false,
        dataset: {
            title: "Untitled",
            languages: ["eng"]
        },
        datasetPublishing: {
            state: "draft",
            level: "agency"
        },
        spatialCoverage: {},
        temporalCoverage: {
            intervals: []
        },
        datasetUsage: {},
        datasetAccess: {},
        _createdDate: new Date().toISOString(),
        _lastModifiedDate: new Date().toISOString()
    };
}

// saving data in the local storage for now
// TODO: consider whether it makes sense to store this in registery as a custom state or something
export function loadState(id) {
    let dataset = localStorage[id];
    if (dataset) {
        dataset = JSON.parse(dataset);
        return dataset;
    }
    return {};
}

export function saveState(state: State, id = "") {
    id = id || `dataset-${uuidv4()}`;
    state = Object.assign({}, state);
    state._lastModifiedDate = new Date().toISOString();
    const dataset = JSON.stringify(state);
    localStorage[id] = dataset;
    return id;
}
