import React, { Component } from 'react';
import defined from '../helpers/defined';
import Publisher from './Publisher';
import Format from './Format';
import Region from './Region';
import Temporal from './Temporal';
import config from '../config.js';

class SearchFacets extends Component {
  render() {
    return (
      <div>
        {config().facets.map(c=>
          <c.component key={c.id} updateQuery={this.props.updateQuery} component={'facet'}/>
        )}
      </div>
    );
  }
}

export default SearchFacets;
