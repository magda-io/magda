export class RecordLayer {
    /**
    * The unique identifier of the record
    */
    'id': string;
    /**
    * The name of the record
    */
    'name': string;
    /**
    * The aspects included in this record
    */
    'aspects': any;
    /*
    * The layer corresponding to this Object
    */
    'layer': string;
}

export class RecordLayerSummary {
    /**
    * The unique identifier of the record
    */
    'id': string;
    /**
    * The name of the record
    */
    'name': string;
    /**
    * The list of aspect IDs for which this record has data
    */
    'aspects': Array<string>;
    /*
    * The layer corresponding to this summary
    */
    'layer': string;
}