import '../../node_modules/leaflet/dist/leaflet.css';
import Filter from './Filter';
import FilterHeader from './FilterHeader';
import LocationSearchBox from './LocationSearchBox';
import JurisdictionMap from './JurisdictionMap';
import L from 'leaflet';
import ozStates from '../dummyData/ozStates';
import React from 'react'
import getJsonp from '../getJsonp';

const statesData = ozStates();

class FilterJurisdiction extends Filter {
    constructor(props) {
        super(props);
        this.map = undefined;
        this.layer = undefined;
        this.closePopUp = this.closePopUp.bind(this);
        this.openPopup = this.openPopup.bind(this);
        this.onFeatureClick = this.onFeatureClick.bind(this);
        this.state={
            popUpIsOpen: false,
            searchText: '',
            locationSearchResults: [],
            mapData: {},
            locationInfo: {}
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
        let optionWithId = {
          id: option.suggestion.code
        }
        let allowMultiple = false;
        super.toggleFilter(optionWithId, allowMultiple);

        this.setState({
            locationInfo: option
        });
    }

    onFeatureClick(evt){
        this.props.updateQuery({
            jurisdiction: evt.feature.id
        });
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
                                                                 />
                                            </div>
                                            </div>}
              <div className='jurisdiction-summray'>
                {this.props.location.query[this.props.id]}
              </div>
            </div>
      );
    }
}

export default FilterJurisdiction;
