import { BrowserQRCodeSvgWriter } from "@zxing/browser";
import { stringToChunks } from "../libs/utils";
import { compress } from "lz4js";
import ReedSolomon from "../libs/reed-solomon";
import {
  BLOCKS_COUNT,
  CHUNK_SIZE,
  COMPRESS_PAYLOAD,
  IMAGE_SIZE,
} from "../config/coding";
import "./components/rangePicker";
import "./components/rangeRuler";
import "./components/resultImage";

type EncodeMeta = {
  chunks: { chunk: Uint8Array; index: number }[];
  total: number;
  totalPlain: number;
  blocksCount: number;
  extraBlocksCount: number;
};

const encoderDataEl = document.getElementById(
  "encoderData"
) as HTMLTextAreaElement;

let filename: string;
const qrHints = new Map();
const qrEncoder = new BrowserQRCodeSvgWriter();
let totalChunks: null | number = null;
let currentChunkIndex: number;
let currentMetaData: EncodeMeta;

let qrAnimationTimer: number;

let rangeStartIndex = 0;
let rangeEndIndex = 0;

const pauseQRAnimation = () => {
  clearTimeout(qrAnimationTimer);
};

const encoderFrameDelay = document.getElementById(
  "encoderFrameDelay"
) as HTMLInputElement;
const encoderImageSize = document.getElementById(
  "encoderImageSize"
) as HTMLInputElement;
const progressElement = document.getElementById(
  "encoderPlayProgress"
) as HTMLInputElement;
const progressElementInput = progressElement.querySelector(
  ".slider"
) as HTMLInputElement;
const progressRuler = document.getElementById(
  "encoderPlayRuler"
) as HTMLInputElement;
const frameElement = document.getElementById("encoderFrame") as HTMLElement;
const encoderTimer = document.getElementById("encoderTimer") as HTMLElement;
const encoderPreview = document.getElementById("encoderPreview") as HTMLElement;
const playPauseButton = document.getElementById(
  "playPause"
) as HTMLButtonElement;
const startFrameRange = document.getElementById(
  "startFrameRange"
) as HTMLInputElement;
const endFrameRange = document.getElementById(
  "endFrameRange"
) as HTMLInputElement;

const playPause = {
  isPlaying: false,
  buttonSubscribe() {
    playPauseButton.addEventListener("click", () => {
      if (this.isPlaying) this.pause();
      else this.play();
    });
  },
  pause() {
    pauseQRAnimation();
    this.isPlaying = false;
    playPauseButton.setAttribute("value", "Play");
  },
  play() {
    if (!currentMetaData) return;

    playQRAnimation(currentMetaData, currentChunkIndex);
    this.isPlaying = true;
    playPauseButton.setAttribute("value", "Pause");
  },
};

playPause.buttonSubscribe();
encoderFrameDelay.onchange = (event: Event) => {
  encoderTimer.innerText = getEncoderTimer();
};

encoderImageSize.onchange = () => {
  encoderPreview.style.width = `${getMaxImageSize()}px`;
  encoderPreview.style.height = `${getMaxImageSize()}px`;
};

const getFrameDelayMs = () => {
  const value = encoderFrameDelay.getAttribute("value");
  return Number(value) * 1000;
};

const getMaxImageSize = () => {
  const value = encoderImageSize.getAttribute("value");
  return Number(value);
};

const getEncoderTimer = () => {
  if (!totalChunks) return "00:00 / 00:00";

  const frameDelayMs = getFrameDelayMs();
  const totalMs = totalChunks * frameDelayMs;
  const passedMs = (currentChunkIndex || 0) * frameDelayMs;

  const minutes = Math.floor(totalMs / 60000);
  const seconds = ((totalMs % 60000) / 1000).toFixed(0);
  const totalTime = `${minutes}:${Number(seconds) < 10 ? "0" : ""}${seconds}`;

  const resMinutes = Math.floor(passedMs / 60000);
  const resSeconds = ((passedMs % 60000) / 1000).toFixed(0);
  const resTime = `${resMinutes}:${
    Number(resSeconds) < 10 ? "0" : ""
  }${resSeconds}`;

  return `~ ${resTime} / ${totalTime} `;
};

const playQRAnimation = (encodedResult: EncodeMeta, index = 0) => {
  pauseQRAnimation();

  const frameDelay = getFrameDelayMs();
  const { chunks, ...meta } = encodedResult;
  const chunk = chunks[index];

  currentChunkIndex = index;
  drawFrame(chunk, meta);

  // next frame
  qrAnimationTimer = setTimeout(() => {
    const start = rangeStartIndex ? rangeStartIndex : 0;
    const end = rangeEndIndex ? rangeEndIndex : chunks.length;
    const currentIndex = index <= start ? start : index;

    const nextIndex = currentIndex + 1 <= end ? currentIndex + 1 : start;
    playQRAnimation(encodedResult, nextIndex);
  }, frameDelay) as any;
};

const drawFrame = (
  {
    index,
    chunk,
  }: {
    index: number;
    chunk: Uint8Array;
  },
  {
    blocksCount,
    extraBlocksCount,
    total,
    totalPlain,
  }: {
    blocksCount: number;
    extraBlocksCount: number;
    total: number;
    totalPlain: number;
  }
) => {
  const imageSize = getMaxImageSize();
  const text = Buffer.concat([
    Buffer.from(new Uint16Array([total, totalPlain, index]).buffer),
    Buffer.from(new Uint8Array([blocksCount, extraBlocksCount]).buffer),
    chunk,
  ]);

  const contents = text.toString("base64");
  const svg = qrEncoder.write(contents, imageSize, imageSize, qrHints);

  frameElement.innerHTML = "";
  frameElement.innerHTML = svg.outerHTML;

  progressElement.setAttribute("value", String(index));
  progressElement.setAttribute("min", String(0));
  progressElement.setAttribute("max", String(total - 1));

  progressRuler.setAttribute("min", String(0));
  progressRuler.setAttribute("max", String(total - 1));

  encoderTimer.innerText = getEncoderTimer();
};

const compressPayload = (payload: string): Uint8Array => {
  return COMPRESS_PAYLOAD
    ? compress(Buffer.from(payload))
    : Buffer.from(payload);
};

const solomonReedChunks = (
  chunks: Uint8Array[],
  {
    blocksCount,
    extraBlocksCount,
  }: {
    blocksCount: number;
    extraBlocksCount: number;
  }
): Uint8Array[] => {
  const rs = new ReedSolomon(extraBlocksCount);
  const out: number[][] = [];
  if (chunks.length < blocksCount) {
    return chunks;
  }
  const iterations = Math.ceil(chunks.length / blocksCount);
  for (let i = 0; i < iterations; i++) {
    const blocksIndexCeil = Math.min((i + 1) * blocksCount, chunks.length);
    for (let pos = 0; pos < CHUNK_SIZE; pos++) {
      let s = [];
      //get one char from each chunk to compose s[blockCount]
      for (
        let blockIdx = i * blocksCount;
        blockIdx < blocksIndexCeil;
        blockIdx++
      ) {
        s.push(chunks[blockIdx][pos] || 0);
      }
      //encode it
      const eccStr = rs.encode(s);
      //put it into stretched out
      for (let j = 0; j < eccStr.length; j++) {
        const idx = (blocksCount + extraBlocksCount) * i + j;
        if (!out[idx]) out[idx] = [];
        out[idx][pos] = eccStr[j];
      }
    }
  }
  return out.map((row) => Buffer.from(row));
};

const collectInputValues = (ids: string[]) => {
  const out: Record<string, string | number> = {};
  for (const id of ids) {
    const el = document.getElementById(id) as HTMLInputElement;
    if (!el) continue;
    out[id] =
      el.nodeName === "RANGE-PICKER"
        ? Number(el.getAttribute("value"))
        : el.value;
  }
  return out;
};

const setGifProgress = (v: number | undefined) => {
  const wr = document.getElementById("encoderStartSettings");
  const el = document.getElementById("encoderProgress");
  if (!wr || !el) return;
  if (v == null) {
    wr.classList.remove("encoder-progress");
    return;
  }
  wr.classList.add("encoder-progress");
  el.setAttribute("value", v.toString());
};

const addLog = async (s: string): Promise<void> => {
  const el = document.getElementById("encoderLogs");
  if (!el) return;
  const newItem = document.createElement("div");
  newItem.innerHTML = s;
  el.appendChild(newItem);
  await new Promise<void>((r) => setTimeout(() => r(), 0));
};

const cleanLog = () => {
  const el = document.getElementById("encoderLogs");
  if (!el) return;
  el.innerHTML = "";
};

const encode = async () => {
  cleanLog();

  const { encoderData, encoderErrorCorrection } = collectInputValues([
    "encoderData",
    "encoderErrorCorrection",
  ]);
  if (!encoderData || !encoderErrorCorrection) return;

  const blocksCount = BLOCKS_COUNT;
  const extraBlocksCount =
    ((BLOCKS_COUNT * Number(encoderErrorCorrection)) / 100) | 0;
  await addLog(`Filename: ${filename || ""}`);
  await addLog(`extraBlocksCount ${extraBlocksCount}`);
  const stringData = encoderData.toString();
  // pack into header filename and file length with their data length(uint8)
  const fileNameHeader = Buffer.concat([
    Buffer.from([filename ? filename.length : 0]),
    Buffer.from(filename || ""),
    Buffer.from([stringData.length.toString().length]),
    Buffer.from(stringData.length.toString()),
  ]);
  const payload = fileNameHeader.toString() + encoderData.toString();
  const compressedPayload = compressPayload(payload);
  await addLog(`Compressed length: ${compressedPayload.length}`);
  setGifProgress(20);
  const parts = stringToChunks(compressedPayload, CHUNK_SIZE);
  await addLog(`Chunks before: ${parts.length}`);
  setGifProgress(50);
  const chunks = solomonReedChunks(parts, {
    blocksCount,
    extraBlocksCount,
  }).map((chunk, index) => ({ chunk, index }));
  await addLog(`Chunks count: ${chunks.length}`);
  setGifProgress(100);

  if (!chunks.length) {
    await addLog(`😖 No frames to include into gif`);
    setGifProgress(undefined);
    return;
  }

  const meta: EncodeMeta = {
    chunks,
    total: chunks.length,
    totalPlain: parts.length,
    blocksCount,
    extraBlocksCount,
  };
  totalChunks = chunks.length;
  currentMetaData = meta;

  // draw first frame
  drawFrame(chunks[0], meta);

  rangeStartIndex = 0;
  rangeEndIndex = chunks.length - 1;
  startFrameRange.value = "0";
  endFrameRange.value = `${chunks.length - 1}`;

  progressElementInput.onmousedown = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    pauseQRAnimation();
  };

  progressElementInput.onmouseup = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement)) return;

    const index = Number(event.target.value);
    currentChunkIndex = index;
    if (playPause.isPlaying) playQRAnimation(meta, index);
    encoderTimer.innerText = getEncoderTimer();

    const chunk = chunks[index];
    drawFrame(chunk, meta);
  };

  progressElementInput.onchange = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement)) return;

    const index = Number(event.target.value);
    currentChunkIndex = index;

    const chunk = chunks[index];
    drawFrame(chunk, meta);
  };

  startFrameRange.onchange = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement)) return;

    const index = Math.min(
      Math.max(Number(event.target.value), 0),
      rangeEndIndex - 1
    );
    rangeStartIndex = index;

    event.target.value = String(index);
  };

  endFrameRange.onchange = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement)) return;

    const index = Math.min(
      Math.max(Number(event.target.value), rangeStartIndex + 1),
      chunks.length - 1
    );
    rangeEndIndex = index;

    event.target.value = String(index);
  };

  setGifProgress(undefined);
};

document
  .getElementById("encodeStart")
  ?.addEventListener("click", () => encode());

encoderDataEl.addEventListener("drop", function (event) {
  event.preventDefault();
  if (
    event.dataTransfer &&
    event.dataTransfer.items &&
    event.dataTransfer.items.length
  ) {
    const item = event.dataTransfer.items[0];
    const file = item.getAsFile();
    if (!file) return;
    filename = file.name.substring(0, 255);
    (async () => {
      const contents = await file?.text();
      const textareaEL = document.getElementById(
        "encoderData"
      ) as HTMLTextAreaElement;
      if (!textareaEL || !contents) return;
      textareaEL.value = contents;
      cleanLog();
      await addLog(`File added: ${filename}; Size: ${contents.length}`);

      encode();
    })();
  }
});

encoderDataEl.addEventListener("dragenter", function (event) {
  this.setAttribute(
    "original-placeholder",
    this.getAttribute("placeholder") || ""
  );
  this.setAttribute("placeholder", "Drop it here!");
  this.className = "textarea has-background-primary-light";
});

encoderDataEl.addEventListener("dragleave", function (event) {
  this.setAttribute(
    "placeholder",
    this.getAttribute("original-placeholder") || ""
  );
  this.className = "textarea";
});

const debounce = (func: () => void, timeout = 500) => {
  let timer: NodeJS.Timeout;

  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this);
    }, timeout);
  };
};

encoderDataEl.addEventListener(
  "input",
  debounce(function () {
    encode();
  })
);

encoderPreview.style.width = `${getMaxImageSize()}px`;
encoderPreview.style.height = `${getMaxImageSize()}px`;
