// @flow
import type { FetchError } from "../types";

export type ProjectProps = {
    description: ?string,
    name: ?string,
    status?: ?string,
    id: string,
    datasets?: Array<string>,
    members?: Array<string>
};

export type RawProject = {
    id: string,
    name: string,
    aspects: {
        project: {
            status: string,
            members: Array<string>,
            datasets: Array<string>,
            description: string
        }
    }
};

export type RawProjects = {
    totalCount: number,
    records: Array<RawProject>
};
export type ParsedProject = {
    id: ?string,
    name: string,
    description: string,
    members: Array<string>,
    datasets: Array<string>,
    status: string
};

export type ProjectAction = {
    json?: Object,
    error?: FetchError,
    type: string,
    project?: RawProject,
    projects?: RawProjects,
    fieldErrors?: ProjectProps,
    showNotification?: boolean
};

export function parseProject(rawProject?: RawProject): ParsedProject {
    if (rawProject && rawProject.aspects) {
        return {
            name: rawProject.name,
            id: rawProject.id,
            description:
                rawProject.aspects.project &&
                rawProject.aspects.project.description,
            status: rawProject.aspects.project.status,
            members: rawProject.aspects.project.members,
            datasets: rawProject.aspects.project.datasets
        };
    }
    return {
        name: "",
        id: null,
        description: "",
        status: "",
        members: [],
        datasets: []
    };
}

function isSpecialChar(str: string) {
    return /[`!@#$%^&*()_+\-=[\]{};':'\\|,.<>/?]+/.test(str);
}

export function validateProjectName(name: ?string) {
    if (!name || name.replace(/ /g, "").length === 0) {
        return "This field cannot be empty";
    }

    if (name.length > 100) {
        return "name cannot be longer than 100 characters";
    }
    // first letter must not contain special characters
    if (isSpecialChar(name.charAt(0))) {
        return "First character of name must be a standard English alphabetic character";
    }
    return null;
}

export function validateProjectDescription(description: ?string) {
    if (!description || description.replace(/ /g, "").length === 0) {
        return "Must provide description";
    }
    if (description.length > 300) {
        return "description cannot be longer than 300 characters";
    }

    return null;
}
