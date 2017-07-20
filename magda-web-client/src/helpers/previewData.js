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
    const xls = viewableDistribution.filter(d=> d.format.toLowerCase() === 'xls' || d.format.toLowerCase() === 'xlsx');
    const excel = viewableDistribution.filter(d=> d.format.toLowerCase() === 'excel');
    const pdf = viewableDistribution.filter(d=> d.format.toLowerCase() === 'pdf');
    const txt = viewableDistribution.filter(d=> d.format.toLowerCase() === 'txt');
    const html = viewableDistribution.filter(d=> d.format.toLowerCase() === 'html');

    if(csv.length > 0){
      return {url: csv[0].downloadURL, format: 'csv'}
    }
    if(xml.length > 0){
      return {url: xml[0].downloadURL, format: 'xml'}
    }
    if(json.length > 0){
      return {url: json[0].downloadURL, format: 'json'}
    }

    if(xls.length > 0){
      return {url: xls[0].downloadURL, format: 'xls'}
    }

    if(excel.length > 0){
      return {url: excel[0].downloadURL, format: 'excel'}
    }

    if(pdf.length > 0){
      return {url: pdf[0].downloadURL, format: 'pdf'}
    }

    if(txt.length > 0){
      return {url: txt[0].downloadURL, format: 'txt'}
    }

    if(html.length > 0){
      return {url: html[0].downloadURL || html[0].accessURL, format: 'html'}
    }

    return false;
  }
