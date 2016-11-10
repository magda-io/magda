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

    // see Facet.renderOption(option, optionMax, callback, onFocus)
    // Here is only for mark up change
    renderOption(option, optionMax, callback, onFocus){
      return (
            <button type='button'
                    ref={b=>{if(b != null && onFocus === true){b.focus()}}}
                    className='btn-facet-option btn btn-facet-option__location'
                    onClick={this.props.toggleOption.bind(this, option, callback)}
                    title={option.geographyLabel}>
              <span className='btn-facet-option__name'>{option.geographyLabel} , {option.state}</span>
            </button>);
    }


    render(){
        return (
            <FacetWrapper onResetFacet={this.props.onResetFacet}
                          title={this.props.title}
                          activeOptions={[this.props.activeRegionId, this.props.activeRegionType]}
                          hasQuery={this.props.hasQuery}>
               <FacetSearchBox renderOption={this.renderOption}
                               options={this.props.facetSearchResults}
                               searchFacet={this.props.searchFacet}/>
               {this.props.activeOptions.map(r=><div className='active-location' key={r.geographyLabel + r.state}>{r.geographyLabel} {r.state}</div>)}
               <div className='preview'>
                     <RegionMap title='region'
                                id='region'
                                onClick={this.openPopup}
                                interaction={false}
                                activeRegionId={this.props.activeRegionId}
                                activeRegionType={this.props.activeRegionType}
                     />
               </div>
               {this.state.popUpIsOpen && <RegionPopup onFeatureClick={this.props.onFeatureClick}
                                                             closePopUp={this.closePopUp}
                                                             renderOption={this.renderOption}
                                                             searchFacet={this.props.searchFacet}
                                          />}
          </FacetWrapper>

      );
    }
}

export default FacetRegion;
