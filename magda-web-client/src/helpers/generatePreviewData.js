// @flow
export default function generatePreviewData(url: string, preloadedData: Object): string {
    const format: string = preloadedData['Service'][0]['Name'][0]._.toLowerCase();
    const layer = preloadedData['Capability'][0]['Layer'][0]['Layer'][0];
    const bbox = getBoundingBox(layer);

    const boundingBox = [];
    const config = {
        'version': '0.0.03',
        'initSources': [
            {
                'catalog': [
                    {
                        'type': 'group',
                        'name': 'User-Added Data',
                        'description': 'The group for data that was added by the user via the Add Data panel.',
                        'isUserSupplied': true,
                        'isOpen': true,
                        'items': [
                            {
                                'type': format === 'arcgis rest api' ? 'esri-mapServer-group' : format,
                                'name': 'User Data',
                                'isUserSupplied': true,
                                'isOpen': true,
                                'isEnabled': true,
                                'url': url,
                                'zoomOnEnable': true,
                                'layers': layer['Name'][0]._
                            }
                        ]
                    }],
                'catalogIsUserSupplied': true,
                'initialCamera': {
                    'west': boundingBox[0] || 105,
                    'south': boundingBox[1] || -45,
                    'east': boundingBox[2] || 155,
                    'north': boundingBox[3] || -5
                },
                viewerMode: '2d'

            }]
    }

    // if (spatial != '') {
    //             extent = geojsonExtent(JSON.parse(spatial)); //[WSEN]
    //             if (extent[0] != extent[2]) {
    //                 config['initSources'][0]['homeCamera']['west'] = extent[0];
    //                 config['initSources'][0]['homeCamera']['south'] = extent[1];
    //                 config['initSources'][0]['homeCamera']['east'] = extent[2];
    //                 config['initSources'][0]['homeCamera']['north'] = extent[3];
    //             }
    //         }

    var encoded_config = encodeURIComponent(JSON.stringify(config));
    return encoded_config;
}

function getBoundingBox(layer) {
    const egbb = layer.EX_GeographicBoundingBox; // required in WMS 1.3.0
    if (egbb && egbb[0]) {
        const bbox = egbb[0];
        return [bbox.westBoundLongitude[0]._, bbox.southBoundLatitude[0]._, bbox.eastBoundLongitude[0]._, bbox.northBoundLatitude[0]._];
    } else {
        var llbb = layer.LatLonBoundingBox; // required in WMS 1.0.0 through 1.1.1
        if (llbb && llbb.length > 0 && llbb[0].$) {
            const attrs = llbb[0].$;
            return [attrs.minx, attrs.miny, attrs.maxx, attrs.maxy];
        }
    }
}
