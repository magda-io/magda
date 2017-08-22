import React, { Component } from 'react';

function QualityIndicator(props: {quality: number}) {
  const rating = props.quality;
  console.log(rating);
  var style = {
    display: 'inline-block',
    height: '8px',
    width: rating * 100 + 10 + 'px',
    background: `rgb(${255*(1-rating)}, ${rating*200}, 50)`,
  };

  return (
        <div> Quality: <span style={style} className='quality'></span> {rating*100}% </div>
  );
}


export default QualityIndicator;
