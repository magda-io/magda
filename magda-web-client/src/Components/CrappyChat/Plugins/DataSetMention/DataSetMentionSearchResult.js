import React from 'react';
import Button from 'muicss/lib/react/button';
export default function DataSetMentionEntry(props) {
  const { mention } = props;
  return (
    <Button
      onMouseDown={props.onMouseDown}
      onMouseLeave={props.onMouseLeave}
      onMouseUp={props.onMouseUp}
      role={props.role}
      className={props.className}
      style={{
        ...props.style,
      }}
    >
      {mention.get('title')}
    </Button>
  );
}
