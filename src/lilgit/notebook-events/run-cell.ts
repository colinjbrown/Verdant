import { ICellModel } from "@jupyterlab/cells";
import { NotebookEvent } from ".";
import { ChangeType, CellRunData, CheckpointType } from "../checkpoint";
import { VerNotebook } from "../notebook";
import { log } from "../notebook";
import { NodeyCell, NodeyCode } from "../nodey/";

export class RunCell extends NotebookEvent {
  cellModel: ICellModel;
  cellSame: boolean;

  constructor(notebook: VerNotebook, cellModel: ICellModel) {
    super(notebook);
    this.cellModel = cellModel;
  }

  createCheckpoint() {
    this.checkpoint = this.history.checkpoints.generateCheckpoint(
      CheckpointType.RUN
    );
  }

  async modelUpdate(): Promise<NodeyCell[]> {
    // now repair the cell against the prior version
    let cell = this.notebook.getCell(this.cellModel);

    // commit the notebook if the cell has changed
    this.history.stage.markAsEdited(cell.model);
    let newNodey = this.history.stage.commit(this.checkpoint);
    log("notebook commited", newNodey, this.notebook.model);

    this.cellSame = newNodey.indexOf(cell.model) < 0;
    return newNodey;
  }

  recordCheckpoint(_: NodeyCell[]) {
    let cellRun = this.notebook.getCell(this.cellModel).model;

    let newOutput: string[] = [];
    if (cellRun instanceof NodeyCode) {
      let output = this.history.store.getOutput(cellRun);
      if (output) {
        let latestOut = output.latest;
        if (latestOut.created === this.checkpoint.id)
          newOutput.push(latestOut.name);
      }
    }

    let cellChange; // "changed" marker if there is edited text or new output
    if (this.cellSame && newOutput.length < 1) cellChange = ChangeType.SAME;
    else cellChange = ChangeType.CHANGED;

    let runCell = {
      node: cellRun.name,
      changeType: cellChange,
      run: true,
      newOutput: newOutput,
    } as CellRunData;

    this.history.checkpoints.resolveCheckpoint(this.checkpoint.id, [runCell]);
  }

  endEvent() {
    this.notebook.saveToFile();
  }
}
