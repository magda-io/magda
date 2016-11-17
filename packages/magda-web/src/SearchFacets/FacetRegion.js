import '../../node_modules/leaflet/dist/leaflet.css';
import './FacetRegion.css';
import React, { Component } from 'react';
import FacetWrapper from './FacetWrapper';
import RegionMap from './RegionMap';
import RegionPopup from './RegionPopup';
import FacetSearchBox from './FacetSearchBox';

/*
* the region (location) facet facet, extends Facet class
*/
class FacetRegion extends Component {
    constructor(props) {
        super(props);
        this.openPopup = this.openPopup.bind(this);
        this.closePopUp = this.closePopUp.bind(this);
        this.onFeatureClick = this.onFeatureClick.bind(this);
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

    /**
     * activate a region option by clicking a region on the map
     * @param {string} regionCode, region code
     * @param {string} regionType, region type
     */
    onFeatureClick(feature){
        // vector tiles and ABS API has different format for the region object,
        // need to find a way to unify this
        this.props.toggleOption(feature);
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
               {activeRegion && <div className='active-region' key={activeRegion.geographyLabel + activeRegion.state}>{activeRegion.geographyLabel} {activeRegion.state}</div>}
               <div className='preview'>
                     <RegionMap title='location'
                                id='location'
                                onClick={this.openPopup}
                                interaction={false}
                                activeRegionId={this.props.activeRegion['regionId']}
                                activeRegionType={this.props.activeRegion['regionType']}
                                regionMapping={this.props.regionMapping}

                     />
               </div>
               {this.state.popUpIsOpen && <RegionPopup onFeatureClick={this.props.onFeatureClick}
                                                       facetSearchResults={this.props.facetSearchResults}
                                                       closePopUp={this.closePopUp}
                                                       renderOption={this.renderOption}
                                                       onToggleOption={this.props.onToggleOption}
                                                       searchFacet={this.props.searchFacet}
                                                       regionMapping={this.props.regionMapping}
                                          />}
          </FacetWrapper>

      );
    }
}

export default FacetRegion;
