// @flow
import type {ParsedDistribution} from '../helpers/record';

export type PreviewData = {
  data: Array<any> | string,
  meta: {
    type: string,
    filed? : Array<string>
  }
}

export function getPreviewDataUrl(distributions: Array<ParsedDistribution>){
    // 1. link status available
    // 2. link is active
    const viewableDistribution = distributions.filter(d=>d.linkStatusAvailable && d.linkActive && d.downloadURL);
    const csv = viewableDistribution.filter(d=> d.format.toLowerCase() === 'csv');
    const xml = viewableDistribution.filter(d=> d.format.toLowerCase() === 'xml');
    const json = viewableDistribution.filter(d=> d.format.toLowerCase() === 'json');
    const txt = viewableDistribution.filter(d=> d.format.toLowerCase() === 'txt');
    const html = viewableDistribution.filter(d=> d.format.toLowerCase() === 'html');
    const rss = viewableDistribution.filter(d=> d.format.toLowerCase() === 'rss');

    const geoFormat = ["csv-geo-au" , "wfs" , "wms" , "czml" , "kml"];

    const geo = viewableDistribution.filter(d=> geoFormat.indexOf(d.format.toLowerCase()) !== -1) ;

    if(geo.length > 0){
      return {id: geo[0].id , format: 'geo', name: geo[0].title}
    }

    if(csv.length > 0){
      return {url: csv[0].downloadURL, format: 'csv'}
    }
    if(xml.length > 0){
      return {url: xml[0].downloadURL, format: 'xml'}
    }
    if(json.length > 0){
      return {url: json[0].downloadURL, format: 'json'}
    }

    if(txt.length > 0){
      return {url: txt[0].downloadURL, format: 'txt'}
    }

    if(html.length > 0){
      return {url: html[0].downloadURL || html[0].accessURL, format: 'html'}
    }

    if(rss.length > 0){
      return {url: rss[0].downloadURL, format: 'rss'}
    }

    if(viewableDistribution.length > 0){
      return {url: viewableDistribution[0].downloadURL, format: 'googleViewable'}
    }

    return false;
  }
