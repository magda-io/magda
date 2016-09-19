import '../../node_modules/leaflet/dist/leaflet.css';
import Filter from './Filter';
import FilterHeader from './FilterHeader';
import LocationSearchBox from './LocationSearchBox';
import JurisdictionMap from './JurisdictionMap';
import L from 'leaflet';
import React from 'react'
import getJsonp from '../getJsonp';
import getJSON from '../getJSON';



class FilterJurisdiction extends Filter {
    constructor(props) {
        super(props);
        this.map = undefined;
        this.layer = undefined;
        this.closePopUp = this.closePopUp.bind(this);
        this.openPopup = this.openPopup.bind(this);
        this.onFeatureClick = this.onFeatureClick.bind(this);
        this.getLocationInfo = this.getLocationInfo.bind(this);
        this.state={
            popUpIsOpen: false,
            searchText: '',
            locationSearchResults: [],
            mapData: {},
            locationInfo: {},
            jurisdictionType: 'SA1'
        }
    }

    componentWillMount(){
        this.getLocationInfo();
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


    openPopup(){
        this.setState({
            popUpIsOpen: true
        });
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
        this.props.updateQuery({
            jurisdiction: option.suggestion.code,
            jurisdictionType: option.suggestion.type
        });

        this.setState({
            locationInfo: option.suggestion,
            jurisdictionType: option.suggestion.type
        });
    }

    onFeatureClick(evt){
        this.props.updateQuery({
            jurisdiction: evt.feature.id,
            jurisdictionType: this.state.jurisdictionType
        });
        this.getLocationInfo();
    }

    getLocationInfoInPlainText(){
        let result = this.state.locationInfo;
        if(!result){
          return null;
        }
        return (`${result.geographyLabel}, ${result.stateLabel}, ${result.typeLabel}, ${result.type}`);
    }

    getLocationInfo(){
        let jurisdiction = this.props.location.query.jurisdiction;
        let jurisdictionType = this.props.location.query.jurisdictionType;
        getJSON(`https://nationalmap.gov.au/proxy/_0d/http://www.censusdata.abs.gov.au/arcgis/rest/services/FIND/MapServer/find?f=json&searchText=${jurisdiction}&contains=false&returnGeometry=false&layers=27&searchFields=${jurisdictionType}&sr=3857`).then(data=>{
            this.setState({
                locationInfo: data.results[0]
            });
        }, error =>{console.log(error)});
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
              />
              <div className='preview'>
                    <JurisdictionMap title='jurisdiction'
                                     id='jurisdiction'
                                     location={this.props.location}
                                     updateQuery={this.props.updateQuery}
                                     onClick={this.openPopup}
                                     interaction={false}
                                     locationInfo={this.state.locationInfo}
                                     jurisdictionType={this.state.jurisdictionType}
                                     />
              </div>

              {this.state.popUpIsOpen && <div className='popup'>
                                            <div className='popup-inner'>
                                                <button className='btn' onClick={this.closePopUp}>
                                                    Close
                                                </button>
                                                <JurisdictionMap title='jurisdiction'
                                                                 id='jurisdiction'
                                                                 location={this.props.location}
                                                                 updateQuery={this.props.updateQuery}
                                                                 onClick={this.onFeatureClick}
                                                                 interaction={true}
                                                                 locationInfo={this.state.locationInfo}
                                                                 jurisdictionType={this.state.jurisdictionType}
                                                                 />
                                            </div>
                                            </div>}
              <div className='jurisdiction-summray'>
                {this.getLocationInfoInPlainText()}
              </div>
            </div>
      );
    }
}

export default FilterJurisdiction;
