import 'leaflet/dist/leaflet.css';
import './FacetRegion.css';
import React, { Component } from 'react';
import DropDown from '../../UI/DropDown';
import FacetHeader from './FacetHeader';
import RegionMap from './RegionMap';
import RegionSearchBox from './RegionSearchBox';
import defined from '../../helpers/defined';
import RegionSummray from './RegionSummary';
import Button from 'muicss/lib/react/button';
/*
* the region (location) facet facet, extends Facet class
*/
class FacetRegion extends Component {
    constructor(props) {
        super(props);
        this.renderOption = this.renderOption.bind(this);
        this.onToggleOption = this.onToggleOption.bind(this);
        this.onFeatureClick = this.onFeatureClick.bind(this);
        this.onApplyFilter = this.onApplyFilter.bind(this);
        /**
         * @type {object}
         * @property {boolean} popUpIsOpen whether the popup window that shows the bigger map is open or not
         */
        this.state = {
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

    onToggleOption(option){
        this.setState({
          _activeRegion: option
        })
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
    }


    onApplyFilter(){
      this.props.onToggleOption(this.state._activeRegion);
    }
    // see Facet.renderOption(option, optionMax, onFocus)
    // Here is only for mark up change
    renderOption(option, onClick, optionMax, onFocus){
     let regionType = option.regionType;
      return (
            <Button className='btn-facet-option mui-btn btn-facet-option__location'
                    onClick={onClick.bind(this, option)}
                    title={option.regionName}>
              <div className='facet-option__region-name'>{option.regionName}</div>
              <div className='facet-option__region-type'>
                {(defined(regionType) && defined(this.props.regionMapping[regionType])) ?
                  this.props.regionMapping[regionType].description : ''}
              </div>
            </Button>);
    }

    renderBox(){
        return (<div className='facet-body facet-region'>
                    <RegionSearchBox renderOption={this.renderOption}
                                    onToggleOption={this.onToggleOption}
                                    options={this.props.facetSearchResults}
                                    searchFacet={this.props.searchFacet}/>
                    <div className='facet-region__preview'>
                        <RegionMap title='region'
                               id='region'
                               interaction={true}
                               region={this.state._activeRegion}
                               regionMapping={this.props.regionMapping}
                               onClick={this.onFeatureClick}
                        />
                    </div>
                    <RegionSummray regionMapping={this.props.regionMapping}
                                 region={this.state._activeRegion}/>
                    <div className='facet-footer'>
                        <Button variant="flat" onClick={this.props.onResetFacet}> Clear </Button>
                        <Button variant="flat" onClick={this.onApplyFilter}> Apply </Button>
                    </div>
                </div>)
    }

    render(){
        return (
            <div className='facet-wrapper'>
               <FacetHeader onResetFacet={this.props.onResetFacet}
                     title={this.props.title}
                     activeOptions={[this.props.activeRegion]}
                     hasQuery={this.props.hasQuery}
                     onClick={this.props.toggleFacet}/>
                 {this.props.isOpen && this.renderBox()}
          </div>

      );
    }
}

export default FacetRegion;
