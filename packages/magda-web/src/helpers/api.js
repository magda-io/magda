// @flow 

import type { Region } from '../types';

type RegionRaw = {
    boundingBox : Object,
    queryRegion: {
        regionId: string,
        regionType: string
    },
    regionName: string
}

export function parseRegion(regionRaw : RegionRaw) : Region {
    let region = {
        regionId: regionRaw.regionId,
        regionType: regionRaw.regionType,
        regionName: regionRaw.regionName,
        boundingBox: regionRaw.boundingBox
    }
    return region;
}