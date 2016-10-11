import DropDown from '../DropDown';
import Filter from './Filter';
import FilterHeader from './FilterHeader';
import getJSON from '../getJSON';
import getJsonp from '../getJsonp';
import getRegionTypes from '../dummyData/getRegionTypes';
import JurisdictionMap from './JurisdictionMap';
import LocationSearchBox from './LocationSearchBox';
import React from 'react'


const regionTypeOptions = getRegionTypes();

class JurisdictionPopup extends Filter {
    constructor(props) {
        super(props);
        this.state={
            searchText: '',
            locationInfo: undefined,
        }
    }

    componentWillMount(){
        this.getLocationInfo();
    }

    handleChange(e){
        this.setState({
            searchText: e.target.value
        });


    }


    closePopUp(){

    }

    toggleFilter(option){

    }

    selectRegionType(regionType){
      this.setState({
        activeRegionType: regionType
      })
    }


    render(){
        return (
            <div className='popup'>
              <div className='popup-inner'>
                  <div className='popup-header row'>
                    <div className='col-xs-11'>
                      <h4 className='filter-title'>Location</h4>
                    </div>
                    <div className='col-xs-1'>
                      <button className='btn' onClick={this.closePopUp}><i className='fa fa-times' aria-hidden='true'></i></button>
                    </div>
                  </div>
                  <div className='popup-tools row'>
                    <div className='col-sm-6'>
                        <LocationSearchBox options={this.props.locationSearchResults}
                                           toggleFilter={this.toggleFilter}
                                           searchText={this.state.searchText}
                                           clearSearch={this.props.clearSearch}
                                           handleChange={this.handleChange}
                        />
                    </div>
                    <div className='col-sm-6'>
                        <DropDown options={regionTypeOptions}
                                  activeOption={this.state.activeRegionType}
                                  select={this.selectRegionType}
                        />
                    </div>
                  </div>
                  <JurisdictionMap title='jurisdiction'
                                   id='jurisdiction'
                                   location={this.props.location}
                                   updateQuery={this.props.updateQuery}
                                   onClick={this.props.onFeatureClick}
                                   interaction={true}
                                   locationInfo={this.props.locationInfo}
                  />
              </div>
            </div>
      );
    }
}

export default JurisdictionPopup;
