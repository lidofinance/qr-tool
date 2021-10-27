import React, { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { CHUNK_SIZE, COMPRESS_PAYLOAD } from "../config/coding";
import ReedSolomon from "../Encoder/reed-solomon";
import { decompress } from "mini-lz4";
import { FileType, generateDownload, uint8ArrayToString } from "../utils";
import "./style.css";

function Decoder() {
  const ref = useRef<IScannerControls>();
  const [framesOpts, setFramesOpts] = useState<
    | {
        blocksCount: number;
        extraBlocksCount: number;
        totalFrames: number;
        totalPlainFrames: number;
      }
    | undefined
  >();
  const [currentBuffer, setCurrentBuffer] = useState<Buffer | undefined>();
  const [frames, setFrames] = useState<Record<number, Buffer>>({});
  const [parsedFrames, setParsedFrames] = useState<Record<number, Buffer>>({});
  const [result, setResult] = useState<string | undefined>();
  const [currentFrameIdx, setCurrentFrameIdx] = useState<number | undefined>();

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
    setFrames((frames) => ({
      ...frames,
      [frameId]: frame,
    }));

    if (totalPlainFrames < blocksCount) {
      setParsedFrames((parsedFrames) => ({
        ...parsedFrames,
        [frameId]: frame,
      }));
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

    setParsedFrames((parsedFrames) => {
      const newParsedFrames = { ...parsedFrames };
      for (let i = 0; i < out.length; i++) {
        newParsedFrames[blockIdx * blocksCount + i] = Buffer.from(out[i]);
      }
      return newParsedFrames;
    });
  };

  useEffect(() => {
    if (!currentBuffer) return;

    const currentFrameIdx = currentBuffer.readUInt16LE(4);
    setCurrentFrameIdx(currentFrameIdx);
    if (!frames[currentFrameIdx]) {
      const opts = framesOpts || {
        totalPlainFrames: currentBuffer.readUInt16LE(2),
        totalFrames: currentBuffer.readUInt16LE(0),
        blocksCount: currentBuffer.readUInt8(6),
        extraBlocksCount: currentBuffer.readUInt8(7),
      };
      if (!framesOpts) {
        setFramesOpts(opts);
      }

      tryProcessBlock(currentFrameIdx, currentBuffer.slice(8), opts);
    }
  }, [currentBuffer]);

  useEffect(() => {
    const frameKeys = Object.keys(parsedFrames).sort(
      (a: string, b: string) => Number(a) - Number(b)
    );
    if (!framesOpts || frameKeys.length !== framesOpts.totalPlainFrames) return;
    const buffer = Buffer.concat(
      frameKeys.map((key: string) => parsedFrames[Number(key)])
    );
    setResult(
      COMPRESS_PAYLOAD
        ? uint8ArrayToString(decompress(buffer))
        : buffer.toString()
    );
    ref.current!.stop();
  }, [parsedFrames, framesOpts]);

  const getMissingFrames = () => {
    if (!framesOpts) return;
    const { blocksCount, extraBlocksCount, totalFrames } = framesOpts;
    if (!blocksCount || !extraBlocksCount) return;
    const frameIdxs = new Array(totalFrames)
      .fill("")
      .map((_, index) => !!frames[index])
      .map((frame, index) => {
        if (frame) return true;
        const blockIdx = Math.floor(index / (blocksCount + extraBlocksCount));
        if (parsedFrames[blockIdx * blocksCount]) return true;
        return false;
      })
      .map((item, index) => (item ? -1 : index))
      .filter((v) => v > 0);

    return frameIdxs.join(",");
  };

  useEffect(() => {
    let ac: IScannerControls;
    (async () => {
      const scanner = new BrowserQRCodeReader(
        new Map().set("TRY_HARDER", true),
        {
          delayBetweenScanSuccess: 10,
          delayBetweenScanAttempts: 0,
        }
      );
      try {
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
      } catch (e) {
        console.log(`Can't init video`);
      }
    })();

    return () => {
      ac && ac.stop();
    };
  }, []);

  const missingFrames = getMissingFrames();

  return (
    <>
      <div className="container">
        <div>
          {!!missingFrames && (
            <>
              <input
                type="text"
                readOnly={true}
                value={missingFrames}
                className="input"
                placeholder="All frames are parsed"
              />
            </>
          )}
        </div>
        <div className="columns">
          <div className="column">
            <div className="progressBar">
              {new Array(framesOpts?.totalFrames || 0)
                .fill("")
                .map((_, index) => ({
                  index,
                  done: frames[index] ? false : index,
                  active: index === currentFrameIdx,
                }))
                .map((item) => (
                  <div
                    key={`frame-item-${item.index}`}
                    title={item.index.toString()}
                    className={`frameItem ${item.active && "active"} ${
                      item.done && "done"
                    }`}
                  ></div>
                ))}
            </div>
            <video
              id="preview"
              style={{
                width: 800,
                height: 600,
                transform: "scaleX(-1)",
                display: result ? "none" : "block",
              }}
            ></video>
            {result && (
              <>
                <textarea
                  className="textarea"
                  value={result}
                  readOnly={true}
                ></textarea>
                <div className="mt-2">
                  <input
                    type="button"
                    className="button is-primary mr-1"
                    onClick={() =>
                      generateDownload(
                        `${Date.now()}.txt`,
                        result,
                        FileType.TEXT
                      )
                    }
                    value="Download"
                  />
                  <input
                    type="reset"
                    className="button is-danger"
                    onClick={() => {
                      setCurrentBuffer(undefined);
                      setFrames({});
                      setFramesOpts(undefined);
                      setParsedFrames({});
                      setResult(undefined);
                    }}
                    value="Reset"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
export default Decoder;
