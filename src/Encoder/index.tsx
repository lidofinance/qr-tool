import React, { useRef, useState } from "react";
import { compress, decompress } from "mini-lz4";
import Dropzone from "react-dropzone";
import { BrowserQRCodeSvgWriter } from "@zxing/browser";
import gifshot from "gifshot";
import {
  composeImage,
  FileType,
  generateDownload,
  stringToChunks,
} from "../utils";
import ReedSolomon from "./reed-solomon";
import {
  BLOCKS_COUNT,
  CHUNK_SIZE,
  COMPRESS_PAYLOAD,
  DEBUG_IMAGES,
  EXTRA_BLOCKS_COUNT,
  IMAGE_SIZE,
} from "../config/coding";
import { flushSync } from "react-dom";

const qrHints = new Map();
const qrEncoder = new BrowserQRCodeSvgWriter();

const createQR = (
  index: number,
  total: number,
  totalPlain: number,
  chunk: Uint8Array
) => {
  const header = Buffer.from(
    new Uint16Array([total, totalPlain, index]).buffer
  );
  const text = Buffer.concat([header, chunk]);
  if (index === 129) console.log(text, chunk);

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
  return image;
};

const compressPayload = (payload: string): Uint8Array => {
  return COMPRESS_PAYLOAD ? compress(payload) : Buffer.from(payload);
};

const rs = new ReedSolomon(EXTRA_BLOCKS_COUNT);

const solmonReedChunks = (chunks: Uint8Array[]): Uint8Array[] => {
  const out: number[][] = [];
  if (chunks.length < BLOCKS_COUNT) {
    console.log(chunks);
    return chunks;
  }
  console.log(`pre-chunks ${chunks.length}`);
  const iterations = Math.ceil(chunks.length / BLOCKS_COUNT);
  for (let i = 0; i < iterations; i++) {
    const blocksIndexCeil = Math.min((i + 1) * BLOCKS_COUNT, chunks.length);
    for (let pos = 0; pos < CHUNK_SIZE; pos++) {
      let s = [];
      //get one char from each chunk to compose s[BLOCKS_COUNT]
      for (
        let blockIdx = i * BLOCKS_COUNT;
        blockIdx < blocksIndexCeil;
        blockIdx++
      ) {
        s.push(chunks[blockIdx][pos] || 0);
      }
      //encode it
      const eccStr = rs.encode(s);
      //put it into stretched out
      for (let j = 0; j < eccStr.length; j++) {
        const idx = (BLOCKS_COUNT + EXTRA_BLOCKS_COUNT) * i + j;
        if (!out[idx]) out[idx] = [];
        out[idx][pos] = eccStr[j];
      }
    }
  }
  return out.map((row) => Buffer.from(row));
};

function Encoder() {
  const [hovered, setHovered] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [log, setLog] = useState<string[]>([]);
  const [frameDuration, setFrameDuration] = useState<number>(2);

  const addLog = (s: string): void => {
    setLog((log) => [...log, s]);
  };

  const encode = async () => {
    if (!textareaRef.current) return;
    const container = document.getElementById("imageBuffer");
    const payload = (textareaRef.current as HTMLTextAreaElement).value;
    if (!payload) return;
    addLog(`Payload length: ${payload.length}`);
    const compressedPayload = compressPayload(payload);
    addLog(`Compressed length: ${compressedPayload.length}`);
    // await new Promise<void>((r) => setTimeout(() => r(), 0));
    // const decompressed = decompress(stringToUint8Array(compressedPayload));
    const parts = stringToChunks(compressedPayload, CHUNK_SIZE);
    const chunks = solmonReedChunks(parts);
    console.log("CHUNKS>", chunks.length);
    console.log(chunks.map((c) => c.length));
    addLog(`Chunks count ${chunks.length}`);
    const images = [];
    for (let i = 0; i < chunks.length; i++) {
      images.push(createQR(i, chunks.length, parts.length, chunks[i]));
    }

    addLog(`Creating GIF...`);
    // DEBUG_IMAGES &&
    //   images.forEach((image) => {
    //     const i = new Image();
    //     i.src = image;
    //     container?.appendChild(i);
    //   });
    console.log(images);
    gifshot.createGIF(
      {
        images: images,
        gifWidth: IMAGE_SIZE,
        gifHeight: IMAGE_SIZE,
        numWorkers: 3,
        progressCallback: function (captureProgress: any) {
          console.log(captureProgress);
        },
        frameDuration,
      },
      function (obj: { error: any; image: any }) {
        if (!obj.error) {
          if (!container) return;
          // container.innerHTML = "";
          const image = composeImage(obj.image);
          const generated = Date.now();
          image.onclick = () => {
            generateDownload(`${generated}.gif`, obj.image, FileType.GIF);
          };
          image.style.cursor = "pointer";
          container.appendChild(image);
        }
      }
    );
  };

  const loadFile = (files: File[]) => {
    setHovered(false);
    const [file] = files;
    var reader = new FileReader();
    reader.onload = function (e) {
      if (!e.target) return;
      const contents = e.target.result;
      const textarea = textareaRef.current;
      if (textarea) textarea.value = String(contents);
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="section">
        <div className="columns">
          <div className="column">
            <Dropzone
              onDrop={loadFile}
              onDragEnter={() => setHovered(true)}
              onDragLeave={() => setHovered(false)}
            >
              {({ getRootProps, getInputProps }) => (
                <div {...getRootProps()}>
                  <input {...getInputProps()} />
                  <textarea
                    ref={textareaRef}
                    className={hovered ? "is-primary textarea" : "textarea"}
                    placeholder="Put your payload here or just drop your file here"
                  ></textarea>
                </div>
              )}
            </Dropzone>
            <div className="columns">
              <div className="column">
                <input
                  className="button is-primary"
                  value="Encode"
                  onChange={() => {}}
                  onClick={() => encode()}
                />
              </div>
            </div>
            <div className="columns is-centered">
              <div id="imageBuffer" className="column is-half"></div>
            </div>
          </div>
          <div className="column">
            {log.map((item, index) => (
              <div key={`log-${index}`}>{item}</div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default Encoder;
