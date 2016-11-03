import './FacetWrapper.css';

/**
  * Facet Facet component, for example, publisher facet, location facet, format facet, temporal facet
  */
class FacetWrapper extends Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      <div className='facet-wrapper'>
        <FacetHeader hasQuery={this.props.hasQuery}
                      removeFacet={this.props.removeFacet}
                      title={this.props.title}/>
        {this.props.children}
      </div>
    );
  }
}

FacetWrapper.propTypes = {hasQuery: React.PropTypes.bool,
                          title: React.PropTypes.string,
                          removeFacet: React.PropTypes.func};

FacetWrapper.defaultProps = {hasQuery: false};


export default FacetWrapper;
