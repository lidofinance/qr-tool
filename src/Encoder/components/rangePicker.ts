class RangePicker extends HTMLElement {
  template = ({
    max,
    min,
    value,
    title,
    divider,
  }: {
    max: string;
    min: string;
    value: string;
    title: string;
    divider: number;
  }) => `
  <div class="field">
    <label class="label">${title}</label>
    <div class="control">
        <input
        type="range"
        min="${min}"
        max="${max}"
        value="${value}"
        class="slider"
        />
        <span>(<span class="value">${this.formatValue(
          divider,
          value
        )}</span>)</span>
    </div>
    </div>
  `;
  constructor() {
    super();
  }

  formatValue(divider: number, value: string) {
    return divider !== 1 ? (Number(value) / divider).toFixed(1) : value;
  }

  connectedCallback() {
    const divider = Number(this.getAttribute("divider") || "1");
    this.innerHTML = this.template({
      max: this.getAttribute("max") || "",
      min: this.getAttribute("min") || "",
      value: this.getAttribute("value") || "",
      title: this.getAttribute("title") || "",
      divider,
    });
    const slider = this.querySelector(".slider") as HTMLInputElement;
    const display = this.querySelector(".value") as HTMLSpanElement;
    const self = this;
    slider.addEventListener("change", function () {
      const value = (this as HTMLInputElement).value;
      display.innerHTML = self.formatValue(divider, value);
      self.setAttribute("value", value);
      self.dispatchEvent(new CustomEvent("change"));
    });
  }

  static get observedAttributes() {
    return ["step", "max", "value", "title"];
  }

  attributeChangedCallback(
    attrName: string,
    oldValue: string,
    newValue: string
  ) {
    if (newValue !== oldValue) {
      this.setAttribute(attrName, newValue);
    }
  }
}

customElements.define("range-picker", RangePicker);
