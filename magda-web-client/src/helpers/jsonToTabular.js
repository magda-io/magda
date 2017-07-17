//@flow
import jsonToArray from './jsonToArray';

export default function(jsonObj: Object){
    const array = jsonToArray(jsonObj);
    const data = {
      data: array,
      meta: {
        fields: ['name', 'value']
      }
    }
    return data
}
