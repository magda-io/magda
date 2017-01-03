import defined from './defined';
import {config} from '../config';

export default function(query){
  let keyword = defined(query.q) ? query.q : '';
  let dateFrom = defined(query.dateFrom) ? '+from+' + query.dateFrom : '';
  let dateTo=defined(query.dateTo) ? '+to+' + query.dateTo : '';
  let publisher = queryToString('+by', query.publisher);
  let format = queryToString('+as', query.format);
  let location = queryToLocation(query.regionId, query.regionType);
  let startIndex = defined(query.page) ? (query.page - 1)*config.resultsPerPage : 0;

  let apiQuery = `${encodeURIComponent(keyword)}${publisher}${format}${dateFrom}${dateTo}${location}&start=${startIndex}&limit=${config.resultsPerPage}`;
  return apiQuery;
}

function queryToString(preposition, query){
  if(!defined(query)) return '';
  if(Array.isArray(query)){
    return query.map(q=>
    `${preposition}+${encodeURIComponent(q)}`).join('+')
  } else {
    return `${preposition}+${encodeURIComponent(query)}`
  }
}

function queryToLocation(regionId, regiontype){
  // what if there are more than one regionId or regionType in the url?
  if(!defined(regionId) || !defined(regiontype)) return '';
  return `+in+${regiontype}:${regionId}`;
}
