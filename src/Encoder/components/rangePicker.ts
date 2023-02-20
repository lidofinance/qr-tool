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
  <div>
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
    slider.addEventListener("input", function () {
      const value = (this as HTMLInputElement).value;
      display.innerText = value;
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
      this.render();
    }
  }

  render() {
    const { shadowRoot } = this;
    const value = this.getAttribute("value") ?? "";
    const step = this.getAttribute("step") ?? "";
    const min = this.getAttribute("min") ?? "";
    const max = this.getAttribute("max") ?? "";
    const title = this.getAttribute("title") ?? "";

    const display = this.querySelector(".value") as HTMLSpanElement;
    const slider = this.querySelector(".slider") as HTMLInputElement;
    const label = this.querySelector(".label") as HTMLInputElement;

    slider.setAttribute("step", step);
    slider.setAttribute("min", min);
    slider.setAttribute("max", max);
    slider.setAttribute("value", value);
    slider.value = value;

    label.innerText = title;
    display.innerText = `${value}/${max}`;
  }
}

customElements.define("range-picker", RangePicker);
