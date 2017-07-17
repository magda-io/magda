//@flow
import  fastXmlParser from 'fast-xml-parser';
import traverse from 'traverse';

export default function(xmlData: string){
  // when a tag has attributes
    const options = {
        attrPrefix : "@_",
        textNodeName : "#text",
        ignoreNonTextNodeAttr : true,
        ignoreTextNodeAttr : true,
        ignoreNameSpace : true,
        ignoreRootElement : false,
        textNodeConversion : true,
        textAttrConversion : false
    };
    if(fastXmlParser.validate(xmlData)=== true){
      //optional
      const jsonObj = fastXmlParser.parse(xmlData,options);
      var array = traverse(jsonObj).reduce(function (acc) {
          if (this.notRoot && this.isLeaf) {
            acc.push(
              {
                name:this.parent.key,
                value:this.node
              }
            );
          }
          return acc;
      }, []);
        const data = {
          data: array,
          meta: {
            fields: ['name', 'value']
          }
        }
        return data
    }
    return null;
}
