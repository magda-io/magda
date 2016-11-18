import '../../node_modules/leaflet/dist/leaflet.css';
import './FacetRegion.css';
import React, { Component } from 'react';
import FacetWrapper from './FacetWrapper';
import RegionMap from './RegionMap';
import RegionPopup from './RegionPopup';
import FacetSearchBox from './FacetSearchBox';
import defined from '../helpers/defined';

/*
* the region (location) facet facet, extends Facet class
*/
class FacetRegion extends Component {
    constructor(props) {
        super(props);
        this.openPopup = this.openPopup.bind(this);
        this.closePopUp = this.closePopUp.bind(this);
        this.renderOption = this.renderOption.bind(this);

        /**
         * @type {object}
         * @property {boolean} popUpIsOpen whether the popup window that shows the bigger map is open or not
         */
        this.state={
            popUpIsOpen: false
        }
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


    // see Facet.renderOption(option, optionMax, onFocus)
    // Here is only for mark up change
    renderOption(option, onClick, onFocus){
      return (
            <button type='button'
                    ref={b=>{if(b != null && onFocus === true){b.focus()}}}
                    className='btn-facet-option btn btn-facet-option__location'
                    onClick={onClick.bind(this, option)}
                    title={option.geographyLabel}>
              <span className='btn-facet-option__name'>{option.geographyLabel} , {option.state}</span>
            </button>);
    }


    render(){
      let activeRegion = this.props.activeRegion;
        return (
            <FacetWrapper onResetFacet={this.props.onResetFacet}
                          title={this.props.title}
                          activeRegion={[this.props.activeRegionId, this.props.activeRegionType]}
                          hasQuery={this.props.hasQuery}>
               <FacetSearchBox renderOption={this.renderOption}
                               onToggleOption={this.props.onToggleOption}
                               options={this.props.facetSearchResults}
                               searchFacet={this.props.searchFacet}/>
               {activeRegion && <div className='active-region' key={activeRegion.name}>{activeRegion.name}</div>}
               <div className='preview'>
                  <RegionMap title='location'
                             id='location'
                             onClick={this.openPopup}
                             interaction={false}
                             region={activeRegion}
                             regionMapping={this.props.regionMapping}
                     />
               </div>
               <div className={this.state.popUpIsOpen ? '' : 'sr-only'}>
                 <RegionPopup onToggleOption={this.props.onToggleOption}
                              facetSearchResults={this.props.facetSearchResults}
                              closePopUp={this.closePopUp}
                              renderOption={this.renderOption}
                              onToggleOption={this.props.onToggleOption}
                              searchFacet={this.props.searchFacet}
                              regionMapping={this.props.regionMapping}
                              activeRegion={this.props.activeRegion}
                  />
                </div>
          </FacetWrapper>

      );
    }
}

export default FacetRegion;
