import React from 'react';

import CrappyChat from '../../Components/CrappyChat/CrappyChat';
import './RecordDetails.css';

export default function DatasetDiscussion(props) {
  return (
    <div className='dataset-discussion container'>
      <div className='row'>
        <div className='col-sm-8'>
          <CrappyChat
            typeName='dataset'
            typeId={props.match.params.datasetId}
          />
        </div>
      </div>
    </div>
  );
}
