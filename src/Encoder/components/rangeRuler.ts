class RangeRuler extends HTMLElement {
  template = ({ min, max }: { min: string | number; max: string | number }) => {
    max = Number(max);
    min = Number(min);

    const totalColumns = 6;
    const step = (max - min + 1) / totalColumns;

    if (step < totalColumns) return ``;
    let columns = "";

    for (let i = 0; i < 6; i++) {
      // const left = Math.floor(min + i * step);
      const right = Math.min(Math.floor(min + (i + 1) * step), max);

      columns += `
        <div class="column wrItem">
          <div class="item">
            <div class="line"></div>
            ${i === 5 ? '' : `~${right}`}
          </div>
        </div>
      `;
    }

    return `
      <style>
        .ruler.is-gapless:last-child {
          margin-bottom: 48px;
        }

        .ruler.is-gapless>.column, .first-column {
          margin: 0 1px;
          padding: 6px 0 !important;
          text-align: center;
        }

        .wrItem {
          position: relative;
        }

        .item {
          position: absolute;
          right: 0;
          display: flex;
          width: 0;
          justify-content: center;
        }

        .line {
          position: absolute;
          height: 50%;
          background: black;
          width: 1px;
          top: -50%;
        }
      </style>
      <div class="ruler columns is-gapless is-mobile">
        ${columns}
      </div>
    `;
  };

  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
  }

  static get observedAttributes() {
    return ["min", "max"];
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
    this.innerHTML = this.template({
      max: this.getAttribute("max") || "",
      min: this.getAttribute("min") || "",
    });
  }
}

customElements.define("range-ruler", RangeRuler);
