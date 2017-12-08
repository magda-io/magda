import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { linkTo } from '@storybook/addon-links';
import CustomIcons, {iconTypes} from '../UI/CustomIcons';
import DataPreviewGoogleViewer from '../UI/DataPreviewGoogleViewer';
import DataPreviewJson from '../UI/DataPreviewJson';
import OverviewBox from '../UI/OverviewBox';
import DataPreviewTable from '../UI/DataPreviewTable';
import DataPreviewTextBox from '../UI/DataPreviewTextBox';
import DataPreviewVega from '../UI/DataPreviewVega';


import "../index.css";

const exampleData = {
  meta: {
    chartFields: {
      numeric: ['a'],
      time: ['date']
    },
    fields: ['a', 'date'],
    type: 'chart'
  },
  data: [{date: '2017-12-22', a: '10'},
         {date: '2017-12-23', a: '30'},
         {date: '2017-12-24', a: '40'},
         {date: '2017-12-25', a: '20'},
         {date: '2017-12-26', a: '30'}]
}

storiesOf('Dataset preview', module)
    .add('DataPreviewGoogleViewer', () => <DataPreviewGoogleViewer data={{data: "http://unec.edu.az/application/uploads/2014/12/pdf-sample.pdf"}}/>)
    .add('DataPreviewJson', ()=><DataPreviewJson data={{data: {object : {test: 1}}}}/>)
    .add('DataPreviewTable', ()=><DataPreviewTable data={exampleData}/>)
    .add('DataPreviewTextBox', ()=><DataPreviewTextBox data={{data: 'some text'}}/>)
    .add('DataPreviewVega', ()=><DataPreviewVega data={exampleData} />)


iconTypes.map(iconname =>
  storiesOf('Icons', module)
      .add(iconname, () => <CustomIcons name={iconname}/>)
)
