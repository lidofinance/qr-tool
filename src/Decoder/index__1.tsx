import React, { useEffect, useRef, useState } from "react";
import Instascan from "instascan";

function Decoder() {
  const ref = useRef<number>();
  const [frames, setFrames] = useState<Record<number, Buffer>>({});
  const [total, setTotal] = useState<number>(0);
  const [framesProcessed, setFramesProcessed] = useState<boolean>(false);

  useEffect(() => {
    if (total && Object.keys(frames).length === total) {
      setFramesProcessed(true);
    }
  }, [frames]);

  useEffect(() => {
    const scanner = new Instascan.Scanner({
      video: document.getElementById("preview"),
    });

    ref.current = scanner;

    scanner.addListener("scan", function (content: any, image: any) {
      console.log(content.split("").map((v: string) => v.charCodeAt(0)));
      const buffer = Buffer.from(content);
      console.log(buffer);
      const totalFrames = buffer.readUInt16LE(0);
      const currentFrameIdx = buffer.readUInt16LE(2);
      setTotal(totalFrames);
      setFrames((frames) => ({ ...frames, [currentFrameIdx]: buffer }));
    });

    Instascan.Camera.getCameras().then(function (cameras: string | any[]) {
      if (cameras.length > 0) {
        scanner.start(cameras[0]);
      }
    });

    return () => {
      scanner.stop();
    };
  }, []);

  return (
    <>
      <div className="columns">
        <div className="column">
          <div>{JSON.stringify(Object.keys(frames).sort())}</div>
          <div>
            {new Array(total)
              .fill("")
              .map((_, index) => (frames[index] ? false : index))
              .filter(Boolean)
              .join(",")}
          </div>
          {framesProcessed && <div>Done</div>}
          <video id="preview" style={{ width: 800, height: 600 }}></video>
        </div>
      </div>
    </>
  );
}
export default Decoder;
