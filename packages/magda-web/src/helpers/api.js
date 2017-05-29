// @flow

import type { Region, Publisher, Project } from '../types';

type RegionRaw = {
    boundingBox : Object,
    queryRegion: {
        regionId: string,
        regionType: string
    },
    regionName: string
}

type PublisherRaw = {
    name: string,
    id: string,
    aspects: {
        "organization-details": {
            name: string,
            title: string,
            imageUrl : string,
            description: string
        }
    }
}

type ProjectRaw = {
    id: string,
    name: string
}

export function parseRegion(regionRaw : RegionRaw) : Region {
    let region = {
        regionId: regionRaw.queryRegion.regionId,
        regionType: regionRaw.queryRegion.regionType,
        regionName: regionRaw.regionName,
        boundingBox: regionRaw.boundingBox
    }
    return region;
}

export function parsePublisher(publisherRaw: PublisherRaw) : Publisher{
    const publisher = {
        title: publisherRaw.name,
        description: publisherRaw.aspects["organization-details"]["description"] || "A description of this publisher is not available",
        image_url: publisherRaw.aspects["organization-details"]["imageUrl"] || "http://placehold.it/100x100?text=Image+unavailable",
        id: publisherRaw.id
    }
    return publisher
}

export function parseProject(projectRaw: ProjectRaw) : Project {
    return {
        title: projectRaw.name,
        id: projectRaw.id,
        description: "project description"
    }
}
