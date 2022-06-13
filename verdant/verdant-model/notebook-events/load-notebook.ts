import { NotebookEvent } from ".";
import { Cell } from "@jupyterlab/cells";
import { VerCell } from "../cell";
import { VerNotebook, log } from "../notebook";
import { NodeyNotebook } from "../nodey";

export class LoadNotebook extends NotebookEvent {
  matchPrior: boolean;

  constructor(notebook: VerNotebook, matchPrior: boolean) {
    super(notebook);
    this.matchPrior = matchPrior;
  }

  async modelUpdate() {
    let newNotebook: NodeyNotebook;
    console.log("Model update being called?");
    console.log(this.matchPrior,this.notebook.model)
    if (this.matchPrior && this.notebook.model) {
      console.log('This is a hot start');
      newNotebook = await this.notebook.ast.hotStartNotebook(
        this.notebook.model,
        this.notebook.view.notebook,
        this.checkpoint
      );
    } else
      console.log('This is  a cold start');
      newNotebook = await this.notebook.ast.coldStartNotebook(
        this.notebook.view.notebook,
        this.checkpoint
      );

    // initialize the cells of the notebook
    this.notebook.cells = [];
    this.notebook.view.notebook.widgets.forEach((item, index) => {
      if (item instanceof Cell) {
        let name = newNotebook.cells[index];
        let cell: VerCell = new VerCell(this.notebook, item, name);
        this.notebook.cells.push(cell);
      }
    });

    log("cell names", this.notebook.cells, this.checkpoint);
  }
}
