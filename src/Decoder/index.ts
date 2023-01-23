import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { decompress } from "lz4js";
import { CHUNK_SIZE, COMPRESS_PAYLOAD } from "../config/coding";
import ReedSolomon from "../libs/reed-solomon";
import { FileType, generateDownload, uint8ArrayToString } from "../libs/utils";
import "./components/progressBar";
import "./components/filePanel";

const USER_SCROLL_DELAY = 2;

type FramesType = Record<number, Buffer>;
let ac: IScannerControls;
let currentFrameIdx: number | undefined;
let framesOpts:
  | {
      totalPlainFrames: number;
      totalFrames: number;
      blocksCount: number;
      extraBlocksCount: number;
    }
  | undefined;
let frames: FramesType = {};
let parsedFrames: FramesType = {};

const decoderProgressBarEl = document.getElementById(
  "decoderProgressBar"
) as HTMLElement;
const decoderResultEl = document.getElementById(
  "decoderResult"
) as HTMLTextAreaElement;
const decoderDownloadButton = document.getElementById(
  "decoderResultDownload"
) as HTMLButtonElement;
const decoderPreviewEl = document.getElementById("preview") as HTMLVideoElement;
const decoderFilePanelEl = document.getElementById(
  "decoderFilePanel"
) as HTMLElement;
const autoScrollCheckBoxEl = document.getElementById(
  "autoScroll"
) as HTMLInputElement;
const percentProgressEl = document.getElementById(
  "percentProgress"
) as HTMLSpanElement;

const autoScroll: {
  isUserMouseWheel: boolean;
  currentScrollElement?: number;
  setWheelListener: () => void;
  scrollToElement: () => void;
  isScrolling: boolean;
  isUserMouseWheelTimeout: NodeJS.Timer | null;
  isScrollingTimeout: NodeJS.Timer | null;
} = {
  isUserMouseWheel: false,
  currentScrollElement: undefined,
  isScrolling: false,
  isUserMouseWheelTimeout: null,
  isScrollingTimeout: null,

  setWheelListener() {
    document.onwheel = () => {
      if (this.isUserMouseWheel) return;
      if (this.isUserMouseWheelTimeout)
        clearTimeout(this.isUserMouseWheelTimeout);

      this.isUserMouseWheel = true;
      this.isUserMouseWheelTimeout = setTimeout(() => {
        this.isUserMouseWheel = false;
        this.currentScrollElement = undefined;
      }, USER_SCROLL_DELAY * 1000);
    };
  },
  scrollToElement() {
    const isNeedScroll = autoScrollCheckBoxEl.checked;
    const isSameEl = this.currentScrollElement === currentFrameIdx;

    if (
      !this.isUserMouseWheel &&
      !isSameEl &&
      !this.isScrolling &&
      isNeedScroll
    ) {
      if (this.isScrollingTimeout) clearTimeout(this.isScrollingTimeout);
      this.isScrolling = true;
      this.currentScrollElement = currentFrameIdx;
      const currentElement = decoderProgressBarEl.shadowRoot?.getElementById(
        String(currentFrameIdx)
      );

      currentElement?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
      this.isScrollingTimeout = setTimeout(
        () => (this.isScrolling = false),
        1000
      );
    }
  },
};

autoScroll.setWheelListener();

const calcPercentProgress = () => {
  const { totalFrames = 0 } = framesOpts || {};
  const readedFrames = Object.keys(frames).length;
  const percent = (readedFrames / totalFrames) * 100;

  percentProgressEl.innerText = `${percent.toFixed(2)}%`;
};

const setFrames = (data: FramesType) => {
  frames = data;
  if (!framesOpts) return;
  decoderProgressBarEl.setAttribute(
    "done",
    new Array(framesOpts?.totalFrames || 0)
      .fill("")
      .map((_, idx) => (data[idx] ? String(idx) : false))
      .filter((v) => v !== false)
      .join(",")
  );
  decoderProgressBarEl.setAttribute("total", String(framesOpts.totalFrames));
};

const setParsedFrames = (data: FramesType) => {
  parsedFrames = data;

  const frameKeys = Object.keys(parsedFrames).sort(
    (a: string, b: string) => Number(a) - Number(b)
  );

  if (!framesOpts || frameKeys.length !== framesOpts.totalPlainFrames) return;
  const buffer = Buffer.concat(
    frameKeys.map((key: string) => parsedFrames[Number(key)])
  );
  const result = Buffer.from(
    COMPRESS_PAYLOAD
      ? uint8ArrayToString(decompress(buffer))
      : buffer.toString()
  );
  const fileNameSize = result.readUInt8(0);
  const filename = result.slice(1, fileNameSize + 1).toString();
  setResult({ filename, data: result.slice(fileNameSize + 1).toString() });
  ac.stop();
};

const setResult = ({ data, filename }: { data: string; filename: string }) => {
  decoderFilePanelEl.dispatchEvent(
    new CustomEvent("addFile", {
      detail: {
        data,
        filename,
      },
    })
  );
};

const getMissingFrames = () => {
  if (!framesOpts) return;
  const { blocksCount, extraBlocksCount, totalFrames, totalPlainFrames } =
    framesOpts;
  if (!blocksCount || !extraBlocksCount) return;
  const skipRSopt = totalPlainFrames < blocksCount;
  const frameIdxs = new Array(totalFrames)
    .fill("")
    .map((_, index) => !!frames[index])
    .map((frame, index) => {
      if (frame) return true;
      if (skipRSopt) return false;
      const blockIdx = Math.floor(index / (blocksCount + extraBlocksCount));
      if (parsedFrames[blockIdx * blocksCount]) return true;
      return false;
    })
    .map((item, index) => (item ? -1 : index))
    .filter((v) => v > 0);

  return frameIdxs.join(",");
};

const tryProcessBlock = (
  frameId: number,
  frame: Buffer,
  {
    totalPlainFrames,
    totalFrames,
    blocksCount,
    extraBlocksCount,
  }: {
    totalPlainFrames: number;
    totalFrames: number;
    blocksCount: number;
    extraBlocksCount: number;
  }
): void => {
  const rs = new ReedSolomon(extraBlocksCount);
  const newFrames = {
    ...frames,
    [frameId]: frame,
  };
  setFrames({
    ...frames,
    [frameId]: frame,
  });

  if (totalPlainFrames < blocksCount) {
    setParsedFrames({
      ...parsedFrames,
      [frameId]: frame,
    });
    return;
  }
  const blockIdx = Math.floor(frameId / (blocksCount + extraBlocksCount));
  const partStart = blockIdx * (blocksCount + extraBlocksCount);
  const partEnd = Math.min(
    partStart + blocksCount + extraBlocksCount,
    totalFrames
  );
  if (parsedFrames[blockIdx * blocksCount]) return;

  const partChunks = new Array(partEnd - partStart);
  const lostFrames = [];
  for (let i = 0; i < partEnd - partStart; i++) {
    if (newFrames[partStart + i]) {
      partChunks[i] = newFrames[partStart + i];
    } else {
      lostFrames.push(i);
    }
  }
  if (lostFrames.length > extraBlocksCount / 2) return;
  //decode
  const out: number[][] = [];
  for (let pos = 0; pos < CHUNK_SIZE; pos++) {
    const s = [];
    for (const block of partChunks) {
      s.push((block && block[pos]) || 0);
    }
    let decodedStr: number[];
    try {
      decodedStr = rs.decode(s);
    } catch (_) {
      return;
    }
    for (let i = 0; i < decodedStr.length; i++) {
      if (!out[i]) out[i] = [];
      out[i][pos] = decodedStr[i];
    }
  }
  const newParsedFrames = { ...parsedFrames };
  for (let i = 0; i < out.length; i++) {
    newParsedFrames[blockIdx * blocksCount + i] = Buffer.from(out[i]);
  }
  setParsedFrames(newParsedFrames);
};

const updateCurrentBuffer = (currentBuffer: Buffer) => {
  if (!currentBuffer) return;
  currentFrameIdx = currentBuffer.readUInt16LE(4);
  decoderProgressBarEl.setAttribute("current", String(currentFrameIdx));

  if (!frames[currentFrameIdx]) {
    const opts = framesOpts || {
      totalPlainFrames: currentBuffer.readUInt16LE(2),
      totalFrames: currentBuffer.readUInt16LE(0),
      blocksCount: currentBuffer.readUInt8(6),
      extraBlocksCount: currentBuffer.readUInt8(7),
    };
    if (!framesOpts) {
      framesOpts = opts;
    }
    tryProcessBlock(currentFrameIdx, currentBuffer.slice(8), opts);
  }

  autoScroll.scrollToElement();
  calcPercentProgress();
};

const initScan = async () => {
  decoderPreviewEl.style.display = "initial";
  const scanner = new BrowserQRCodeReader(new Map().set("TRY_HARDER", true), {
    delayBetweenScanSuccess: 10,
    delayBetweenScanAttempts: 0,
  });
  try {
    ac = await scanner.decodeFromVideoDevice(
      undefined,
      "preview",
      (res, err) => {
        if (err) return;
        const buffer = Buffer.from(res?.getText() || "", "base64");
        updateCurrentBuffer(buffer);
      }
    );
  } catch (e) {
    console.log(`Can't init video`);
  }
};

const resetVars = () => {
  frames = {};
  parsedFrames = {};
  framesOpts = undefined;
  currentFrameIdx = undefined;
};

const hideDecoderStuff = () => {
  decoderProgressBarEl.dispatchEvent(new CustomEvent("reset"));
  decoderPreviewEl.style.display = "none";
};

window.addEventListener("pageTransition", (ev) => {
  const { detail } = ev as CustomEvent;
  if (detail.page !== "decoder") return;
  if (detail.action === "unload" && ac) {
    ac.stop();
  }
  if (detail.action === "load") {
    initScan();
  }
});

window.addEventListener("decoderSelectFile", (ev) => {
  const { detail } = ev as CustomEvent;
  const { filename, data } = detail;
  hideDecoderStuff();
  decoderResultEl.value = data;
  decoderResultEl.setAttribute("filename", filename);
  decoderResultEl.style.display = "initial";
  decoderDownloadButton.style.display = "initial";
});

window.addEventListener("decoderNewScan", () => {
  resetVars();
  decoderResultEl.style.display = "none";
  decoderDownloadButton.style.display = "none";
  initScan();
});

decoderDownloadButton.onclick = () => {
  const filename = decoderResultEl.getAttribute("filename") as string;
  const content = decoderResultEl.value;
  generateDownload(filename, content, FileType.TEXT);
};
