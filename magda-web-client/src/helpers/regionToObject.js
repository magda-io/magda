import { config } from "../config";
/**
 * Takes a query object from the REQUEST_RESULTS action
 * and returns the region object
 * @param {region} queryObject
 */
function regionToObject(queryObject) {
    if (!(queryObject.regionId || queryObject.regionType)) {
        return {
            regionId: undefined,
            regionType: undefined,
            boundingBox: config.boundingBox
        };
    } else {
        return {
            regionId: queryObject.regionId,
            regionType: queryObject.regionType,
            boundingBox: config.boundingBox
        };
    }
}

export default regionToObject;
