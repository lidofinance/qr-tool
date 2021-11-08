const HIGHLIGHT_CLASS = "panel-block has-background-light";
const PLAIN_CLASS = "panel-block";
class FilePanel extends HTMLElement {
  template = `
  <nav class="panel">
  
  </nav>
    `;

  items: { ts: Date; data: string; selected: boolean; filename: string }[] = [];

  constructor() {
    super();
  }

  connectedCallback() {
    this.addEventListener("addFile", (ev) => {
      const { detail } = ev as CustomEvent;
      const { filename, data } = detail;
      this.addItem(filename || Date.now() + ".txt", data);
    });
    this.render();
  }

  addItem(filename: string, data: string) {
    this.items = [
      {
        data,
        ts: new Date(),
        selected: false,
        filename,
      },
      ...this.items,
    ];
    this.render();
    this.selectItem(0);
  }

  selectItem(selectIdx: number) {
    const panel = this.querySelector(".panel") as HTMLDivElement;
    const links = panel.querySelectorAll("a");
    this.items.forEach((item, idx) => {
      if (selectIdx === idx) {
        links[idx].className = HIGHLIGHT_CLASS;
        window.dispatchEvent(
          new CustomEvent("decoderSelectFile", {
            detail: { ...item },
          })
        );
      } else {
        links[idx].className = PLAIN_CLASS;
      }
    });
  }

  resetButton() {
    const button = document.createElement("button");
    button.innerText = "New Scan";
    button.className = "button is-primary";
    button.onclick = () => {
      window.dispatchEvent(new CustomEvent("decoderNewScan"));
      this.items = this.items.map((item) => ({ ...item, selected: false }));
      this.render();
    };
    const el = document.createElement("div");
    el.className = PLAIN_CLASS;
    el.appendChild(button);

    return el;
  }

  render() {
    this.innerHTML = this.template;
    const panel = this.querySelector(".panel") as HTMLDivElement;
    if (!this.items.length) {
      panel.innerHTML = `<div class="${PLAIN_CLASS}">No files yet</div>`;
      return;
    }
    this.items.forEach((item, idx) => {
      const htmlItem = document.createElement("a");
      htmlItem.innerText = item.filename;
      htmlItem.title = item.ts.toString();
      htmlItem.className = item.selected ? HIGHLIGHT_CLASS : PLAIN_CLASS;
      htmlItem.onclick = () => this.selectItem(Number(idx));
      panel.appendChild(htmlItem);
    });
    panel.appendChild(this.resetButton());
  }
}

customElements.define("decoder-file-panel", FilePanel);
