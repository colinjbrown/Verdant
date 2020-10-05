import { verdantState } from "./state";
import { Checkpoint, CheckpointType } from "../../lilgit/checkpoint";
import { NodeyCode } from "../../lilgit/nodey";
import { History } from "../../lilgit/history";

const INIT_GHOSTBOOK = "INIT_GHOSTBOOK";
const TOGGLE_SHOW_CELLS = "TOGGLE_SHOW_CELLS";
const SWITCH_GHOST_CELL = "SWITCH_GHOST_CELL";

export const initGhostBook = (state: Partial<ghostState>) => {
  return {
    type: INIT_GHOSTBOOK,
    state,
  };
};

export const toggleShowAllCells = () => {
  return {
    type: TOGGLE_SHOW_CELLS,
  };
};

export const focusGhostCell = (cell_name: string) => {
  return {
    type: SWITCH_GHOST_CELL,
    cell: cell_name,
  };
};

export type ghostState = {
  notebook_ver: number;
  cells: Map<string, ghostCellState>;
  cellOutputs: Map<string, ghostCellOutputState>;
  active_cell: string;
  diffPresent: boolean;
  link_artifact: (n: string) => void;
  changeGhostTitle: (n: number) => void;
};

export const ghostInitialState = (): ghostState => {
  return {
    notebook_ver: -1,
    cells: new Map(),
    cellOutputs: new Map(),
    active_cell: null,
    diffPresent: false,
    link_artifact: null,
    changeGhostTitle: null,
  };
};

export type cellEffect =
  | "ADDED"
  | "DELETED"
  | "MOVED"
  | "NEW_OUTPUT"
  | "EDITED";

export type ghostCellState = {
  name: string;
  index: number;
  events: Checkpoint[];
  output: string;
  prior: string;
};

export type ghostCellOutputState = {
  name: string;
  events: Checkpoint[];
};

export const ghostReduce = (state: verdantState, action: any): ghostState => {
  const ghost = state.ghostBook;
  switch (action.type) {
    case INIT_GHOSTBOOK: {
      let present = { ...ghost, ...action.state };
      [present.cells, present.cellOutputs] = loadCells(
        state.getHistory(),
        present.notebook_ver,
        present.diffPresent
      );
      return present;
    }
    case TOGGLE_SHOW_CELLS: {
      let present = { ...ghost };
      present.diffPresent = !state.ghostBook.diffPresent;
      [present.cells, present.cellOutputs] = loadCells(
        state.getHistory(),
        present.notebook_ver,
        present.diffPresent
      );
      return present;
    }
    case SWITCH_GHOST_CELL:
      if (ghost.active_cell != action.cell)
        return {
          ...ghost,
          active_cell: action.cell,
        };
      else return ghost;
    default:
      return ghost;
  }
};

function loadCells(history: History, ver: number, diffPresent: boolean) {
  // TODO: Have method to display deleted cells when diffPresent
  // Load notebook and events
  let notebook, events;
  if (diffPresent) {
    notebook = history.store.currentNotebook;
    events = [];
  } else {
    notebook = history.store.getNotebook(ver);
    events = history.checkpoints.getByNotebook(ver);
  }

  // Type of cells after loading from notebook.cells
  type cellDat = {
    cell: string;
    index?: number;
    events?: Checkpoint[];
    output?: string;
    prior?: string;
  };

  let cells: cellDat[] = notebook.cells.map((item) => ({
    cell: item,
    events: [],
  }));

  let deletedCells: cellDat[] = [];

  // For each event, update list of events matching target cells
  events.forEach((ev) => {
    ev.targetCells.forEach((cell) => {
      let index = notebook.cells.indexOf(cell.node);
      if (index < 0 && ev.checkpointType === CheckpointType.DELETE) {
        // Add new deleted cell with the event.
        // If a cell cannot be deleted multiple times per notebook version,
        // it should be fine to simply add a new deleted cell each time.
        deletedCells.push({
          cell: cell.node,
          index: cell.index,
          events: [ev],
        });
      } else {
        cells[index].events.push(ev);
      }
    });
  });
  // Put deleted cells in the cells list with proper indexing
  deletedCells.forEach((item) => {
    cells.splice(item.index, 0, item);
  });

  // Compute output cells
  let output: cellDat[] = [];
  cells.forEach((cell) => {
    let nodey = history.store.get(cell.cell);
    if (nodey instanceof NodeyCode) {
      let outHist = history.store.getOutput(nodey);
      if (outHist) {
        let out_nodey = outHist.filter((n) => {
          let notebook = history.store.getNotebookOf(n);
          return notebook.version <= ver;
        });
        if (out_nodey.length > 0) {
          let out = out_nodey[out_nodey.length - 1].name;
          output.push({ cell: out });
          cell.output = out;
        }
      }
    } else {
      cell.output = null;
    }
  });

  if (diffPresent) {
    // compute cell to diff against
    // set prior to matching cell in passed version

    // Get current version's cells
    const prior = history.store.getNotebook(ver).cells;
    // Add prior value to each cell
    cells = cells.map((cell) => {
      const cell_id = cell.cell.split(".").slice(0, 2).join(".");

      let priorCell = prior.find(
        (name) => name.split(".").slice(0, 2).join(".") === cell_id
      );

      // Default to first instance of cell
      if (priorCell === undefined) priorCell = `${cell_id}.0`;

      cell.prior = priorCell;
      return cell;
    });
  } else {
    // set prior to previous version of cell
    cells = cells.map((cell) => {
      const prevCell = history.store.getPriorVersion(cell.cell);
      if (!prevCell) {
        cell.prior = `${cell.cell.split(".").slice(0, 2).join(".")}.0`;
      } else {
        cell.prior = prevCell.name;
      }
      return cell;
    });
  }

  // Add cells to cell map
  const loadedCells = new Map();
  cells.forEach((cell, index) => {
    loadedCells.set(cell.cell, {
      name: cell.cell,
      index: index,
      events: cell.events,
      output: cell.output,
      prior: cell.prior,
    });
  });

  // Add output to output map
  const loadedOutput = new Map();
  output.forEach((cell, index) => {
    loadedOutput.set(cell.cell, {
      name: cell.cell,
      events: cell.events,
    });
  });

  return [loadedCells, loadedOutput];
}
