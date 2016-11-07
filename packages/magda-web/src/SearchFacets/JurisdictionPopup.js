import './JurisdictionPopup.css';
import DropDown from '../UI/DropDown';
import Facet from './FacetWrapper';
import getRegionTypes from '../dummyData/getRegionTypes';
import JurisdictionMap from './JurisdictionMap';
import FacetSearchBox from './FacetSearchBox';
import React from 'react'


const regionTypeOptions = getRegionTypes();

class JurisdictionPopup extends Facet {
    constructor(props) {
        super(props);
        /**
         * @type {object}
         * @property {object} activeRegionType current region type, contains an id and a vlaue, fro example, {id: 'LGA', value:'LGAs (Local Goverment Areas)'}
         */
         this.state={
             regionType: regionTypeOptions[0],

         }
         this.selectRegionType = this.selectRegionType.bind(this);
    }

    selectRegionType(regionType){
      this.setState({
        regionType: regionType
      })
    }

    render(){
        return (
            <div className='popup'>
              <div className='popup-inner'>
              <div className='popup-header clearfix'>
                <div className='col-xs-11'>
                  <h4 className='facet-title'>Location</h4>
                </div>
                <div className='col-xs-1'>
                  <button className='btn popup-close-btn' onClick={()=>this.props.closePopUp()}><i className='fa fa-times' aria-hidden='true'></i></button>
                </div>
              </div>
              <div className='popup-body clearfix'>
                  <div className='popup-tools row'>
                    <div className='col-sm-6'>
                      <FacetSearchBox renderOption={this.props.renderOption}
                                      options={this.props.facetSearchResults}
                                      searchFacet={this.props.searchFacet}/>

                    </div>
                    <div className='col-sm-6'>
                        <DropDown options={regionTypeOptions}
                                  activeOption={this.props.activeRegionType}
                                  select={this.selectRegionType}
                        />
                    </div>
                  </div>
                  <div className='popup-summary'>{this.props.locationInfoSummray}</div>
                  <div className='popup-map'>
                    <JurisdictionMap title='jurisdiction'
                                     id='jurisdiction'
                                     interaction={true}
                                     activeRegionId={this.props.activeRegionId}
                                     activeRegionType={this.props.activeRegionType}
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
