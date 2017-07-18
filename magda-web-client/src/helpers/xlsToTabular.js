//@flow
import XLSX from 'xlsx';
import type {PreviewData} from './previewData';

export default function(url: string){

  return new Promise (function(resolve, reject){
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";

    request.onload = function(e) {
      var arraybuffer = request.response;

      /* convert data to binary string */
      var data = new Uint8Array(arraybuffer);
      var arr = [];
      for(var i = 0; i != data.length; ++i) arr[i] = String.fromCharCode(data[i]);
      var bstr = arr.join("");

      /* Call XLSX */
      const workbook = XLSX.read(bstr, {type:"binary"});

      /* DO SOMETHING WITH workbook HERE */
      let result = {};
      let sheetName = '';
      workbook.SheetNames.forEach(function(_sheetName) {
          var roa = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[_sheetName]);
          if(roa.length > 0){
            sheetName = _sheetName;
            result[_sheetName] = roa;
          }
        });

      if(request.status === 200 && result[sheetName]){
        const tabularData: PreviewData = {
          data: result[sheetName],
          meta: {
            fields: Object.keys(result[sheetName][0]),
            type: 'tabular'
          }
        }
        resolve(tabularData);
      } else{
        reject(Error('There was a network error.'));
      }
    }

    request.onerror = function() {
          // Also deal with the case when the entire request fails to begin with
          // This is probably a network error, so reject the promise with an appropriate message
          reject(Error('There was a network error.'));
      };
    request.send();
  });
}
