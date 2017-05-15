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
    display_name: string,
    description: string,
    image_display_url: string,
    id: string
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
        title: publisherRaw.display_name,
        description: publisherRaw.description,
        image_url: publisherRaw.image_display_url,
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