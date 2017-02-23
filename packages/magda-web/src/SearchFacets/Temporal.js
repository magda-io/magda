import {setDateFrom, setDateTo, resetDateFrom, resetDateTo} from '../actions/results';
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
    this.props.updateQuery({
      dateFrom: defined(datesArray[0]) ? datesArray[0]: undefined,
      dateTo: defined(datesArray[1]) ? datesArray[1]: undefined,
      page: undefined
    });
    this.props.dispatch(setDateTo(datesArray[1]));
    this.props.dispatch(setDateFrom(datesArray[0]));
  }

  onResetTemporalFacet(){
    this.props.updateQuery({
      dateFrom: undefined,
      dateTo: undefined,
      page: undefined
    });
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
      />
    );
  }
}

Temporal.propTypes = {
  temporalOptions: React.PropTypes.array,
  activeDateFrom: React.PropTypes.number,
  activeDateTo: React.PropTypes.number,
  updateQuery: React.PropTypes.func.isRequired
}


function mapStateToProps(state) {
  let { results} = state;
  return {
    temporalOptions: results.temporalOptions,
    activeDateFrom: results.activeDateFrom,
    activeDateTo: results.activeDateTo,
  }
}

export default connect(mapStateToProps)(Temporal);
