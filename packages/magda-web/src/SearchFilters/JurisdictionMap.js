import Filter from './Filter';
import React from 'react';
import L from 'leaflet';
import ozStates from '../dummyData/ozStates';
import '../../node_modules/leaflet/dist/leaflet.css';
import getJSON from'../getJSON';
import './JurisdictionMap.css';


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

        this.highlightRegion();

        this.map.on('click', function(e) {
            // bring pop up
            // get jurisdiction
            getJSON(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${e.latlng.lat},${e.latlng.lng}&sensor=false&result_type=administrative_area_level_1&key=AIzaSyBvqg7oM1c-Cpl0EF8urYxKLuW-D_YWD9o`).then(data=>{
                let jurisdiction = data.results[0].address_components[0].long_name.replace(/\s/g,'').toLowerCase();
                that.props.updateQuery({
                    jurisdiction: jurisdiction
                });
            }, error=> console.warn(error));
        });
    }

    componentWillReceiveProps(){
        // could check if update is required
        this.map.removeLayer(this.layer);
        this.highlightRegion();
    }

    highlightRegion(){
        let statesData = ozStates()[this.props.location.query.jurisdiction];
        this.layer = L.geoJson(statesData).addTo(this.map);
    }

     componentWillUnmount(){
        this.map.remove();
    }

    render(){
        return (
            <div className='filter jurisdiction-map'>
               <div className='clearfix filter-header'>
                    <h4 className='filter-title'>{this.props.title}</h4>
                    <button type='button' className='btn btn-reset' onClick={this.props.closePopUp}>Close</button>
                </div>
              <div className='map-in-popup' ref={(c) => this._c = c}/>
            </div>
      );
    }
}

export default JurisdictionMap;
