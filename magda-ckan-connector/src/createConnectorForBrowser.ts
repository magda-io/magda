import CkanConnector from './CkanConnector';
import createConnector from './createConnector';
import * as URI from 'urijs';
import 'isomorphic-fetch';

export function createConnectorForBrowser(baseUrl: string): Promise<CkanConnector> {
    const url = URI(baseUrl).segment('config').toString();
    return fetch(url)
        .then(response => response.json())
        .then(function(config) {
            return createConnector(config);
        });
}
