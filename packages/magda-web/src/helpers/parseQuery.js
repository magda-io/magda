import defined from './defined'
const NUMBERRESULTSPERPAGE = 20;

export default function(query){
  let keyword = defined(query.q) ? query.q : '';
  let dateFrom = defined(query.dateFrom) ? '+from+' + query.dateFrom : '';
  let dateTo=defined(query.dateTo) ? '+to+' + query.dateTo : '';
  let publisher = queryToString('+by', query.publisher);
  let format = queryToString('+as', query.format);
  let location = queryToLocation(query.jurisdiction, query.jurisdictionType);
  let startIndex = defined(query.page) ? (query.page - 1)*NUMBERRESULTSPERPAGE + 1 : 0;

  let apiQuery = encodeURI(`${keyword}${publisher}${format}${dateFrom}${dateTo}${location}&start=${startIndex}&limit=${NUMBERRESULTSPERPAGE}`);
  return apiQuery;
}

function queryToString(preposition, query){
  if(!defined(query)) return '';
  if(Array.isArray(query)){
    return query.map(q=>
    `${preposition} ${q}`).join(' ')
  } else {
    return `${preposition} ${query}`
  }
}

function queryToLocation(regionid, regiontype){
  if(!defined(regionid) || !defined(regiontype)) return '';
  return `+in ${regiontype}:${regionid}`;
}
