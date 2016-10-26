import '../../node_modules/leaflet/dist/leaflet.css';
import './JurisdictionMap.css';
import Filter from './Filter';
// eslint-disable-next-line
import L from 'leaflet';
// eslint-disable-next-line
import MVTSource from '../../node_modules/leaflet-mapbox-vector-tile/src/index.js';
import regions from '../dummyData/regions';
import defined from '../defined';
import React from 'react';

class JurisdictionMap extends Filter {
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

        this.addRegion();

        if(this.props.interaction === false){
            this.map.dragging.disable();
            this.map.touchZoom.disable();
            this.map.scrollWheelZoom.disable();
        }
    }

    componentWillReceiveProps(nextProps) {
        // Is this condition needed? Can props be updated before the layer is created?
        if (this.layer) {
            this.layer.setStyle(this.generateStyle(nextProps.location.query.jurisdictionId));
        }
        if(this.props.locationInfo !== nextProps.locationInfo){
            console.log(nextProps.locationInfo);
        }
    }

    generateStyle(jurisdiction) {
        return (feature) => ({
            color: (jurisdiction === this.getID(feature)) ? '#00B5FF' : 'rgba(0,0,0,0)',
                outline: {
                    color: '#ddd',
                    size: 1
                },
                selected: {
                    color: (jurisdiction === this.getID(feature)) ? '#00B5FF' : 'rgba(0,0,0,0)',
                    outline: {
                        color: '#00B5FF'
                    }
                }
        });
    }

    addRegion(){
        let that = this;
        let regionType = this.props.location.query.jurisdictionType || 'SA1';
        let region = regions()[regionType];
        this.getID = function(feature) { return feature.properties[region.id];};

        if(defined(region)){
          this.layer = new L.TileLayer.MVTSource({
              url: region.url,
              style: this.generateStyle(this.props.location.query.jurisdictionId),
              hoverInteraction: this.props.interaction,
              /*onEachFeature: onEachFeature, */
              clickableLayers: (this.props.interaction) ? undefined : [], // Enable clicks for all layers if interaction
              mutexToggle: true,
              onClick: function(evt) { if (evt.type === 'click' && evt.feature){
                  that.props.onClick(evt.feature.properties[region.id], regionType);
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
            <div className='jurisdiction-map'>
              <div className='map' ref={(c) => {this._c = c}}/>
            </div>
      );
    }
}

export default JurisdictionMap;
