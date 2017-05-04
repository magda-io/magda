import '../../node_modules/leaflet/dist/leaflet.css';
import './FacetRegion.css';
import React, { Component } from 'react';
import DropDown from '../UI/DropDown';
import FacetHeader from './FacetHeader';
import RegionMap from './RegionMap';
import RegionPopup from './RegionPopup';
import FacetSearchBox from './FacetSearchBox';
import RegionSummary from './RegionSummary';
import defined from '../helpers/defined';
import {parseRegion} from '../helpers/api';
import RegionSummray from './RegionSummary';

/*
* the region (location) facet facet, extends Facet class
*/
class FacetRegion extends Component {
    constructor(props) {
        super(props);
        this.renderOption = this.renderOption.bind(this);
        this.onToggleOption = this.onToggleOption.bind(this);
        this.onToggleOpen = this.onToggleOpen.bind(this);
        this.onFeatureClick = this.onFeatureClick.bind(this);
        this.selectRegionType = this.selectRegionType.bind(this);

        /**
         * @type {object}
         * @property {boolean} popUpIsOpen whether the popup window that shows the bigger map is open or not
         */
        this.state = {
            isOpen: false,
            _activeRegion: {
               regionId: undefined,
               regionType: undefined
             }
        }
    }

    componentWillReceiveProps(nextProps){
        if(nextProps.activeRegion !== this.state._activeRegion){
            this.setState({
                _activeRegion: nextProps.activeRegion
            })
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

    onFeatureClick(feature){
      let regionMapping= this.props.regionMapping;
      let regionType = this.state._activeRegion.regionType;

      let regionProp = regionMapping[regionType].regionProp;
      let nameProp = regionMapping[regionType].nameProp;
      const region = {
          regionType: regionType,
          regionId: feature.properties[regionProp],
          regionName: feature.properties[nameProp]
        };

      this.setState({
        _activeRegion: region
      });
      this.props.onToggleOption(region);

    }

    selectRegionType(regionType){
        this.setState({
            _activeRegion: Object.assign({}, this.state._activeRegion, {regionType: regionType.id})
        })
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

    getDropDownOptions(){
      let ids = Object.keys(this.props.regionMapping);
      return ids.map(id=> ({
        id,
        value: this.props.regionMapping[id].description
      }))
    }

    getActiveRegionType(){
      let region = this.state._activeRegion;
      let regionType = "";
      if(this.props.regionMapping){
        if(defined(region.regionType) && this.props.regionMapping[region.regionType] && this.props.regionMapping[region.regionType].description){
          regionType = this.props.regionMapping[region.regionType].description
        }
      }
      return regionType;
    }


    renderBox(){
        return (<div className="facet-body">
                    <FacetSearchBox renderOption={this.renderOption}
                                    onToggleOption={this.onToggleOption}
                                    options={this.props.facetSearchResults}
                                    searchFacet={this.props.searchFacet}/>
                    <button className="btn btn-reset" onClick={this.props.onResetFacet}> Clear </button>
                    {defined(this.props.regionMapping) &&
                                <DropDown activeOption={this.getActiveRegionType()}
                                          options={this.getDropDownOptions()}
                                          select={this.selectRegionType}/>
                      }
                    <RegionSummray regionMapping={this.props.regionMapping} 
                                 region={this.state._activeRegion}/>
                    <div className='facet-region__preview'>
                        <RegionMap title='region'
                               id='region'
                               interaction={true}
                               region={this.state._activeRegion}
                               regionMapping={this.props.regionMapping}
                               onClick={this.onFeatureClick}
                        />
                    </div>
                </div>)
    }

    render(){
        return (
            <div className="facet-wrapper">
               <FacetHeader onResetFacet={this.props.onResetFacet}
                     title={this.props.title}
                     activeOptions={[this.props.activeRegion]}
                     hasQuery={this.props.hasQuery}
                     onClick={this.onToggleOpen}/>
                 {this.state.isOpen && this.renderBox()}
          </div>

      );
    }
}

export default FacetRegion;
