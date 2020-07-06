import { Widget } from "@lumino/widgets";
import { log } from "../notebook";
import * as JSDiff from "diff";
import {
  Nodey,
  NodeyCell,
  NodeyCode,
  NodeyCodeCell,
  NodeyMarkdown,
  NodeyOutput,
  SyntaxToken,
} from "../nodey";

import { CodeCell, Cell } from "@jupyterlab/cells";

import { History } from "../history";

import { ASTUtils } from "../analysis/ast-utils";

import { RenderBaby } from "../jupyter-hooks/render-baby";

import { Signal } from "@lumino/signaling";

const SEARCH_FILTER_RESULTS = "v-VerdantPanel-sample-searchResult";
const CHANGE_NONE_CLASS = "v-Verdant-sampler-code-same";
const CHANGE_ADDED_CLASS = "v-Verdant-sampler-code-added";
const CHANGE_REMOVED_CLASS = "v-Verdant-sampler-code-removed";
const MARKDOWN_LINEBREAK = "v-Verdant-sampler-markdown-linebreak";

const MAX_WORD_DIFFS = 4;

export class Sampler {
  readonly history: History;
  private readonly renderBaby: RenderBaby;
  private _targetChanged = new Signal<this, Nodey>(this);
  private _target: Nodey;

  constructor(historyModel: History, renderBaby: RenderBaby) {
    this.history = historyModel;
    this.renderBaby = renderBaby;
  }

  get notebook() {
    return this.history.notebook;
  }

  public get target() {
    if (!this._target) {
      if (this.notebook.view.activeCell) {
        this._target = this.notebook.getCell(
          this.notebook.view.activeCell.model
        ).lastSavedModel;
      }
    }
    return this._target;
  }

  public set target(nodey: Nodey) {
    log("new target!", nodey);
    this._target = nodey;
    this._targetChanged.emit(this._target);
  }

  get targetChanged(): Signal<this, Nodey> {
    return this._targetChanged;
  }

  public clearTarget() {
    this._target = null;
  }

  public figureOutTarget(
    parent: NodeyCell,
    cell: Cell,
    elem: HTMLElement | string
  ) {
    if (parent instanceof NodeyCodeCell) {
      if (elem instanceof HTMLElement)
        return this.figureOut_byElem(parent, cell as CodeCell, elem);
      else {
        let res = this.figureOut_byText(parent, elem);
        if (res instanceof NodeyCode) return res;
        else return undefined;
      }
    } else return parent;
  }

  private figureOut_byText(
    parent: NodeyCode,
    text: string
  ): string | NodeyCode {
    let rend = "";
    if (parent.literal) {
      rend = parent.literal;
    } else if (parent.content.length > 0) {
      for (var i = 0; i < parent.content.length; i++) {
        let name = parent.content[i];
        if (name instanceof SyntaxToken) rend += name.tokens;
        else {
          let nodey = this.history.store.get(name) as NodeyCode;
          let res: string | NodeyCode = this.figureOut_byText(nodey, text);
          if (res instanceof Nodey) return res;
          else rend += res + "";
        }
      }
    }
    if (rend === text || rend.indexOf(text) > -1) return parent;
    else return rend;
  }

  private figureOut_byElem(
    parent: NodeyCodeCell,
    cell: CodeCell,
    elem: HTMLElement
  ) {
    log("figuring out target");
    let codeBlock = this.findAncestor(elem, "CodeMirror-code");
    let lineCount = codeBlock.getElementsByClassName("CodeMirror-line").length;
    let lineDiv = this.findAncestor(elem, "CodeMirror-line");
    let lineNum = Math.round(
      (lineDiv.offsetTop / codeBlock.offsetHeight) * lineCount
    );
    let lineText = cell.editor.getLine(lineNum);
    let res;
    let startCh = 0;
    let endCh = lineText.length - 1;

    if (!elem.hasAttribute("role")) {
      // not a full line in Code Mirror
      let spanRol = this.findAncestorByAttr(elem, "role");
      startCh = Math.round(
        (elem.offsetLeft / spanRol.offsetWidth) * lineText.length
      );
      endCh = Math.round(
        ((elem.offsetLeft + elem.offsetWidth) / spanRol.offsetWidth) *
          lineText.length
      );
      endCh = Math.min(endCh, lineText.length - 1);
    }

    res = ASTUtils.findNodeAtRange(
      parent,
      {
        start: { line: lineNum, ch: startCh },
        end: { line: lineNum, ch: endCh },
      },
      this.history
    );
    return res || parent; //just in case no more specific result is found
  }

  private findAncestorByAttr(el: HTMLElement, attr: string) {
    if (el.hasAttribute(attr)) return el;
    while ((el = el.parentElement) && !el.hasAttribute(attr));
    return el;
  }

  private findAncestor(el: HTMLElement, cls: string) {
    if (el.classList.contains(cls)) return el;
    while ((el = el.parentElement) && !el.classList.contains(cls));
    return el;
  }

  public sampleNode(nodey: Nodey, textFocus: string = null): [string, number] {
    // goal get the first line of the node
    if (nodey instanceof NodeyMarkdown) {
      if (!nodey.markdown) return ["", 0];
      let lines = nodey.markdown.split("\n");
      if (textFocus) {
        let index = -1;
        let focusLine = lines.find((ln) => {
          let i = ln
            .toLowerCase()
            .indexOf(textFocus.toLowerCase().split(" ")[0]);
          if (i > -1) index = i;
          return i > -1;
        });
        return [focusLine, index];
      } else return [lines[0], 0];
    } else {
      let nodeyCode = nodey as NodeyCode;
      if (textFocus) {
        let index = -1;
        let lines = this.renderNode(nodeyCode).toLowerCase().split("\n");
        let focusLine = lines.find((ln) => {
          let i = ln.toLowerCase().indexOf(textFocus.split(" ")[0]);
          if (i > -1) index = i;
          return i > -1;
        });
        return [focusLine, index];
      } else {
        let lineNum = 0;
        if (nodeyCode.start) lineNum = nodeyCode.start.line;
        let line = "";
        return [this.getLineContent(lineNum, line, nodeyCode), 0];
      }
    }
  }

  private getLineContent(
    lineNum: number,
    line: string,
    nodeyCode: NodeyCode
  ): string {
    if (nodeyCode.literal) {
      line += nodeyCode.literal.split("\n")[0];
    } else if (nodeyCode.content) {
      nodeyCode.content.forEach((name) => {
        if (name instanceof SyntaxToken) {
          line += name.tokens;
        } else {
          var child = this.history.store.get(name) as NodeyCode;
          if (child.start && child.start.line === lineNum) {
            line = this.getLineContent(lineNum, line, child);
          } else {
            line = this.getLineContent(lineNum, line, child);
            let ls = line.split("\n");
            if (ls.length > 1) return ls[0];
          }
        }
      });
    }
    return line;
  }

  public renderNode(nodey: Nodey): string {
    if (nodey instanceof NodeyCode) return this.renderCodeNode(nodey);
    else if (nodey instanceof NodeyMarkdown)
      return this.renderMarkdownNode(nodey);
    else if (nodey instanceof NodeyOutput) return this.renderOutputNode(nodey);
  }

  private renderCodeNode(nodey: NodeyCode): string {
    let literal = nodey.literal || "";
    if (nodey.content) {
      nodey.content.forEach((name) => {
        if (name instanceof SyntaxToken) {
          literal += name.tokens;
        } else {
          let child = this.history.store.get(name);
          literal += this.renderCodeNode(child as NodeyCode);
        }
      });
    }
    return literal;
  }

  private renderMarkdownNode(nodey: NodeyMarkdown): string {
    return nodey.markdown;
  }

  private renderOutputNode(nodey: NodeyOutput): string {
    return JSON.stringify(nodey.raw);
  }

  public async renderArtifactCell(
    nodey: Nodey,
    elem: HTMLElement,
    newText?: string
  ) {
    switch (nodey.typeChar) {
      case "c":
        this.plainCode(elem, newText);
        break;
      case "o":
        await this.renderOutput(nodey as NodeyOutput, elem);
        break;
      case "m":
        await this.renderBaby.renderMarkdown(elem, newText);
        break;
    }
    return elem;
  }

  public async renderSearchCell(
    nodey: Nodey,
    elem: HTMLElement,
    textFocus?: string,
    newText?: string
  ) {
    switch (nodey.typeChar) {
      case "c":
        this.plainCode(elem, newText);
        elem.classList.remove("code");
        break;
      case "o":
        await this.renderOutput(nodey as NodeyOutput, elem);
        break;
      case "m":
        await this.renderBaby.renderMarkdown(elem, newText);
        break;
    }
    if (textFocus) {
      elem = this.highlightText(textFocus, elem);
    }
    return elem;
  }

  public async renderDiffCell(
    nodey: Nodey,
    elem: HTMLElement,
    diffKind: number = Sampler.NO_DIFF,
    newText?: string,
    prior?: string
  ) {
    switch (nodey.typeChar) {
      case "c":
        this.diffCode(elem, newText, diffKind, prior);
        break;
      case "o":
        await this.renderOutput(nodey as NodeyOutput, elem);
        break;
      case "m":
        await this.diffMarkdown(elem, diffKind, newText, prior);
        break;
    }
  }

  // Methods for rendering code cells

  private plainCode(elem: HTMLElement, newText: string) {
    /* Inserts code data to elem */

    // Split new text into lines
    newText.split("\n").forEach((line) => {
      // Append a div with line contents to elem
      let div = document.createElement("div");
      div.innerHTML = line;
      elem.appendChild(div);
    });

    return elem;
  }

  private diffCode(
    elem: HTMLElement,
    newText: string,
    diffKind: number = Sampler.NO_DIFF,
    priorVersion?: string
  ) {
    /* Inserts code data to elem with diffs if necessary */

    // If no diff necessary, use plaincode
    if (diffKind === Sampler.NO_DIFF) return this.plainCode(elem, newText);

    // Split new text into lines
    let lines = newText.split("\n");

    // Split old text into lines
    let prior = this.history.store.get(priorVersion) as NodeyCode;
    let oldLines = this.renderCodeNode(prior).split("\n");

    // Loop over lines and append diffs to elem
    const maxLength = Math.max(lines.length, oldLines.length);
    for (let i = 0; i < maxLength; i++) {
      let newLine = lines[i] || "";
      let oldLine = oldLines[i] || "";
      elem.appendChild(this.diffLine(oldLine, newLine));
    }

    return elem;
  }

  private diffLine(oldText: string, newText: string) {
    /* Diffs a single line. */
    let line = document.createElement("div");
    let innerHTML = "";
    let diff = JSDiff.diffWords(oldText, newText);
    if (diff.length > MAX_WORD_DIFFS) diff = JSDiff.diffLines(oldText, newText);
    diff.forEach((part) => {
      let partDiv = document.createElement("span");
      //log("DIFF", part);
      partDiv.textContent = part.value;
      if (part.added) {
        partDiv.classList.add(CHANGE_ADDED_CLASS);
        innerHTML += partDiv.outerHTML;
      } else if (part.removed) {
        partDiv.classList.add(CHANGE_REMOVED_CLASS);
        innerHTML += partDiv.outerHTML;
      } else {
        innerHTML += part.value;
      }
    });
    line.innerHTML = innerHTML;
    return line;
  }

  // Methods for rendering markdown cells

  private async diffMarkdown(
    elem: HTMLElement,
    diffKind: number = Sampler.NO_DIFF,
    newText?: string,
    priorVersion?: string
  ) {
    if (diffKind === Sampler.NO_DIFF)
      await this.renderBaby.renderMarkdown(elem, newText);
    else {
      let prior = this.history.store.get(priorVersion) as NodeyMarkdown;
      if (!prior || !prior.markdown) {
        // easy, everything is added
        await this.renderBaby.renderMarkdown(elem, newText);
        elem.classList.add(CHANGE_ADDED_CLASS);
      } else {
        let priorText = prior.markdown;
        let diff = JSDiff.diffWords(priorText, newText);
        if (diff.length > MAX_WORD_DIFFS) {
          diff = JSDiff.diffLines(priorText, newText, {newlineIsToken: true});
        }
        const divs = diff.map(async part => {
          let partDiv: HTMLElement;
          if (part.value === "\n") {
            partDiv = document.createElement("br");
            partDiv.classList.add(MARKDOWN_LINEBREAK);
          } else {
            partDiv = document.createElement("span");
            await this.renderBaby.renderMarkdown(partDiv, part.value);

            partDiv.classList.add(CHANGE_NONE_CLASS);

            if (part.added) {
              partDiv.classList.add(CHANGE_ADDED_CLASS);
            } else if (part.removed) {
              partDiv.classList.add(CHANGE_REMOVED_CLASS);
            }
          }
          return partDiv;
        });

        await Promise.all(divs)
          .then(
            elems => elems.forEach(
              e => elem.appendChild(e)
            )
          );

      }
    }

    return elem;
  }

  // Methods for rendering output cells

  private async renderOutput(nodey: NodeyOutput, elem: HTMLElement) {
    let widgetList = await this.renderBaby.renderOutput(nodey);
    widgetList.forEach((widget: Widget) => {
      elem.appendChild(widget.node);
    });
    return elem;
  }

  // Helper method for search cells

  private highlightText(textFocus: string, elem: HTMLElement) {
    /* Highlight text in an HTML element */

    // get down to the bare text for highlighting
    if (elem.children.length > 0) {
      let elems = Array.from(elem.children).map(
        (e) => this.highlightText(textFocus, e as HTMLElement).outerHTML
      );
      elem.innerHTML = elems.join("");
    } else {
      let i = 0;
      let split = textFocus.split(" ");
      let keys = textFocus.toLowerCase().split(" ");
      let lower = elem.innerHTML.toLowerCase();
      let index = lower.indexOf(keys[0], i);
      let html = "";
      while (index > -1) {
        html += `${elem.innerHTML.slice(i, index)} 
           <span class="${SEARCH_FILTER_RESULTS}"> ${split[0]} </span>`;
        i = index + split[0].length;
        index = lower.indexOf(keys[0], i);
      }

      html += elem.innerHTML.slice(i);
      elem.innerHTML = html;
    }
    return elem; // finally return element
  }
}

export namespace Sampler {
  export const NO_DIFF = -1;
  export const CHANGE_DIFF = 0;
  export const PRESENT_DIFF = 1;
}

export enum SAMPLE_TYPE {
  /* types of render callers */
  DIFF,
  ARTIFACT,
  SEARCH,
}
