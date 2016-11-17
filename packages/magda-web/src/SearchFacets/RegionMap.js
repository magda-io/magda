import '../../node_modules/leaflet/dist/leaflet.css';
import './RegionMap.css';
import Facet from './FacetWrapper';
// eslint-disable-next-line
import L from 'leaflet';
// eslint-disable-next-line
import MVTSource from '../../node_modules/leaflet-mapbox-vector-tile/src/index.js';
import regions from '../dummyData/regions';
import defined from '../helpers/defined';
import React from 'react';
import fetch from 'isomorphic-fetch'


class RegionMap extends Facet {
    constructor(props) {
        super(props);
        this.map = undefined;
        this.layer = undefined;
        this.getID = undefined;
    }

    componentDidMount(){
        this.map = L.map(this._c, { zoomControl: this.props.interaction});
        this.map.setView([-27, 133], 4);

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

        if(defined(this.props.regionMapping)){
          this.addRegion();
        }
    }

    componentWillReceiveProps(nextProps) {
        // Is this condition needed? Can props be updated before the layer is created?
        if (this.layer) {
            this.layer.setStyle(this.generateStyle(nextProps.regionId));
        }

        if(defined(this.props.regionMapping)){
          this.addRegion();
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

    addRegion(){
        let that = this;
        let region = this.props.regionMapping[this.props.regionType];
        this.getID = function(feature) { return feature.properties[region.id];};
        if(defined(region)){
          this.layer = new L.TileLayer.MVTSource({
              url: region.server,
              style: this.generateStyle(this.props.regionId),
              hoverInteraction: this.props.interaction,
              /*onEachFeature: onEachFeature, */
              clickableLayers: (this.props.interaction) ? undefined : [], // Enable clicks for all layers if interaction
              mutexToggle: true,
              onClick: function(evt) { if (evt.type === 'click' && evt.feature){
                  that.props.onClick(evt.feature);
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
