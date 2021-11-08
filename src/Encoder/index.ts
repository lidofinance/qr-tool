import { BrowserQRCodeSvgWriter } from "@zxing/browser";
import gifshot from "gifshot";
import { FileType, stringToChunks } from "../libs/utils";
import { compress } from "mini-lz4";
import asyncPool from "tiny-async-pool";
import ReedSolomon from "../libs/reed-solomon";
import {
  BLOCKS_COUNT,
  CHUNK_SIZE,
  COMPRESS_PAYLOAD,
  IMAGE_SIZE,
} from "../config/coding";
import "./components/rangePicker";
import "./components/resultImage";

const encoderDataEl = document.getElementById(
  "encoderData"
) as HTMLTextAreaElement;

let filename: string;
const qrHints = new Map();
const qrEncoder = new BrowserQRCodeSvgWriter();
const createQR = (
  chunk: Uint8Array,
  {
    index,
    total,
    totalPlain,
    blocksCount,
    extraBlocksCount,
  }: {
    blocksCount: number;
    extraBlocksCount: number;
    index: number;
    total: number;
    totalPlain: number;
  }
): Promise<string> =>
  new Promise((r) => {
    const text = Buffer.concat([
      Buffer.from(new Uint16Array([total, totalPlain, index]).buffer),
      Buffer.from(new Uint8Array([blocksCount, extraBlocksCount]).buffer),
      chunk,
    ]);
    const svg = qrEncoder.write(
      text.toString("base64"),
      IMAGE_SIZE,
      IMAGE_SIZE,
      qrHints
    );
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    canvas.width = IMAGE_SIZE;
    canvas.height = IMAGE_SIZE;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
    ctx.fillStyle = "#000";
    for (const rect of svg.getElementsByTagName("rect")) {
      ctx.fillRect(
        parseInt(rect.getAttribute("x") || "0"),
        parseInt(rect.getAttribute("y") || "0"),
        parseInt(rect.getAttribute("width") || "0"),
        parseInt(rect.getAttribute("height") || "0")
      );
    }
    const image = canvas.toDataURL();
    canvas.remove();
    r(image);
  });

const compressPayload = (payload: string): Uint8Array => {
  return COMPRESS_PAYLOAD ? compress(payload) : Buffer.from(payload);
};

const solmonReedChunks = (
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
  const el = document.getElementById("encoderProgress");
  if (!el) return;
  if (!v) {
    el.style.display = "none";
    return;
  }
  el.style.display = "block";
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

const setResultImage = (data: string | undefined) => {
  const el = document.getElementById("encoderResult");
  if (!el) return;
  el.setAttribute("name", filename || "");
  el.setAttribute("src", data || "");
};

const encode = async () => {
  cleanLog();
  setResultImage(undefined);
  const { encoderData, encoderErrorCorrection, encoderFrameDelay } =
    collectInputValues([
      "encoderData",
      "encoderErrorCorrection",
      "encoderFrameDelay",
    ]);
  if (!encoderData || !encoderErrorCorrection || !encoderFrameDelay) return;
  const { encoderIncludeOnlyFrames } = collectInputValues([
    "encoderIncludeOnlyFrames",
  ]);
  const frameDuration = Number(encoderFrameDelay) / 10;
  const exactFrames = encoderIncludeOnlyFrames
    .toString()
    .split(/\D+/)
    .filter((v) => v !== "")
    .map(Number);
  const blocksCount = BLOCKS_COUNT;
  const extraBlocksCount =
    ((BLOCKS_COUNT * Number(encoderErrorCorrection)) / 100) | 0;
  await addLog(`extraBlocksCount ${extraBlocksCount}`);
  const fileNameHeader = Buffer.concat([
    Buffer.from([filename ? filename.length : 0]),
    Buffer.from(filename || ""),
  ]);
  const payload = fileNameHeader.toString() + encoderData.toString();
  const compressedPayload = compressPayload(payload);
  await addLog(`Compressed length: ${compressedPayload.length}`);
  setGifProgress(2);
  const parts = stringToChunks(compressedPayload, CHUNK_SIZE);
  await addLog(`Chunks before: ${parts.length}`);
  setGifProgress(5);
  const chunks = solmonReedChunks(parts, { blocksCount, extraBlocksCount });
  await addLog(`Chunks count ${chunks.length}`);
  await addLog(`Creating qrs...`);
  setGifProgress(10);

  const images = await asyncPool(
    10,
    chunks.map((chunk, index) => ({ data: chunk, index })),
    (chunk) => {
      return createQR(chunk.data, {
        index: chunk.index,
        total: chunks.length,
        totalPlain: parts.length,
        blocksCount,
        extraBlocksCount,
      });
    }
  );
  setGifProgress(20);

  const imagesToProcess = exactFrames.length
    ? images.filter((_, index) => exactFrames.includes(index))
    : images;

  await addLog(
    `Creating GIF from ${
      imagesToProcess.length
    } images (filter: ${JSON.stringify(
      exactFrames
    )}) frame duration: ${frameDuration}`
  );
  if (!imagesToProcess.length) {
    await addLog(`😖 No frames to include into gif`);
    setGifProgress(undefined);
    return;
  }

  gifshot.createGIF(
    {
      images: imagesToProcess,
      gifWidth: IMAGE_SIZE,
      gifHeight: IMAGE_SIZE,
      numWorkers: 3,
      progressCallback: function (captureProgress: any) {
        setGifProgress((captureProgress * 80 + 20) | 0);
      },
      frameDuration: frameDuration * 10,
    },
    function (obj: { error: any; image: any }) {
      if (!obj.error) {
        setGifProgress(undefined);
        setResultImage(obj.image);
      }
    }
  );
};

document
  .getElementById("encodeStart")
  ?.addEventListener("click", () => encode());

document
  .getElementById("encoderImageSize")
  ?.addEventListener("change", function () {
    const value = this.getAttribute("value");
    const el = document.getElementById("encoderResult");
    el?.setAttribute("max-width", `${value}px`);
  });

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
    filename = file.name.substr(0, 255);
    (async () => {
      const contents = await file?.text();
      const textareaEL = document.getElementById(
        "encoderData"
      ) as HTMLTextAreaElement;
      if (!textareaEL || !contents) return;
      textareaEL.value = contents;
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
