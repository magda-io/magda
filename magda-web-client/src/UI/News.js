// @flow
import React from 'react';
type rssNews = {
  content: string,
  contentSnippet: string,
  'dc:creator': string,
  guid: string,
  link: string,
  pubDate: string,
  title: string
}

type props = {
  isFetching: Boolean,
  newsItems: Array<rssNews>,
  error: number
}

function renderContent(props: props){
  if(props.error){
    return <div className='error'> Sorry we cannot get news at the moment</div>
  }
  if(props.isFetching){
    return (<div>
              <i class="fa fa-spinner fa-spin fa-3x fa-fw"></i>
              <span class="sr-only">Loading...</span>
            </div>)
  }
  return (
    <ul className='list-unstyled list-group'>{props.newsItems.map(n=>renderNews(n))}</ul>
  )
}

function renderNews(news: rssNews){
  return (<li className='list-group-item' key={news.link + news.title}>
            <h4 className='list-group-item-heading'><a href={news.link} target="_blank">{news.title}</a></h4>
            <div className='news-body list-group-item-text'>{news.contentSnippet}</div>
          </li>)
}



export default function News(props: props){
  return (
    <div className='news'>
      <div className='inner'>
          {renderContent(props)}
      </div>
  </div>
  )
}
