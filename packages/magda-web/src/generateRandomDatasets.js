export default function (text) {
  let formats = [
    'csv',
    'xls',
    'json',
    'xml',
    'kml'
    ];

  let dates=[
    '2000',
    '2001',
    '2002',
    '2003',
    '2004',
    '2005',
    '2006',
    '2007',
    '2008',
    '2009',
    '2010',
    '2011',
    '2012',
    '2013',
    '2014',
    '2015',
    '2016'
  ];

  let jurisdictions = [
        'Sydney ',
        'Albury',
        'Armidale',
        'Bathurst',
        'Blue Mountains',
        'Broken Hill',
        'Campbelltown[a]',
        'Cessnock',
        'Dubbo',
        'Goulburn',
        'Grafton',
        'Lithgow',
        'Liverpool[a]',
        'Newcastle',
        'Orange',
        'Parramatta[a]',
        'Penrith[a]',
        'Queanbeyan',
        'Tamworth',
        'Wagga Wagga',
        'Wollongong'
        ];

  let org = ['Nillumbik Shire Council',
             'Australian Charities...',
             'ACT government',
             'Australian Institute...',
             'Alpine Shire Concil',
             'Art Victoria',
             'Attorney General\'s...',
             'Ausgrid',
             'Australia Council for...',
             'ABC',
             'ABS'
             ]


  let dummy = [];
  for(let i = 0; i < 10; i ++){
    let data = {
      title: `${makeRandom(jurisdictions)} ${text} dataset`,
      description: 'Description of this dataset',
      tags: ['spatial', 'tabular'],
      publisher: makeRandom(org),
      jurisdiction: makeRandom(jurisdictions),
      dateRange: makeRandom(dates),
      dataFormat: [makeRandom(formats)]
    }
    dummy.push(data);
  }

  function makeRandom(possibilities){
    return possibilities[Math.floor(Math.random() * possibilities.length)];
  }
  return dummy;
}


