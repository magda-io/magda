import React, { Component } from 'react';
import find from 'lodash.find';

class Filter extends Component {
  constructor(props) {
    super(props);
    this.toggleFilter=this.toggleFilter.bind(this);
    this.handleChange=this.handleChange.bind(this);
    this.clearSearch=this.clearSearch.bind(this);

    this.state={
      searchText: '',
      resultConditions: []
    }
  }

  toggleFilter(option, i){
    this.props.toggleFilter(option, i, this.props.filter.id);
  }

  clearSearch(){
    this.setState({
      searchText: ''
    })
  }

  handleChange(e){
    this.setState({
      searchText: e.target.value
    })

    //  filter inactive options
    let optionsToSearch = this.props.filter.options.filter(option=>!this.checkActiveOption(option));
    let resultConditions = [];

    if(optionsToSearch.forEach((c)=>{
      if(c.name.toLowerCase().indexOf(e.target.value)!==-1){
        resultConditions.push(c);
        this.setState({
          resultConditions: resultConditions
        })
      }
    }));
  }

  renderCondition(option, i){
    return <button type='button' className={`${this.checkActiveOption(option) ? 'btn-primary' : 'btn-default'} btn`} onClick={this.toggleFilter.bind(this, option, i)}>{option.name} {option.count}</button>;
  }

  checkActiveOption(option){
    return find(this.props.activeFilter.options, f=>option.id === f.id);
  }

  render() {
    return (
      <div>
        <h4>{this.props.filter.name}</h4>
        <div className='filter-selected'>
          {this.props.filter.options.map((option, i)=>
              this.checkActiveOption(option) && <div key={i}>{this.renderCondition(option, i)}</div>
          )}
        </div>

        <form className='form-inline'>
          <input className='form-control' type="text" value={this.state.searchText} onChange={this.handleChange}/>
          <button type='button' onClick={this.clearSearch}>clear</button>
        </form>

        <div className='filtered-options'>
          {this.state.searchText.length !== 0 && this.state.resultConditions.map((option, i)=>
              <div key={i}>{this.renderCondition(option, i)}</div>
          )}
        </div>
        <div>
          {this.state.searchText.length === 0 &&  this.props.filter.options.map((option, i)=>
            !this.checkActiveOption(option) && <div key={i}>{this.renderCondition(option, i)}</div>
          )}
        </div>
      </div>
    );
  }
}
Filter.propTypes = {filter: React.PropTypes.object, activeFilter: React.PropTypes.object, title: React.PropTypes.string};
Filter.defaultProps = {filter: {}, activeFilter: {}};

export default Filter;
