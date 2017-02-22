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
        regionId: regionRaw.queryRegion.regionId,
        regionType: regionRaw.queryRegion.regionType,
        regionName: regionRaw.regionName,
        boundingBox: regionRaw.boundingBox
    }
    return region;
}