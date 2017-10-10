import React, { Component } from 'react';
import type {PreviewData} from '../helpers/previewData';
import PDF from 'react-pdf-js';

class DataPreviewPdf extends Component {
    props: {
      data: PreviewData,
      fileName: string
    }
    constructor(props) {
      super(props);
      this.state = {
        pages: null,
        page: 1
      }
    }


    onDocumentComplete = (pages) => {
      this.setState({ page: 1, pages });
    }

    onPageComplete = (page) => {
      this.setState({ page });
    }

    handlePrevious = () => {
      this.setState({ page: this.state.page - 1 });
    }

    handleNext = () => {
      this.setState({ page: this.state.page + 1 });
    }

    renderPagination = (page, pages) => {
      let previousButton = <li className="previous" onClick={this.handlePrevious}><a><i className="fa fa-arrow-left"></i> Previous</a></li>;
      if (page === 1) {
        previousButton = <li className="previous disabled"><a><i className="fa fa-arrow-left"></i> Previous</a></li>;
      }
      let nextButton = <li className="next" onClick={this.handleNext}><a>Next <i className="fa fa-arrow-right"></i></a></li>;
      if (page === pages) {
        nextButton = <li className="next disabled"><a>Next <i className="fa fa-arrow-right"></i></a></li>;
      }
      return (
        <nav>
          <ul className="pager">
            {previousButton}
            {nextButton}
          </ul>
        </nav>
        );
    }

    render(){
      let pagination = null;
      if (this.state.pages) {
        pagination = this.renderPagination(this.state.page, this.state.pages);
      }
      return <div className="clearfix">
            <PDF file={this.props.data.data} onDocumentComplete={this.onDocumentComplete} onPageComplete={this.onPageComplete} page={this.state.page} />
            {pagination}
      </div>
    }
}


export default DataPreviewPdf;
