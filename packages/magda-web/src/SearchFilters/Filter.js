import './Filter.css';
import FilterHeader from './FilterHeader';
import FilterSearchBox from './FilterSearchBox';
import find from 'lodash.find';
import getJSON from'../getJSON';
import React, { Component } from 'react';
import maxBy from 'lodash.maxby';
import checkActiveOption from '../checkActiveOption';
import toggleQuery from '../toggleQuery';
import defined from '../defined';
const DEFAULTSIZE = 5;

class Filter extends Component {
  constructor(props) {
    super(props);
    this.state={
      isOpen: false,
      options: [],
      loadingProgress: 0
    }
    this.searchFilter = this.searchFilter.bind(this);
    this.renderCondition = this.renderCondition.bind(this);
    this.resetFilter = this.resetFilter.bind(this);
    this.toggleFilter= this.toggleFilter.bind(this);
    this.toggleOpen = this.toggleOpen.bind(this);
    this.searchFromAllOptions = this.searchFromAllOptions.bind(this);
    this.updateProgress = this.updateProgress.bind(this);

  }

  componentDidMount(){
    window.addEventListener('keydown', (event)=>{
      if(event.which === 27){
        this.clearSearch();
      }
    });

  }

  searchFilter(searchText){
    this.setState({
      loadingProgress: 0
    });
    this.searchFromAllOptions(searchText);
  }

  toggleFilter(option, allowMultiple, callback){
    let query = toggleQuery(option, this.props.location.query[this.props.id], allowMultiple);
    this.props.updateQuery({[this.props.id]: query});
    if(defined(callback) && typeof callback ==='function'){
      callback();
    }
  }

  resetFilter(){
    this.props.updateQuery({[this.props.id]: []});
  }

  toggleOpen(){
    this.setState({
      isOpen: !this.state.isOpen
    })
  }

  searchFromAllOptions(searchText){
    let keyword = this.props.location.query.q.split(' ').join('+');
    let facet = this.props.id.replace(/s+$/, "");
    // needs to use [this.props.id] when format facet is ready
    getJSON(`http://ec2-52-65-238-161.ap-southeast-2.compute.amazonaws.com:9000/facets/${facet}/options/search?query=${keyword}`,
       this.updateProgress
     ).then((data)=>{
       let filteredOptions = this.state.options;
      data.options.forEach((c)=>{
        if(c.value.toLowerCase().indexOf(searchText.toLowerCase())!==-1){
          filteredOptions.push(c);
        }
      });

      this.setState({
        options: filteredOptions
      })

    }, (err)=>{console.warn(err)});
  }

  updateProgress (oEvent) {
    if (oEvent.lengthComputable) {
      this.setState({
        loadingProgress: oEvent.loaded / oEvent.total
      })
    } else {
      // Unable to compute progress information since the total size is unknown
      console.log('Unable to compute progress information since the total size is unknown');
    }
  }

  renderCondition(option, optionMax, callback, onFocus){
    let allowMultiple = true;

    if(!option){
      return null;
    }
    let maxWidth = defined(optionMax) ? +option.hitCount/optionMax.hitCount * 200 : 0;
    let divStyle = {width: maxWidth + 'px'}

    return(
    <button type='button'
            ref={b=>{if(b != null && onFocus === true){b.focus()}}}
            className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-facet-option btn`}
            onClick={this.toggleFilter.bind(this, option, allowMultiple, callback)}>
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}{option.matched && <span className='btn-facet-option__recomended-badge'>(recomended)</span>}</span>
      <span className='btn-facet-option__action'><i className={`fa fa-${this.checkActiveOption(option) ? 'times' : 'plus'}`}/></span>
      <span className='btn-facet-option__count'>{option.hitCount}</span>
    </button>);
  }



  checkActiveOption(option){
    let query = this.props.location.query[this.props.id];
    return checkActiveOption(option, query);
  }

  getActiveOption(){
    let query = this.props.location.query[this.props.id];
    if(!query){
      return null;
    }
    if(!Array.isArray(query)){
     query = [query];
   }
   return query.map(item=>{
     let correspondingOptionInDefaultList = find(this.props.options, o=>o.value === item);

     let hitCount = defined(correspondingOptionInDefaultList) ? correspondingOptionInDefaultList.hitCount : 0;
     let option = {'value': item, 'hitCount': hitCount}
     return <li key={item}>{this.renderCondition(option)}</li>;
   });
  }

  render() {
    let inactiveOptions = this.props.options.filter(o=>!this.checkActiveOption(o));
    let maxOptionFromDefaultOptionList = maxBy(this.props.options, o=> +o.hitCount);
    let tempSize =  DEFAULTSIZE > inactiveOptions.length ? inactiveOptions.length : DEFAULTSIZE;
    let size = this.state.isOpen ? inactiveOptions.length : tempSize;
    let overflow = inactiveOptions.length - tempSize;
    return (
      <div className='filter'>
        <FilterHeader query={this.props.location.query[this.props.id]}
                      resetFilter={this.resetFilter}
                      title={this.props.title}/>

        <FilterSearchBox allowMultiple={true}
                         clearSearch={this.clearSearch}
                         searchFilter={this.searchFilter}
                         loadingProgress={this.state.loadingProgress}
                         renderCondition={this.renderCondition}
                         toggleFilter={this.toggleFilter}
                         options={this.state.options}

        />

        <ul className='list-unstyled active-options'>
          {this.getActiveOption()}
        </ul>

        <ul className='other-options list-unstyled'>
        {inactiveOptions.slice(0, size).map((option, i)=>
              <li key={i}>{this.renderCondition(option,maxOptionFromDefaultOptionList)}</li>
        )}
        </ul>
        {overflow > 0 && <button onClick={this.toggleOpen}
                                 className='btn btn-toggle'>
                                    {this.state.isOpen ? `Show less ${this.props.title}s` : `Show ${overflow} more`}
                          </button>}

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
