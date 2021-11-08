import { FileType, generateDownload } from "../../libs/utils";

class ResultImage extends HTMLElement {
  template = ({ src, maxWidth }: { src: string; maxWidth: string }) => `
    <style>
        .result img {
            max-width: ${maxWidth};
            cursor: pointer;
        }
        
    </style>

    <div class="result">
        <img src="${src}" />
    </div>
    `;
  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
  }

  static get observedAttributes() {
    return ["src", "name", "max-width"];
  }

  attributeChangedCallback(
    attrName: string,
    oldValue: string,
    newValue: string
  ) {
    if (newValue !== oldValue) {
      this.setAttribute(attrName, newValue);
    }
    this.render();
  }

  render() {
    const src = this.getAttribute("src");
    if (!src) return (this.innerHTML = "");
    const filename = (this.getAttribute("name") || Date.now()) + ".gif";
    const maxWidth = this.getAttribute("max-width") || "500px";
    this.innerHTML = src ? this.template({ src, maxWidth }) : "";
    const image = this.querySelector("img") as HTMLImageElement;
    image.onclick = () => generateDownload(filename, src, FileType.GIF);
  }
}

customElements.define("result-image", ResultImage);
