import defined from './defined'
// temp
const NUMBERRESULTSPERPAGE = 20;

export default function(query){
  let keyword = defined(query.q) ? query.q : '';
  let dateFrom = defined(query.dateFrom) ? '+from+' + query.dateFrom : '';
  let dateTo=defined(query.dateTo) ? '+to+' + query.dateTo : '';
  let publisher = queryToString('+by', query.publisher);
  let format = queryToString('+as', query.format);
  let location = queryToLocation(query.regionId, query.regionType);
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
  // what if there are more than one regionId or regionType in the url?
  if(!defined(regionid) || !defined(regiontype)) return '';
  return `+in ${regiontype}:${regionid}`;
}
