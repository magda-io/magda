import '../../node_modules/leaflet/dist/leaflet.css';
import './JurisdictionMap.css';
import Filter from './Filter';
import L from 'leaflet';
import MVTSource from '../../node_modules/leaflet-mapbox-vector-tile/src/index.js';
import regions from '../dummyData/regions';
import React from 'react';

class JurisdictionMap extends Filter {
    constructor(props) {
        super(props);
        this.map = undefined;
        this.layer = undefined;
    }

    componentDidMount(){
        this.map = L.map(this._c);
        this.map.setView([-27, 133], 5);

        L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',  {
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(this.map);

        this.addRegion();

    }

    componentWillReceiveProps(){
        // could check if update is required
        this.map.removeLayer(this.layer);
        this.addRegion();
    }

    addRegion(){
        let that = this;
        let regionType = 'SA1'
        let region = regions()[regionType];
        function style(feature) {
            return {
                color: 'rgba(0,0,0,0)',
                outline: {
                    color: 'black',
                    size: 1
                },
                selected: {
                    color: '#00B5FF',
                    outline: {
                        color: 'red'
                    }
                }
            };
        }

        this.layer = new L.TileLayer.MVTSource({
            url: region.url,
            style: style,
            /*onEachFeature: onEachFeature, */
            /*clickableLayers: ['FID_SA4_2011_AUST'],*/
            mutexToggle: true,
            onClick: function(evt) {
                if (evt.type === 'click' && evt.feature) {
                    alert('Region type: ' + regionType + ' code: ' + evt.feature.id);
                    that.props.updateQuery({
                            jurisdiction: evt.feature.id
                    });
                    }
                },
            getIDForLayerFeature: function(feature) { return feature.properties[region.id]; }
        });
        this.layer.addTo(this.map);
    }

    componentWillUnmount(){
        this.map.remove();
    }

    render(){
        return (
            <div className='jurisdiction-map-wrapper'>
            <div className='filter jurisdiction-map'>
               <div className='clearfix filter-header'>
                    <h4 className='filter-title'>{this.props.title}</h4>
                    <button type='button' className='btn btn-reset' onClick={this.props.closePopUp}>Close
                    </button>
                </div>
              <div className='map-in-popup' ref={(c) => this._c = c}/>
            </div>
            </div>
      );
    }
}

export default JurisdictionMap;
