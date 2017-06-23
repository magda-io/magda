import {setDateFrom, setDateTo, resetDateFrom, resetDateTo} from '../actions/datasetSearchActions';
import {connect} from 'react-redux';
import defined from '../helpers/defined';
import FacetTemporal from './FacetTemporal';
import React, { Component } from 'react';

class Temporal extends Component {

  constructor(props) {
    super(props);
    this.onResetTemporalFacet = this.onResetTemporalFacet.bind(this);
    this.onToggleTemporalOption = this.onToggleTemporalOption.bind(this);
  }

  onToggleTemporalOption(datesArray){
    const dateTo = datesArray[1] ? datesArray[1] : undefined;
    const dateFrom = datesArray[0] ? datesArray[0] : undefined;
    this.props.updateQuery({
      dateFrom: dateFrom,
      dateTo: dateTo,
      page: undefined
    });
    this.props.dispatch(setDateTo(dateTo));
    this.props.dispatch(setDateFrom(dateFrom));
  }

  onResetTemporalFacet(){
    this.props.updateQuery({
      dateFrom: undefined,
      dateTo: undefined,
      page: undefined
    });
    this.props.toggleFacet();
    // dispatch event
    this.props.dispatch(resetDateFrom());
    this.props.dispatch(resetDateTo());
  }


  render() {
    return (
      <FacetTemporal title='date range'
                    id='temporal'
                    hasQuery={(defined(this.props.activeDateFrom) || defined(this.props.activeDateTo))}
                    options={this.props.temporalOptions}
                    activeDates={[this.props.activeDateFrom, this.props.activeDateTo]}
                    onToggleOption={this.onToggleTemporalOption}
                    onResetFacet={this.onResetTemporalFacet}
                    toggleFacet={this.props.toggleFacet}
                    isOpen={this.props.isOpen}
      />
    );
  }
}

function mapStateToProps(state) {
  let { datasetSearch} = state;
  return {
    temporalOptions: datasetSearch.temporalOptions,
    activeDateFrom: datasetSearch.activeDateFrom,
    activeDateTo: datasetSearch.activeDateTo,
  }
}

export default connect(mapStateToProps)(Temporal);
