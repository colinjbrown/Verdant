import * as React from "react";
import { Nodey } from "../../../lilgit/nodey";
import { History } from "../../../lilgit/history";
import { verdantState, showDetailOfNode } from "../../redux/";
import { connect } from "react-redux";
import { Namer, Sampler, SAMPLE_TYPE } from "../../../lilgit/sampler/";
import { VersionSampler } from "../../sampler/version-sampler";

type Result_Props = {
  result: Nodey;
  search_query: string;
  openNodeDetails: (n: Nodey) => void;
  openGhostBook: (n: number) => void;
  history: History;
};

class Result extends React.Component<Result_Props, { sample: string }> {
  constructor(props: Result_Props) {
    super(props);
    this.state = { sample: null };
  }

  componentDidMount() {
    this.props.history.ready.then(async () => {
      let sample = await VersionSampler.sample(
        SAMPLE_TYPE.SEARCH,
        this.props.history,
        this.props.result,
        this.props.search_query,
        Sampler.NO_DIFF
      );

      this.setState({ sample: sample.outerHTML });
    });
  }

  render() {
    let notebook = this.props.history.store.getNotebookOf(this.props.result);
    return (
      <div>
        <div className="VerdantPanel-search-results-artifact-header list-result">
          <div>
            <span
              className="verdant-link"
              onClick={() => this.props.openNodeDetails(this.props.result)}
            >
              {Namer.getVersionTitle(this.props.result)}
            </span>
            <span>{" from "}</span>
            <span
              className="verdant-link"
              onClick={() => this.props.openGhostBook(notebook.version)}
            >
              {Namer.getNotebookTitle(notebook)}
            </span>
          </div>
        </div>
        <div
          className={"v-VerdantPanel-search-version"}
          onClick={() => this.props.openGhostBook(notebook.version)}
          dangerouslySetInnerHTML={{ __html: this.state.sample }}
        ></div>
      </div>
    );
  }
}

const mapDispatchToProps = (dispatch: any) => {
  return {
    openNodeDetails: (inspectTarget?: Nodey) => {
      dispatch(showDetailOfNode(inspectTarget));
    },
  };
};

const mapStateToProps = (state: verdantState) => {
  return {
    search_query: state.search.searchQuery,
    history: state.getHistory(),
    openGhostBook: state.openGhostBook,
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(Result);