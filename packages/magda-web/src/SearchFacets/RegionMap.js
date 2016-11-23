import '../../node_modules/leaflet/dist/leaflet.css';
import './RegionMap.css';
import Facet from './FacetWrapper';
// eslint-disable-next-line
import L from 'leaflet';
// eslint-disable-next-line
import MVTSource from '../../node_modules/leaflet-mapbox-vector-tile/src/index.js';
import defined from '../helpers/defined';
import React from 'react';

class RegionMap extends Facet {
    constructor(props) {
        super(props);
        this.map = undefined;
        this.layer = undefined;
        this.getID = undefined;
    }

    componentDidMount(){
        this.map = L.map(this._c, { zoomControl: this.props.interaction});
        this.map.setView([-27, 133], 3);

        if(this.props.interaction === false){
            this._c.addEventListener('click', ()=>{
                this.props.onClick();
            })
        }

        L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',  {
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(this.map);

        if(this.props.interaction === false){
            this.map.dragging.disable();
            this.map.touchZoom.disable();
            this.map.scrollWheelZoom.disable();
        }
    }

    componentWillReceiveProps(nextProps) {
        // after we have received all the data we need,w e can then display the layer
        if(defined(nextProps.region.regionType) && defined(nextProps.regionMapping) && (nextProps.region !== this.props.region)){
          this.addRegion(nextProps);
        }
    }

    generateStyle(region) {
        return (feature) => ({
            color: (region === this.getID(feature)) ? '#00B5FF' : 'rgba(0,0,0,0)',
                outline: {
                    color: '#ddd',
                    size: 1
                },
                selected: {
                    color: (region === this.getID(feature)) ? '#00B5FF' : 'rgba(0,0,0,0)',
                    outline: {
                        color: '#00B5FF'
                    }
                }
        });
    }

    addRegion(props){
        // remove previous layer
        if(defined(this.layer)){
          this.map.removeLayer(this.layer);
        }

        let regionData = props.regionMapping[props.region.regionType];
        console.log(props.region);

        if(defined(regionData)){
          this.getID = function(feature) { return feature.properties[regionData.regionProp]};
          this.layer = new L.TileLayer.MVTSource({
              url: regionData.server,
              style: this.generateStyle(props.region.regionID),
              hoverInteraction: props.interaction,
              /*onEachFeature: onEachFeature, */
              clickableLayers: (props.interaction) ? undefined : [], // Enable clicks for all layers if interaction
              mutexToggle: true,
              onClick: function(evt) { if (evt.type === 'click' && evt.feature){
                  props.onClick(evt.feature);
              }},
              getIDForLayerFeature: this.getID
          });
          this.layer.addTo(this.map);
        }
    }

    componentWillUnmount(){
        this.map.remove();
    }

    render(){
        return (
            <div className='region-map'>
              <div className='map' ref={(c) => {this._c = c}}/>
            </div>
      );
    }
}

export default RegionMap;
