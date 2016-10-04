import './Filter.css';
import FilterHeader from './FilterHeader';
import FilterSearchBox from './FilterSearchBox';
import find from 'lodash.find';
import getJSON from'../getJSON';
import React, { Component } from 'react';
import maxBy from 'lodash.maxby';
const DEFAULTSIZE = 8;

class Filter extends Component {
  constructor(props) {
    super(props);
    this.state={
      searchText: '',
      isOpen: false,
      allOptions: []
    }
    this.handleChange = this.handleChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.renderCondition = this.renderCondition.bind(this);
    this.resetFilter = this.resetFilter.bind(this);
    this.toggleFilter= this.toggleFilter.bind(this);
    this.toggleOpen = this.toggleOpen.bind(this);
    this.getAllOptions = this.getAllOptions.bind(this);
  }

  componentDidMount(){
    window.addEventListener('keydown', (event)=>{
      if(event.which === 27){
        this.clearSearch();
      }
    })
  }

  handleChange(e){
    this.setState({
      searchText: e.target.value
    });
    this.getAllOptions();
  }

  toggleFilter(option, allowMultiple){
    let currrentFilters;
    if (allowMultiple === true){
      // force filters into array
      if (!this.props.location.query[this.props.id]){
        currrentFilters = [];
      }
      // if already array
      else if(Array.isArray(this.props.location.query[this.props.id])){
        currrentFilters = this.props.location.query[this.props.id];
      }
      // if only one item, create array
      else{
        currrentFilters = [this.props.location.query[this.props.id]];
      }
      // add or remove from array
      if(currrentFilters.indexOf(option.value) > -1){
        currrentFilters.splice(currrentFilters.indexOf(option.value), 1);
      } else{
        currrentFilters.push(option.value)
      }

      this.props.updateQuery({
        [this.props.id]: currrentFilters
      });

    } else{
      this.props.updateQuery({
        [this.props.id]: option.value
      });
    }
  }

  resetFilter(){
    this.props.updateQuery({[this.props.id]: []});
  }

  clearSearch(){
    this.setState({
      searchText: ''
    })
  }

  toggleOpen(){
    this.setState({
      isOpen: !this.state.isOpen
    })
  }

  getAllOptions(){
    let keyword = this.props.location.query.q.split(' ').join('+');
    // needs to use [this.props.id] when format facet is ready
    getJSON(`http://thunderer.it.csiro.au:9000/facets/publisher/options/search?query=${keyword}`).then((data)=>{
      this.setState({
        allOptions: data,
      })
    }, (err)=>{console.warn(err)});
  }

  renderCondition(option, highlight){
    let allowMultiple = true;

    if(!option){
      return null;
    }
    // return (
    //       <button type='button'
    //               className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-option btn`}
    //               onClick={this.toggleFilter.bind(this, option, true)}
    //               title={option.value}>
    //       { highlight ?
    //         <span className='option-name' dangerouslySetInnerHTML={this.highlightSearchedText(option.value)}/> :
    //         <span className='option-name'>{option.value}</span>
    //       }
    //       <span className='option-count'>{option.hitCount}</span>
    //       {this.checkActiveOption(option) ? <i className="fa fa-times" aria-hidden="true"></i> : ''}
    //       </button>);
    let divStyle = {
      width: +option.hitCount/maxBy(this.props.options, 'hitCount').hitCount * 200 + 'px'
    }

    return(
    <button type='button' className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-facet-option btn`}           onClick={this.toggleFilter.bind(this, option, allowMultiple)}>
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}</span>
      <span className='btn-facet-option__action'><i className={`fa fa-${this.checkActiveOption(option) ? 'times' : 'plus'}`}/></span>
      <span className='btn-facet-option__count'>{option.hitCount}</span>

    </button>);

  }

  highlightSearchedText(text){
    if(this.state.searchText.length>0){
      // need to escape special chars
      let highlighted = new RegExp('(' + RegExp.escape(this.state.searchText) + ')', 'gi');
      let modifiedText = text.replace(highlighted, '<strong>$1</strong>');
      return {
        __html: modifiedText
      }
    }
    return {
      __html: ''
    }
  }

  checkActiveOption(option){
    let query = this.props.location.query;
    let filter = query[this.props.id];

    if(!filter){
      return false;
    }
    /// if query is already array, check if item exist in array already
    if(Array.isArray(this.props.location.query[this.props.id])){
      if(filter.indexOf(option.value) < 0){
        return false;
      }
      return true;
    }
    // if query is string, check directly
    if(filter === option.value){
      return true;
    }
    return false;
  }

  getActiveOption(){
    let query = this.props.location.query;
    let filter = query[this.props.id];
    if(!filter){
      return null;
    }
    if(Array.isArray(this.props.location.query[this.props.id])){
      return filter.map(p=>{
        return <div key={p}>{this.renderCondition(find(this.props.options, o=>o.value === p))}</div>;
      });
    }else{
      return this.renderCondition(find(this.props.options, o=>o.value === filter))
    }
  }

  render() {
    let inactiveOptions = this.props.options.filter(o=>!this.checkActiveOption(o)).sort((o1, o2)=>o2.hitCount - o1.hitCount);
    let tempSize =  DEFAULTSIZE > inactiveOptions.length ? inactiveOptions.length : DEFAULTSIZE;
    let size = this.state.isOpen ? inactiveOptions.length : tempSize;
    let overflow = inactiveOptions.length - tempSize;
    return (
      <div className='filter'>
        <FilterHeader query={this.props.location.query[this.props.id]}
                      resetFilter={this.resetFilter}
                      title={this.props.title}/>

        <FilterSearchBox options={this.state.allOptions}
                         toggleFilter={this.toggleFilter}
                         searchText={this.state.searchText}
                         clearSearch={this.clearSearch}
                         handleChange={this.handleChange}
                         renderCondition={this.renderCondition}
                         allowMultiple={true}
        />

        {this.getActiveOption()}

        <div className='other-options'>
          {inactiveOptions.slice(0, size).map((option, i)=>
                <div key={i}>{this.renderCondition(option)}</div>
          )}
        </div>
        {
          // this.state.searchText.length > 0 ?
          // <button className='btn btn-reset' onClick={this.clearSearch}> Clear search</button> :
          // (overflow > 0 ? <button onClick={this.toggleOpen} className='btn btn-reset'>{this.state.isOpen ? `Show less ${this.props.title}s` : `Show ${overflow} more`}</button> : null)
        }
      </div>
    );
  }
}
Filter.propTypes = {options: React.PropTypes.array,
                    title: React.PropTypes.string,
                    toggleFilter: React.PropTypes.func,
                    id: React.PropTypes.string,
                    updateQuery: React.PropTypes.func};
Filter.defaultProps = {options: []};

RegExp.escape = function(str)
{
  var specials = new RegExp("[.*+?|()\\[\\]{}\\\\]", "g"); // .*+?|()[]{}\
  return str.replace(specials, "\\$&");
}

export default Filter;
