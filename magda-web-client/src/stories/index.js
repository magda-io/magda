import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { linkTo } from '@storybook/addon-links';

import CustomIcons, {iconTypes} from '../UI/CustomIcons';
import DataPreviewGoogleViewer from '../UI/DataPreviewGoogleViewer';

import OverviewBox from '../UI/OverviewBox';

storiesOf('Dataset', module)
    .add('overview box', () => <OverviewBox content={"## heading \n some content"}/>)
    .add('DataPreviewGoogleViewer', () => <DataPreviewGoogleViewer data={{data: "http://unec.edu.az/application/uploads/2014/12/pdf-sample.pdf"}}/>)



iconTypes.map(iconname =>
  storiesOf('Icons', module)
      .add(iconname, () => <CustomIcons name={iconname}/>)
)
