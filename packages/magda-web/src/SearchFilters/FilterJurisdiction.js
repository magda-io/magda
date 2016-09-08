import '../../node_modules/leaflet/dist/leaflet.css';
import Filter from './Filter';
import FilterHeader from './FilterHeader';
import LocationSearchBox from './LocationSearchBox';
import JurisdictionMap from './JurisdictionMap';
import L from 'leaflet';
import ozStates from '../dummyData/ozStates';
import React from 'react'
import getJsonp from '../getJsonp';
import getJSON from'../getJSON';

const statesData = ozStates();

class FilterJurisdiction extends Filter {
    constructor(props) {
        super(props);
        this.map = undefined;
        this.layer = undefined;
        this.closePopUp = this.closePopUp.bind(this);
        this.state={
            popUpIsOpen: false,
            searchText: '',
            locationSearchResults: [],
            mapData: {}
        }
    }

    handleChange(e){
        this.setState({
            searchText: e.target.value
        });

        getJsonp(`http://www.censusdata.abs.gov.au/census_services/search?query=${e.target.value || ' '}&cycle=2011&results=15&type=jsonp&cb=`).then(data=>{
            this.setState({
                locationSearchResults: data
            });
        }, error =>{console.log(error)});
    }


    componentDidMount(){
        super.componentDidMount();
        let that = this;
        this.map = L.map(this._c);
        this.map.setView([-27, 133], 3);

        L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(this.map);

        this.map.doubleClickZoom.disable();
        this.map.scrollWheelZoom.disable();
        this.map.boxZoom.disable();
        this.map.touchZoom.disable();
        this.map.keyboard.disable();
        this.map.dragging.disable();

        this.addRegion(statesData);
    }

    closePopUp(){
        this.setState({
                popUpIsOpen: false
        });
    }

    resetFilter(){
        super.resetFilter();
        this.map.removeLayer(this.layer);
    }

    toggleFilter(option){
        super.toggleFilter(option);
    }

    addRegion(data){
        let that = this;

        if(this.layer){
            this.map.removeLayer(this.layer);
        }
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
                click: ()=>{that.setState({popUpIsOpen: true})}
            });
        }

        this.layer = L.geoJson(data, {style: style, onEachFeature: onEachFeature}).addTo(this.map);
    }

    componentWillUnmount(){
        this.map.remove();
    }

    render(){
        return (
            <div className='filter jurisdiction'>
              <FilterHeader query={this.props.location.query[this.props.id]}
                            resetFilter={this.resetFilter}
                            title={this.props.title}/>

              <LocationSearchBox options={this.state.locationSearchResults}
                                 toggleFilter={this.toggleFilter}
                                 searchText={this.state.searchText}
                                 clearSearch={this.clearSearch}
                                 handleChange={this.handleChange}
                                 allowMultiple={false}
              />

              <div className='map' ref={(c) => this._c = c}/>
              {this.state.popUpIsOpen && <JurisdictionMap title='jurisdiction'
                                             id='jurisdiction'
                                             location={this.props.location}
                                             updateQuery={this.props.updateQuery}
                                             closePopUp={this.closePopUp}/>}
              <div className='jurisdiction-summray'>
                {this.props.location.query[this.props.id]}
              </div>
            </div>
      );
    }
}

export default FilterJurisdiction;
