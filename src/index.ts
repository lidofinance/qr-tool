import "bulma/css/bulma.css";
import "./index.css";
import "./Encoder";
import "./Decoder";

const pages = ["encoder", "decoder"];

const loadPage = (hash: string) => {
  for (const page of pages) {
    const current = document.getElementById(page);
    const link = document.querySelector(`#tabs a[href='#${page}']`);
    if (!current || !link) continue;
    const liNode = link.parentElement;
    if (!liNode) return;
    if ("#" + page === hash) {
      current.style.display = "block";
      liNode.setAttribute("class", "is-active");
      window.dispatchEvent(
        new CustomEvent("pageTransition", { detail: { action: "load", page } })
      );
    } else {
      current.style.display = "none";
      liNode.className = "";
      window.dispatchEvent(
        new CustomEvent("pageTransition", {
          detail: { action: "unload", page },
        })
      );
    }
  }
};

window.addEventListener(
  "hashchange",
  () => {
    loadPage(window.location.hash);
  },
  false
);

window.addEventListener("load", () => {
  loadPage(window.location.hash || "#encoder");
});
