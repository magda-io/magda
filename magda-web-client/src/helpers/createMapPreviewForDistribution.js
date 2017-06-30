export default function createMapPreviewForDistribution(distribution) {
    const lowerFormat = distribution.format.toLowerCase();

    if (lowerFormat.indexOf('wms') >= 0) {
        return createWms(distribution);
    } else if (lowerFormat.indexOf('wfs') >= 0) {
        return createWfs(distribution);
    }

    return undefined;
}

function createWms(distribution) {
    return {
        getStartData: function() {

        }
    };
}

function createWfs(distribution) {

}
