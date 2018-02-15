import React from 'react';
import PropTypes from 'prop-types';
import './DataPreviewMap.css';

function DataPreviewMap(props) {
  // Go crazy jacky!
  return (
    <div className="data-preview-map">
      <h3>Map Preview</h3>
    </div>
  );
}

DataPreviewMap.propTypes = {
  dataset: PropTypes.object
};

export default DataPreviewMap;
