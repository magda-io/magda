// @flow
export default function generatePreviewData(url: string, preloadedData: Object): string{
  const format: string = preloadedData['Service']['Name'].toLowerCase();
  const boundingBox: Object = preloadedData['Capability']['Layer']['Layer'][0]['BoundingBox'][0]['extent'];
    const config = {
      'version':'0.0.03',
      'initSources':[
        {'catalog':[
          {'type':'group',
          'name':'User-Added Data',
          'description':'The group for data that was added by the user via the Add Data panel.',
          'isUserSupplied':true,
          'isOpen':true,
          'items':[
            {
            'zoomOnEnable': true,
            'type': format === 'arcgis rest api' ?  'esri-mapServer-group' : format,
            'name':'User Data',
            'isUserSupplied':true,
            'isOpen':true,
            'isEnabled':true,
            'url':url,
            'layers': preloadedData['Capability']['Layer']['Layer'][0]['Name']
          }
        ]
      }],
      'catalogIsUserSupplied':true,
      'homeCamera': {
                        'west': boundingBox[0] || 105,
                        'south':boundingBox[1] ||  -45,
                        'east': boundingBox[2] || 155,
                        'north': boundingBox[3] || -5
                    }

    }]}

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
