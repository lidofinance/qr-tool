class DecoderProgressBar extends HTMLElement {
  template = `
    <style>
    .progressBar {
        width: 208px;
        display: none;
    }    
    .frameItem {
      border: 2px solid #fff;
      margin: 1px;
      display: inline-block;
      background: #330000;
      width: 4px;
      height: 4px;
    }
    .done {
      background-color: #00cc00;
    }
    .active {
      background: red !important;
      outline: 3px solid red;
      outline-offset: -2px;
      border-radius: 2px;
    }
    </style>
    <div class="progressBar"></div>
`;
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.addEventListener("reset", () => {
      this.setAttribute("total", "");
      this.setAttribute("done", "");
      this.setAttribute("current", "");
    });
  }

  connectedCallback() {
    const { shadowRoot } = this;
    if (!shadowRoot) return;
    shadowRoot.innerHTML = this.template;
  }

  static get observedAttributes() {
    return ["current", "total", "done"];
  }

  attributeChangedCallback(
    attrName: string,
    oldValue: string,
    newValue: string
  ) {
    if (newValue !== oldValue) {
      this.setAttribute(attrName, newValue);
      this.render();
    }
  }

  render() {
    const { shadowRoot } = this;
    const total = this.getAttribute("total");
    const current = Number(this.getAttribute("current") || 0);
    const done = (this.getAttribute("done") || "").split(",").map(Number);
    const progressBar = shadowRoot?.querySelector(
      ".progressBar"
    ) as HTMLDivElement;
    progressBar.innerHTML = "";
    if (!total) {
      progressBar.style.display = "none";
      console.log("no total");
      return;
    }
    progressBar.style.display = "block";
    for (let i = 0; i < Number(total); i++) {
      const item = document.createElement("div");

      item.classList.add("frameItem");
      if (i === current) item.classList.add("active");
      if (done.includes(i)) item.classList.add("done");

      item.title = String(i);
      progressBar.appendChild(item);
    }
  }
}

customElements.define("decoder-progress-bar", DecoderProgressBar);
