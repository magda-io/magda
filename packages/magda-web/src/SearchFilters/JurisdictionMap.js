import '../../node_modules/leaflet/dist/leaflet.css';
import './JurisdictionMap.css';
import Filter from './Filter';
import getJSON from'../getJSON';
import L from 'leaflet';
import ozStates from '../dummyData/ozStates';
import React from 'react';

class JurisdictionMap extends Filter {
    constructor(props) {
        super(props);
        this.map = undefined;
        this.layer = undefined;
    }

    componentDidMount(){
        let that = this;

        this.map = L.map(this._c);
        this.map.setView([-27, 133], 5);

        L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
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
        let statesData = ozStates();
        function style(feature) {
            let opacity = feature.properties.name === that.props.location.query.jurisdiction ? 1 : 0;

            return {
                fillColor: '#00B5FF',
                weight: 1,
                opacity: 0,
                fillOpacity: opacity
            };
        }

        function onEachFeature(feature, layer) {
            layer.on({
                mouseover: highlightFeature,
                mouseout: resetHighlight,
                click: click
            });
        }

        this.layer = L.geoJson(statesData, {style: style, onEachFeature: onEachFeature}).addTo(this.map);

        function click(e){
            let jurisdiction = e.target.feature.properties.name;
            that.props.updateQuery({
                    jurisdiction: jurisdiction
            });

        }

        function highlightFeature(e){
            let layer = e.target;
            layer.setStyle({
                opacity: 1
            });
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                layer.bringToFront();
            }
        }

        function resetHighlight(e) {
             that.layer.resetStyle(e.target);
        }
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
                    <button type='button' className='btn btn-reset' onClick={this.props.closePopUp}>Close</button>
                </div>

              <div className='map-in-popup' ref={(c) => this._c = c}/>
            </div>
            </div>
      );
    }
}

export default JurisdictionMap;
