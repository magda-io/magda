import '../../node_modules/leaflet/dist/leaflet.css';
import './FacetRegion.css';
import React, { Component } from 'react';
import FacetHeader from './FacetHeader';
import RegionMap from './RegionMap';
import RegionPopup from './RegionPopup';
import FacetSearchBox from './FacetSearchBox';
import RegionSummary from './RegionSummary';
import defined from '../helpers/defined';
import {parseRegion} from '../helpers/api';

/*
* the region (location) facet facet, extends Facet class
*/
class FacetRegion extends Component {
    constructor(props) {
        super(props);
        this.renderOption = this.renderOption.bind(this);
        this.onToggleOption = this.onToggleOption.bind(this);
        this.onToggleOpen = this.onToggleOpen.bind(this);

        /**
         * @type {object}
         * @property {boolean} popUpIsOpen whether the popup window that shows the bigger map is open or not
         */
        this.state = {
            isOpen: false
        }
    }

    onToggleOpen(){
     this.setState({
       isOpen: !this.state.isOpen
     })
   }


    onToggleOption(option){
        this.props.onToggleOption(parseRegion(option));
    }

    // see Facet.renderOption(option, optionMax, onFocus)
    // Here is only for mark up change
    renderOption(option, onClick, optionMax, onFocus){
     let regionType = option.regionType;
      return (
            <button type='button'
                    ref={b=>{if(b != null && onFocus === true){b.focus()}}}
                    className='btn-facet-option btn btn-facet-option__location'
                    onClick={onClick.bind(this, option)}
                    title={option.regionName}>
              <span className='btn-facet-option__name'>{option.regionName}</span><br />
              <span className='btn-facet-option__detail'>
                {(defined(regionType) && defined(this.props.regionMapping[regionType])) ?
                  this.props.regionMapping[regionType].description : ''}
              </span>
            </button>);
    }

    render(){
        return (
            <div className="facet-wrapper">
               <FacetHeader onResetFacet={this.props.onResetFacet}
                     title={this.props.title}
                     activeOptions={[this.props.activeRegion]}
                     hasQuery={this.props.hasQuery}
                     onClick={this.onToggleOpen}/>
                 {this.state.isOpen && <RegionPopup onToggleOption={this.props.onToggleOption}
                              facetSearchResults={this.props.facetSearchResults}
                              closePopUp={this.onToggleOpen}
                              renderOption={this.renderOption}
                              searchFacet={this.props.searchFacet}
                              regionMapping={this.props.regionMapping}
                              activeRegion={this.props.activeRegion}
                  />}
          </div>

      );
    }
}

export default FacetRegion;
