import React from 'react';

function QualityIndicator(props: {quality: number}) {
  const rating = props.quality;
  var style = {
    display: 'inline-block',
    height: '8px',
    width: rating * 100 + 10 + 'px',
    background: `rgb(${Math.floor(255*(1-rating))}, ${Math.floor(rating*200)}, 50)`,
  };
  return (
        <div> Quality: <span style={style} className='quality'></span> {Math.floor(rating*100)}% </div>
  );
}


export default QualityIndicator;
