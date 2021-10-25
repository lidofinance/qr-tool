import React, { useRef, useState } from "react";
import { compress } from "mini-lz4";
import Dropzone from "react-dropzone";
import { BrowserQRCodeSvgWriter } from "@zxing/browser";
import gifshot from "gifshot";
import { FileType, generateDownload, stringToChunks } from "../utils";
import ReedSolomon from "./reed-solomon";
import {
  BLOCKS_COUNT,
  CHUNK_SIZE,
  COMPRESS_PAYLOAD,
  EXTRA_BLOCKS_COUNT,
  IMAGE_SIZE,
} from "../config/coding";
import asyncPool from "tiny-async-pool";
import "./style.css";

const qrHints = new Map();
const qrEncoder = new BrowserQRCodeSvgWriter();

const createQR = (
  index: number,
  total: number,
  totalPlain: number,
  chunk: Uint8Array
): Promise<string> =>
  new Promise((r) => {
    const header = Buffer.from(
      new Uint16Array([total, totalPlain, index]).buffer
    );
    const text = Buffer.concat([header, chunk]);
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
    setImmediate(() => r(image));
  });

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
  const [gifProgress, setGifProgress] = useState<number | undefined>();
  const [resultImage, setResultImage] = useState<
    | {
        name: string;
        src: string;
      }
    | undefined
  >();

  const addLog = async (s: string): Promise<void> => {
    setLog((log) => [...log, s]);
    await new Promise<void>((r) => setTimeout(() => r(), 0));
  };

  const encode = async () => {
    if (!textareaRef.current) return;
    setGifProgress(0);
    setLog([]);
    setResultImage(undefined);
    const payload = (textareaRef.current as HTMLTextAreaElement).value;
    if (!payload) return;
    await addLog(`Payload length: ${payload.length}`);
    const compressedPayload = compressPayload(payload);
    await addLog(`Compressed length: ${compressedPayload.length}`);
    setGifProgress(2);
    // const decompressed = decompress(stringToUint8Array(compressedPayload));
    const parts = stringToChunks(compressedPayload, CHUNK_SIZE);
    setGifProgress(5);
    const chunks = solmonReedChunks(parts);
    await addLog(`Chunks count ${chunks.length}`);
    await addLog(`Creating qrs...`);
    setGifProgress(10);

    const images = await asyncPool(
      10,
      chunks.map((chunk, index) => ({ data: chunk, index })),
      (chunk) => {
        return createQR(chunk.index, chunks.length, parts.length, chunk.data);
      }
    );
    setGifProgress(20);

    await addLog(`Creating GIF...`);
    gifshot.createGIF(
      {
        images: images,
        gifWidth: IMAGE_SIZE,
        gifHeight: IMAGE_SIZE,
        numWorkers: 3,
        progressCallback: function (captureProgress: any) {
          setGifProgress((captureProgress * 80 + 20) | 0);
        },
        frameDuration,
      },
      function (obj: { error: any; image: any }) {
        if (!obj.error) {
          setGifProgress(undefined);
          setResultImage({ src: obj.image, name: `${Date.now()}.gif` });
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
            <div>
              <input
                className="button is-primary"
                value="Encode"
                onChange={() => {}}
                onClick={() => encode()}
              />
            </div>
            <div className="column">
              {gifProgress && (
                <progress className="progress" value={gifProgress} max="100">
                  {gifProgress}%
                </progress>
              )}
              {gifProgress &&
                log.map((item, index) => (
                  <div key={`log-${index}`}>{item}</div>
                ))}
            </div>
          </div>

          <div className="column result">
            {resultImage && (
              <img
                src={resultImage.src}
                width={500}
                height={500}
                alt="qr"
                className="resultImage"
                onClick={() => {
                  generateDownload(
                    resultImage.name,
                    resultImage.src,
                    FileType.GIF
                  );
                }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Encoder;
