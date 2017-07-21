//@flow
import jsonToArray from './jsonToArray';
import type {PreviewData} from './previewData';

export default function(jsonObj: Object){
    const array = jsonToArray(jsonObj);
    const data: PreviewData = {
      data: array,
      meta: {
        fields: ['name', 'value'],
        type: 'tabular'
      }
    }
    return data
}
