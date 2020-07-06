import * as renderers from "@jupyterlab/rendermime";
import { OutputAreaModel } from "@jupyterlab/outputarea";
import * as nbformat from "@jupyterlab/nbformat";

import { Widget } from "@lumino/widgets";
import { JSONObject } from "@lumino/coreutils";

import {
  MimeModel,
  IRenderMime,
  IRenderMimeRegistry,
  IOutputModel,
} from "@jupyterlab/rendermime";

import { NodeyOutput } from "../../lilgit/nodey/";
import { OutputHistory } from "../history";
import { FileManager } from "./file-manager";

/*
 *  Render baby exposes some basic markdown and code rendermine capability from JupyterLab.
 *  It's a baby because it is only a small bit of Jupyter's rendermime system
 */
export class RenderBaby {
  latexTypesetter: renderers.ILatexTypesetter;
  linkHandler: any;
  rendermime: IRenderMimeRegistry;
  fileManager: FileManager;

  constructor(
    rendermime: IRenderMimeRegistry,
    latexTypesetter: renderers.ILatexTypesetter,
    linkHandler: any,
    fileManager: FileManager
  ) {
    this.latexTypesetter = latexTypesetter;
    this.linkHandler = linkHandler;
    this.rendermime = rendermime;
    this.fileManager = fileManager;
  }

  async renderMarkdown(div: HTMLElement, text: string) {
    return renderers.renderMarkdown({
      host: div as HTMLElement,
      source: text,
      shouldTypeset: true,
      trusted: true,
      sanitizer: null,
      resolver: null,
      linkHandler: this.linkHandler,
      latexTypesetter: this.latexTypesetter,
    });
  }

  createModel(data: JSONObject): IRenderMime.IMimeModel {
    return new MimeModel({ data });
  }

  async renderOutput(nodey: NodeyOutput) {
    return await Promise.all(
      nodey.raw.map(async (output: nbformat.IOutput) => {
        let widget: Widget;

        // check if output is actually stored offsite
        if (this.isOffsite(output)) {
          let retrieved = await this.fileManager.getOutput(output);
          widget = await this.renderMimeOutput(retrieved);
        } else {
          widget = await this.renderMimeOutput(output);
        }

        if (!widget) {
          // could not be rendered
          widget = new Widget();
          widget.node.innerHTML =
            `No renderer could be ` +
            "found for output. It has the following keys: " +
            Object.keys(output).join(", ");
        }

        return widget;
      })
    );
  }

  private isOffsite(output): output is OutputHistory.Offsite {
    return (
      (output as OutputHistory.Offsite).fileType !== undefined &&
      (output as OutputHistory.Offsite).offsite !== undefined
    );
  }

  private async renderMimeOutput(output: nbformat.IOutput) {
    let area: OutputAreaModel = new OutputAreaModel();
    area.fromJSON([output]);
    let model: IOutputModel = area.get(0);

    let mimeType = this.rendermime.preferredMimeType(model.data, "any");
    if (mimeType) {
      let outputNode = this.rendermime.createRenderer(mimeType);
      await outputNode.renderModel(model).catch((error) => {
        // Manually append error message to output
        outputNode.node.innerHTML = `<pre>Javascript Error: ${error.message}</pre>`;
        // Remove mime-type-specific CSS classes
        outputNode.node.className = "p-Widget jp-RenderedText";
        outputNode.node.setAttribute(
          "data-mime-type",
          "application/vnd.jupyter.stderr"
        );
      });
      return outputNode;
    }
    return undefined;
  }
}
