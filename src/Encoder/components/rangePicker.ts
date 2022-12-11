class RangePicker extends HTMLElement {
  template = ({
    max,
    min,
    step,
    value,
    title,
  }: {
    max: string;
    min: string;
    step: string;
    value: string;
    title: string;
  }) => `
  <div class="field">
    <label class="label">${title}</label>
    <div class="control">
        <input
        type="range"
        step="${step}"
        min="${min}"
        max="${max}"
        value="${value}"
        class="slider"
        />
        <span>(<span class="value">${value}</span>)</span>
    </div>
    </div>
  `;
  constructor() {
    super();
  }

  connectedCallback() {
    this.innerHTML = this.template({
      step: this.getAttribute("step") || "",
      max: this.getAttribute("max") || "",
      min: this.getAttribute("min") || "",
      value: this.getAttribute("value") || "",
      title: this.getAttribute("title") || "",
    });
    const slider = this.querySelector(".slider") as HTMLInputElement;
    const display = this.querySelector(".value") as HTMLSpanElement;
    const self = this;
    slider.addEventListener("change", function () {
      const value = (this as HTMLInputElement).value;
      display.innerHTML = value;
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
