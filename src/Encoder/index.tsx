import React, { useRef, useState } from "react";
import { compress } from "mini-lz4";
import Dropzone from "react-dropzone";
import { BrowserQRCodeSvgWriter } from "@zxing/browser";
import gifshot from "gifshot";
import { FileType, generateDownload, stringToChunks } from "../libs/utils";
import ReedSolomon from "../libs/reed-solomon";
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
    setImmediate(() => r(image));
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
    console.log(chunks);
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

function Encoder() {
  const [blocksCount, setBlocksCount] = useState<number>(BLOCKS_COUNT);
  const [exactFrames, setExactFrames] = useState<number[]>([]);
  const [extraBlocksCount, setExtraBlocksCount] =
    useState<number>(EXTRA_BLOCKS_COUNT);
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
    const payload = (textareaRef.current as HTMLTextAreaElement).value;
    if (!payload) return;
    setGifProgress(0);
    setLog([]);
    setResultImage(undefined);
    await addLog(`Payload length: ${payload.length}`);
    const compressedPayload = compressPayload(payload);
    await addLog(`Compressed length: ${compressedPayload.length}`);
    setGifProgress(2);
    // const decompressed = decompress(stringToUint8Array(compressedPayload));
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

    await addLog(`Creating GIF...`);

    const imagesToProcess = exactFrames.length
      ? images.filter((_, index) => exactFrames.includes(index))
      : images;

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
      <div className="container">
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
                    className={
                      hovered ? "has-background-primary textarea" : "textarea"
                    }
                    placeholder={
                      hovered
                        ? "Drop it! Drop it NOW!"
                        : "Put your payload here or just drop your file here"
                    }
                  ></textarea>
                </div>
              )}
            </Dropzone>

            <div className="mt-4">
              <div className="field">
                <label className="label">Blocks count</label>
                <div className="control">
                  <input
                    type="range"
                    min={10}
                    max={100}
                    defaultValue={blocksCount}
                    className="slider"
                    onChange={(e) =>
                      e.target && setBlocksCount(Number(e.target.value))
                    }
                  />
                  <span>({blocksCount})</span>
                </div>
              </div>

              <div className="field">
                <label className="label">Error correction blocks count</label>
                <div className="control">
                  <input
                    type="range"
                    min={2}
                    max={12}
                    defaultValue={extraBlocksCount / 2}
                    className="slider"
                    onChange={(e) =>
                      e.target &&
                      setExtraBlocksCount(Number(e.target.value) * 2)
                    }
                  />
                  <span>({extraBlocksCount})</span>
                </div>
              </div>

              <div className="field">
                <label className="label">Frame delay</label>
                <div className="control">
                  <input
                    type="range"
                    min={1}
                    max={20}
                    defaultValue={frameDuration}
                    className="slider"
                    onChange={(e) =>
                      e.target && setFrameDuration(Number(e.target.value))
                    }
                  />
                  <span>({frameDuration / 10} sec)</span>
                </div>
              </div>

              <div className="field">
                <label className="label">
                  Include only the following frames
                </label>
                <div className="control">
                  <input
                    type="text"
                    defaultValue=""
                    className="input"
                    onChange={(e) =>
                      e.target &&
                      setExactFrames(
                        e.target.value
                          .split(/\D+/gi)
                          .filter(Boolean)
                          .map((v) => Number(v))
                      )
                    }
                    placeholder="Just put numbers here (if empty all frames are included)"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4">
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
              {log.map((item, index) => (
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
