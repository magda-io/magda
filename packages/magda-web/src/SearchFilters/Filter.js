import './Filter.css';
import FilterHeader from './FilterHeader';
import FilterSearchBox from './FilterSearchBox';
import find from 'lodash.find';
import getJSON from'../getJSON';
import React, { Component } from 'react';
import maxBy from 'lodash.maxby';
import defined from '../defined';
import toggleQuery from '../toggleQuery';
const DEFAULTSIZE = 5;

class Filter extends Component {
  constructor(props) {
    super(props);
    this.state={
      searchText: '',
      isOpen: false,
      allOptions: [],
      loadingProgress: 0
    }
    this.handleChange = this.handleChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.renderCondition = this.renderCondition.bind(this);
    this.resetFilter = this.resetFilter.bind(this);
    this.toggleFilter= this.toggleFilter.bind(this);
    this.toggleOpen = this.toggleOpen.bind(this);
    this.getAllOptions = this.getAllOptions.bind(this);
    this.updateProgress = this.updateProgress.bind(this);

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
      searchText: e.target.value,
      loadingProgress: 0
    });
    this.getAllOptions();
  }

  toggleFilter(option, allowMultiple){
    let query = toggleQuery(option, this.props.location.query[this.props.id], allowMultiple);
    this.props.updateQuery({[this.props.id]: query});
    this.clearSearch();
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
    let facet = this.props.id.replace(/s+$/, "");
    // needs to use [this.props.id] when format facet is ready
    getJSON(`http://ec2-52-65-238-161.ap-southeast-2.compute.amazonaws.com:9000/facets/${facet}/options/search?query=${keyword}`,
       this.updateProgress
     ).then((data)=>{
      this.setState({
        allOptions: data.options,
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

  renderCondition(option, optionMax){
    let allowMultiple = true;

    if(!option){
      return null;
    }

    let maxWidth = defined(optionMax) ? +option.hitCount/optionMax.hitCount * 200 : 0;
    let divStyle = {width: maxWidth + 'px'}

    return(
    <button type='button' className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-facet-option btn`} onClick={this.toggleFilter.bind(this, option, allowMultiple)}>
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}{option.matched && <span className='btn-facet-option__recomended-badge'>(recomended)</span>}</span>
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
    if(!Array.isArray(filter)){
      filter = [filter];
    }
    return filter.map(p=>{
      let correspondingOptionInDefaultList = find(this.props.options, o=>o.value === p);

      let hitCount = defined(correspondingOptionInDefaultList) ? correspondingOptionInDefaultList.hitCount : 0;
      let option = {'value': p, 'hitCount': hitCount}
      return <li key={p}>{this.renderCondition(option)}</li>;
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
                         handleChange={this.handleChange}
                         loadingProgress={this.state.loadingProgress}
                         renderCondition={this.renderCondition}
                         searchText={this.state.searchText}
                         toggleFilter={this.toggleFilter}
                         options={this.state.allOptions}

        />
        <ul className='list-unstyled'>
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
