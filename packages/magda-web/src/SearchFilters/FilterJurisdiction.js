import '../../node_modules/leaflet/dist/leaflet.css';
import Filter from './Filter';
import FilterHeader from './FilterHeader';
import getJsonp from '../getJsonp';
import defined from '../defined';
import getRegionTypes from '../dummyData/getRegionTypes';
import JurisdictionMap from './JurisdictionMap';
import JurisdictionPopup from './JurisdictionPopup';
import LocationSearchBox from './LocationSearchBox';
import React from 'react'


const regionTypeOptions = getRegionTypes();

class FilterJurisdiction extends Filter {
    constructor(props) {
        super(props);
        this.openPopup = this.openPopup.bind(this);
        this.closePopUp = this.closePopUp.bind(this);
        this.onFeatureClick = this.onFeatureClick.bind(this);
        this.getLocationInfo = this.getLocationInfo.bind(this);
        this.searchLocation = this.searchLocation.bind(this);

        this.state={
            popUpIsOpen: false,
            searchText: '',
            locationSearchResults: [],
            locationInfo: undefined,
            activeRegionType: regionTypeOptions[0],
            popupSearchText: ''
        }
    }

    componentWillMount(){
        this.getLocationInfo();
    }

    searchLocation(text){
        getJsonp(`http://www.censusdata.abs.gov.au/census_services/search?query=${text || ' '}&cycle=2011&results=15&type=jsonp&cb=`).then(data=>{
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
        this.props.updateQuery({
            jurisdiction: [],
            jurisdictionType: []
        });

        this.setState({
            locationInfo: null,
        });

    }

    toggleFilter(option, callback){
        this.props.updateQuery({
            jurisdiction: option.suggestion.code,
            jurisdictionType: option.suggestion.type
        });

        this.setState({
            locationInfo: option.suggestion,
        });

        if(defined(callback) && typeof callback ==='function'){
          callback();
        }
    }

    onFeatureClick(evt, regionType){
        this.props.updateQuery({
            jurisdiction: evt,
            jurisdictionType: regionType
        });
        this.getLocationInfo();
    }

    getLocationInfoInPlainText(){
        let result = this.state.locationInfo;
        if(!result){
          return null;
        }
        if(result.geographyLabel){
          return (<span>{result.geographyLabel}, {result.stateLabel}, {result.typeLabel}, {result.type}</span>);
        }
        if(result.displayFieldName){
          let propName = result.displayFieldName;
          return <span>{result.attributes[propName]}</span>;
        }
        return null;
    }

    getLocationInfo(){
        let jurisdiction = this.props.location.query.jurisdiction;
        let jurisdictionType = this.props.location.query.jurisdictionType;
        // let idRegionTypeMap = {
        //   SA1: [26, 'MAIN'],
        //   SA2: [27, 'MAIN'],
        //   SA3: [28, 'CODE'],
        //   SA4: [29, 'CODE']
        // };

        if(jurisdiction && jurisdictionType){
          // getJSON(`https://nationalmap.gov.au/proxy/_0d/http://www.censusdata.abs.gov.au/arcgis/rest/services/FIND/MapServer/find?f=json&searchText=${jurisdiction}&contains=false&returnGeometry=false&layers=${idRegionTypeMap[jurisdictionType][0]}&searchFields=${jurisdictionType}_${idRegionTypeMap[jurisdictionType][1]}&sr=3857`).then(data=>{
          //   if(data.results && data.results.length > 0 ){
          //     this.setState({
          //         locationInfo: data.results[0]
          //     });
          //   }
          // }, error =>{console.log(error)});
        }
    }

    selectRegionType(regionType){
      this.setState({
        activeRegionType: regionType
      })
    }


    render(){
        return (
            <div className='filter jurisdiction'>
              <FilterHeader query={this.props.location.query[this.props.id]}
                            resetFilter={this.resetFilter}
                            title={this.props.title}/>

              <LocationSearchBox options={this.state.locationSearchResults}
                                 toggleFilter={this.toggleFilter}
                                 searchLocation={this.searchLocation}
              />

              <div className='filter-jurisdiction--summray'>
                {this.getLocationInfoInPlainText()}
              </div>

              <div className='preview'>
                    <JurisdictionMap title='jurisdiction'
                                     id='jurisdiction'
                                     location={this.props.location}
                                     updateQuery={this.props.updateQuery}
                                     onClick={this.openPopup}
                                     interaction={false}
                                     locationInfo={this.state.locationInfo}
                    />
              </div>

              {this.state.popUpIsOpen && <JurisdictionPopup locationSearchResults={this.state.locationSearchResults}
                                                            updateQuery={this.props.updateQuery}
                                                            onFeatureClick={this.props.onFeatureClick}
                                                            locationInfo={this.state.locationInfo}
                                                            location={this.props.location}
                                                            closePopUp={this.closePopUp}
                                                            toggleFilter={this.toggleFilter}
                                                            searchLocation={this.searchLocation}
                                                            />}

            </div>
      );
    }
}

export default FilterJurisdiction;
