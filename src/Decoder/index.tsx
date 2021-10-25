import React, { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import {
  BLOCKS_COUNT,
  CHUNK_SIZE,
  COMPRESS_PAYLOAD,
  EXTRA_BLOCKS_COUNT,
} from "../config/coding";
import ReedSolomon from "../Encoder/reed-solomon";
import { decompress } from "mini-lz4";
import { uint8ArrayToString } from "../utils";

const rs = new ReedSolomon(EXTRA_BLOCKS_COUNT);

function Decoder() {
  const ref = useRef<IScannerControls>();
  const [currentBuffer, setCurrentBuffer] = useState<Buffer | undefined>();
  const [frames, setFrames] = useState<Record<number, Buffer>>({});
  const [parsedFrames, setParsedFrames] = useState<Record<number, Buffer>>({});
  const [totalFrames, setTotalFrames] = useState<number>(0);
  const [totalPlainFrames, setTotalPlainFrames] = useState<number>(0);
  const [framesProcessed, setFramesProcessed] = useState<boolean>(false);
  const [result, setResult] = useState<string | undefined>();

  const tryProcessBlock = (
    frameId: number,
    frame: Buffer,
    totalPlainFrames: number,
    totalFrames: number
  ): void => {
    const newFrames = {
      ...frames,
      [frameId]: frame,
    };
    setFrames((frames) => ({
      ...frames,
      [frameId]: frame,
    }));

    if (totalPlainFrames < BLOCKS_COUNT) {
      setParsedFrames((parsedFrames) => ({
        ...parsedFrames,
        [frameId]: frame,
      }));
      return;
    }
    const blockIdx = Math.floor(frameId / (BLOCKS_COUNT + EXTRA_BLOCKS_COUNT));
    const partStart = blockIdx * (BLOCKS_COUNT + EXTRA_BLOCKS_COUNT);
    const partEnd = Math.min(
      partStart + BLOCKS_COUNT + EXTRA_BLOCKS_COUNT,
      totalFrames
    );
    if (parsedFrames[blockIdx * BLOCKS_COUNT]) return;

    const partChunks = new Array(partEnd - partStart);
    const lostFrames = [];
    for (let i = 0; i < partEnd - partStart; i++) {
      if (newFrames[partStart + i]) {
        partChunks[i] = newFrames[partStart + i];
      } else {
        lostFrames.push(i);
      }
    }
    if (lostFrames.length > 3) return;
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

    setParsedFrames((parsedFrames) => {
      const newParsedFrames = { ...parsedFrames };
      for (let i = 0; i < out.length; i++) {
        newParsedFrames[blockIdx * BLOCKS_COUNT + i] = Buffer.from(out[i]);
      }
      return newParsedFrames;
    });
  };

  useEffect(() => {
    if (!currentBuffer) return;
    if (!totalFrames) {
      const totalFrames = currentBuffer.readUInt16LE(0);
      const totalPlainFrames = currentBuffer.readUInt16LE(2);
      setTotalFrames(totalFrames);
      setTotalPlainFrames(totalPlainFrames);
    }
    const currentFrameIdx = currentBuffer.readUInt16LE(4);
    if (!frames[currentFrameIdx])
      tryProcessBlock(
        currentFrameIdx,
        currentBuffer.slice(6),
        currentBuffer.readUInt16LE(2),
        currentBuffer.readUInt16LE(0)
      );
  }, [currentBuffer]);

  useEffect(() => {
    const frameKeys = Object.keys(parsedFrames).sort(
      (a: string, b: string) => Number(a) - Number(b)
    );
    if (!totalPlainFrames || frameKeys.length !== totalPlainFrames) return;
    const buffer = Buffer.concat(
      frameKeys.map((key: string) => parsedFrames[Number(key)])
    );
    setResult(
      COMPRESS_PAYLOAD
        ? uint8ArrayToString(decompress(buffer))
        : buffer.toString()
    );
  }, [parsedFrames, totalPlainFrames]);

  useEffect(() => {
    let ac: IScannerControls;
    (async () => {
      const scanner = new BrowserQRCodeReader(undefined, {
        delayBetweenScanSuccess: 0,
        delayBetweenScanAttempts: 0,
      });

      ac = await scanner.decodeFromVideoDevice(
        undefined,
        "preview",
        (res, err) => {
          if (err) return;
          const buffer = Buffer.from(res?.getText() || "", "base64");
          setCurrentBuffer(buffer);
        }
      );
      ref.current = ac;
    })();

    return () => {
      ac && ac.stop();
    };
  }, []);

  return (
    <>
      <div className="columns">
        <div className="column">
          <div>{JSON.stringify(Object.keys(frames).map(Number).sort())}</div>
          <div>
            {new Array(totalFrames)
              .fill("")
              .map((_, index) => (frames[index] ? false : index))
              .filter(Boolean)
              .join(",")}
          </div>
          {framesProcessed && <div>Done</div>}
          <video
            id="preview"
            style={{ width: 800, height: 600, transform: "scaleX(-1)" }}
          ></video>
          {result && (
            <textarea
              className="textarea"
              value={result}
              readOnly={true}
            ></textarea>
          )}
        </div>
      </div>
    </>
  );
}
export default Decoder;
