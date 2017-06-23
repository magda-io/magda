import React from 'react';

import {Link} from 'react-router';

export default function DataSetMentionSearch(props) {
  return (
    <Link
      key={props.mention.get('identifier')}
      className={props.className}
      to={`/dataset/${props.mention.get('identifier')}`}
      contentEditable={false}
    >
      #{props.mention.get('title')}
    </Link>
  );
}
