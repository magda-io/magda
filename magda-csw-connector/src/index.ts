import Csw, { CswGmdResponse } from './Csw';
import { forEachAsync } from '@magda/typescript-common/lib/AsyncPage';

const csw = new Csw({
    baseUrl: 'http://www.bom.gov.au/geonetwork/srv/eng/csw',
    name: 'Australian Bureau of Meteorology'
});

const recordsPages = csw.getRecords().map((data: CswGmdResponse) => {
    return [data];
});

forEachAsync(recordsPages, 1, (data: CswGmdResponse) => {
    console.dir(data);
    return Promise.resolve();
});
