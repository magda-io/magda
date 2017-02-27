import { AspectDefinition, AspectDefinitionsApi } from './generated/registry/api';
import retry from './retry';
import Ckan from './Ckan';
import CkanConnector, { AspectBuilder } from './CkanConnector';
import Registry from './Registry';
import * as fs from 'fs';
import * as request from 'request';
import formatServiceError from './formatServiceError';
import * as URI from 'urijs';
import * as moment from 'moment';

/*
// from moment.js, from-string.js
var tzRegex = /Z|[+-]\d\d(?::?\d\d)?/;
var isoTimes = [
    ['HH:mm:ss.SSSS', /\d\d:\d\d:\d\d\.\d+/],
    ['HH:mm:ss,SSSS', /\d\d:\d\d:\d\d,\d+/],
    ['HH:mm:ss', /\d\d:\d\d:\d\d/],
    ['HH:mm', /\d\d:\d\d/],
    ['HHmmss.SSSS', /\d\d\d\d\d\d\.\d+/],
    ['HHmmss,SSSS', /\d\d\d\d\d\d,\d+/],
    ['HHmmss', /\d\d\d\d\d\d/],
    ['HHmm', /\d\d\d\d/],
    ['HH', /\d\d/]
];

for (var i = 0; i < isoTimes.length; ++i) {
    // A time must follow whitespace or 'T' and occur at the end of the string.
    isoTimes[i][1] = new RegExp('[\\sT]' + (isoTimes[i][1] as RegExp).source + '(' + tzRegex.source + ')?$');
}

const customDateFormats = [
    'DD-MM-YYYY',
    'DD-MMM-YYYY',
    'DD-MMMM-YYYY',
    'MM-DD-YYYY',
    'MMM-DD-YYYY',
    'MMMM-DD-YYYY',
    'MMM-DD-YY',
    'MMMM-DD-YY',
    'MMMM-YYYY',
    'MMM-YYYY',
    'MMMM-YY',
    'MMM-YY',
    'YYYY',
    'YY',
];

const customDateFormatRegexs = customDateFormats.map(format => {
    return {
        format: format,
        regex: new RegExp('^' + format
            .replace(/-/g, '[-\\/\\s]')
            .replace(/M{4}/g, '[A-Za-z]+')
            .replace(/M{3}/g, '[A-Za-z]{3}')
            .replace(/[DMY]/g, '\\d'))
    };
});

const dateComponentSeparators = ['-', '/', ' '];
const dateTimeSeparators = ['T', ' '];
const formatScratch: string[] = [];

function parseDateTimeString(s: string) {
    // First try parsing this as an ISO8601 date/time
    const iso = moment(s, moment.ISO_8601, true);
    if (iso.isValid()) {
        return iso;
    }

    // Next try some custom date formats
    const matchingDateFormats = customDateFormatRegexs.filter(format => format.regex.test(s));
    const matchingTimeFormats = isoTimes.filter(format => (format[1] as RegExp).test(s));
    const includeTimeZone = s.match(tzRegex);

    let formats = formatScratch;
    formats.length = 0;

    matchingDateFormats.forEach(dateFormat => {
        dateComponentSeparators.forEach(dateComponentSeparator => {
            const dateFormatWithSeparator = dateFormat.format.replace(/-/g, dateComponentSeparator);
            formats.push(dateFormatWithSeparator);

            dateTimeSeparators.forEach(dateTimeSeparator => {
                matchingTimeFormats.forEach(timeFormat => {
                    formats.push(dateFormatWithSeparator + dateTimeSeparator + timeFormat[0]);

                    if (includeTimeZone) {
                        formats.push(dateFormatWithSeparator + dateTimeSeparator + timeFormat[0] + 'Z');
                    }
                });
            });
        });
    });

    return moment(s, formats, true);
}

function getPrecisionFromMoment(m: moment.Moment): moment.Duration {
    const format = m.creationData().format;

    // The most precise token in the format indicates the precision
    if (/S/.test(format)) {
        return moment.duration(1);
    } else if (/s/.test(format)) {
        return moment.duration(1, 'seconds');
    } else if (/m/.test(format)) {
        return moment.duration(1, 'minutes');
    } else if (/[hH]/.test(format)) {
        return moment.duration(1, 'hours');
    } else if (/[DdE]/.test(format)) {
        return moment.duration(1, 'days');
    } else if (/[WwG]/.test(format)) {
        return moment.duration(1, 'weeks');
    } else if (/M/.test(format)) {
        return moment.duration(1, 'months');
    } else if (/Q/.test(format)) {
        return moment.duration(1, 'quarters');
    } else if (/[YgG]/.test(format)) {
        return moment.duration(1, 'years');
    } else {
        return moment.duration(0);
    }
}

const start = Date.now();
for (var i = 0; i < 10000; ++i) {
    const d = parseDateTimeString('2016-01-12T12:00');
    const foo = getPrecisionFromMoment(d);
    // console.log(d.format());
    // console.log(foo.toJSON());
}
const end = Date.now();
console.log(end - start);
// console.log(d.format());
// console.log(d.creationData().format);
// console.log(moment.ISO_8601);

process.exit();
*/

const ckan = new Ckan({
    baseUrl: 'https://data.gov.au/',
    pageSize: 10
});

const registry = new Registry({
    baseUrl: 'http://localhost:6100/'
});

const aspectBuilders: AspectBuilder[] = [
    {
        aspectDefinition: {
            id: 'ckan-dataset',
            name: 'CKAN Dataset',
            jsonSchema: require('../../registry-aspects/ckan-dataset.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/ckan-dataset.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'dcat-dataset-strings',
            name: 'DCAT Dataset properties as strings',
            jsonSchema: require('../../registry-aspects/dcat-dataset-strings.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/dcat-dataset-strings.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'source',
            name: 'Source',
            jsonSchema: require('../../registry-aspects/source.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/source.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'temporal-coverage',
            name: 'Temporal Coverage',
            jsonSchema: require('../../registry-aspects/temporal-coverage.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/temporal-coverage.js', 'utf8')
    }
];

const connector = new CkanConnector({
    ckan: ckan,
    registry: registry,
    aspectBuilders: aspectBuilders
});

connector.run().then(result => {
    console.log('Aspect Definitions Connected: ' + result.aspectDefinitionsConnected);
    console.log('Datasets Connected: ' + result.datasetsConnected);

    if (result.errors.length > 0) {
        console.log('Errors:\n' + result.errors.map(error => error.toString()).join('\n'));
    }
});
