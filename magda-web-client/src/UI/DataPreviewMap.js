import React from 'react';
import PropTypes from 'prop-types';
import './DataPreviewMap.css';
import { config } from '../config'

const defaultDataSourcePreference = ['GeoJSON','WFS','WMS','csv-geo-au','KML'];

function determineDistribution(props)
{
    const distributions = props.dataset.distributions;
    let dataSourcePreference = props.dataset.dataSourcePreference;
    if(!dataSourcePreference || !dataSourcePreference.length) dataSourcePreference = defaultDataSourcePreference;
    dataSourcePreference = dataSourcePreference.map(item => item.toLowerCase());
    if(!distributions || !distributions.length) return null;
    let selectedDis = null, perferenceOrder = -1;
    distributions.forEach(dis => {
        const format = dis.format.toLowerCase();
        const disPerORder = dataSourcePreference.indexOf(format);
        if(disPerORder == -1) return;
        if(perferenceOrder == -1 || disPerORder<perferenceOrder) {
            perferenceOrder = disPerORder;
            selectedDis = dis;
            return;
        }
    });
    return selectedDis;
}

function createCatalogItemFromDistribution(dis)
{
    return {
        "version": "0.0.05",
        "initSources": [
            {
                "catalog": [
                    {
                        "name": dis.title,
                        "type": "magda-item",
                        "url": "/",
                        "distributionId": dis.identifier,
                        "isEnabled": true,
                        "zoomOnEnable": true
                    }
                ],
                "baseMapName": "Positron (Light)"
            }
        ]
    };
}

function DataPreviewMap(props) {
    
    const { identifier } = props.dataset;
    if(identifier=='') return (
        <div className="data-preview-map">
            <h3>Map Preview</h3>
            Loading....
        </div>
    );

    const selectedDistribution = determineDistribution(props);

    if(!selectedDistribution) return (
        <div className="data-preview-map">
            No map preview available
        </div>
    );

    const catalogItem = createCatalogItemFromDistribution(selectedDistribution);
    const previewMapUrl = config.previewMapUrl + "#start=" + encodeURIComponent(JSON.stringify(catalogItem));
    return (
        <div className="data-preview-map">
            <h3>Map Preview</h3>
            <div className='mui-row'>
              <div className='mui-col-sm-12'>
                <iframe width="100%" height="600px" frameBorder="0" src={previewMapUrl}></iframe>
              </div>
            </div>
        </div>
    );
}

DataPreviewMap.propTypes = {
    dataset: PropTypes.object,
    dataSourcePreference: PropTypes.arrayOf(PropTypes.string)
};

export default DataPreviewMap;
