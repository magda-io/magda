export default function (text) {
  let dummy = [];
  for(let i = 0; i < 10; i ++){
    let data = {
      title: `${makeName()} ${text} dataset`,
      description: 'Description of this dataset',
      tags: ['spatial', 'tabular'],
      publisher: 'ABS',
      jurisdiction: 'NSW',
      dateRange: [2016],
      dataFormat: ['csv']
    }
    dummy.push(data);
  }

  function makeName(){
    var possible = [
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
    return possible[Math.floor(Math.random() * possible.length)];
  }

  return dummy;
}


