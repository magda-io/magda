import toggleOption from './toggleOption';

const publisherFacet =(state=[], action) =>{
  switch (action.type) {
    case 'TOGGLE':
      return state.map(option=>toggleOption(option, action))
      break;
    default:
      return state
  }
}

export default publisherFacet;
