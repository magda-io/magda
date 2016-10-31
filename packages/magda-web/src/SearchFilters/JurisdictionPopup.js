import './JurisdictionPopup.css';
import DropDown from '../UI/DropDown';
import Filter from './Filter';
import getRegionTypes from '../dummyData/getRegionTypes';
import JurisdictionMap from './JurisdictionMap';
import FilterSearchBox from './FilterSearchBox';
import React from 'react'
import find from 'lodash.find';


const regionTypeOptions = getRegionTypes();

class JurisdictionPopup extends Filter {
    constructor(props) {
        super(props);
        /**
         * @type {object}
         * @property {object} activeRegionType current region type, contains an id and a vlaue, fro example, {id: 'LGA', value:'LGAs (Local Goverment Areas)'}
         */
         this.state={
             activeRegionType: regionTypeOptions[0],
         }
         this.selectRegionType = this.selectRegionType.bind(this);
    }

    selectRegionType(regionType){
      this.setState({
        activeRegionType: regionType
      })

      this.props.updateQuery({
          jurisdictionType: regionType.id
      });
    }
    render(){
        return (
            <div className='popup'>
              <div className='popup-inner'>
              <div className='popup-header clearfix'>
                <div className='col-xs-11'>
                  <h4 className='filter-title'>Location</h4>
                </div>
                <div className='col-xs-1'>
                  <button className='btn popup-close-btn' onClick={()=>this.props.closePopUp()}><i className='fa fa-times' aria-hidden='true'></i></button>
                </div>
              </div>
              <div className='popup-body clearfix'>
                  <div className='popup-tools row'>
                    <div className='col-sm-6'>
                      <FilterSearchBox allowMultiple={false}
                                       searchFilter={this.props.searchLocation}
                                       loadingProgress={this.props.loadingProgress}
                                       renderOption={this.props.renderOption}
                                       toggleOption={this.props.toggleOption}
                                       options={this.props.locationSearchResults}
                      />
                    </div>
                    <div className='col-sm-6'>
                        <DropDown options={regionTypeOptions}
                                  activeOption={find(regionTypeOptions, o=>o.id === this.props.location.query.jurisdictionType) || regionTypeOptions[0] }
                                  select={this.selectRegionType}
                        />
                    </div>
                  </div>
                  {this.props.locationInfoSummray}
                  <div className='popup-map'>
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
                  <div className='popup-footer clearfix'>
                    <button className='btn popup-cancel-btn' onClick={()=>this.props.closePopUp()} >Cancel</button>
                    <button className='btn popup-done-btn' onClick={()=>this.props.closePopUp()} >Done</button>
                  </div>
              </div>
            </div>
      );
    }
}

export default JurisdictionPopup;
