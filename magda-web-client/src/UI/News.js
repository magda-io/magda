import React from 'react';

function renderContent(props){
  if(props.error){
    return <div className='error'><h3>{props.error.title}</h3>{props.error.detail}</div>
  }
  if(props.isFetching){
    return (<div>
              <i className="fa fa-spinner fa-spin fa-3x fa-fw"></i>
              <span className="sr-only">Loading...</span>
            </div>)
  }
  return (
    <ul className='mui-list--unstyled list-group'>{props.newsItems.slice(0, 3).map(n=>renderNews(n))}</ul>
  )
}

function renderNews(news){
  return (<li className='list-group-item' key={news.link + news.title}>
            <h3 className='list-group-item-heading'><a href={news.link} target="_blank" rel="noopener noreferrer">{news.title}</a></h3>
            <div className='news-body list-group-item-text'>{news.contentSnippet}</div>
          </li>)
}

export default function News(props){
  return (
    <div className='news'>
      <div className='inner'>
          {renderContent(props)}
      </div>
  </div>
  )
}
