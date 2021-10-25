export enum FileType {
  GIF = "image/gif",
  TEXT = "text/plain",
}

export const generateDownload = (
  filename: string,
  content: string,
  type: FileType
): void => {
  var a = document.createElement("a");
  if (type === FileType.GIF) {
    a.href = content;
  } else {
    var file = new Blob([content], { type });
    a.href = URL.createObjectURL(file);
  }
  a.download = filename;
  a.click();
};

export const stringToChunks = (
  s: Uint8Array,
  chunkSize: number
): Uint8Array[] => {
  if (chunkSize <= 0) throw new Error(`chunk size must be positive`);
  const chunksCount = Math.ceil(s.length / chunkSize);
  const out = [];
  for (let i = 0; i < chunksCount; i++) {
    out.push(s.slice(i * chunkSize, i * chunkSize + chunkSize));
  }
  return out;
};

export const uint8ArrayToString = (arr: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    out += String.fromCharCode(arr[i]);
  }
  return out;
};

export const stringToUint8Array = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    out[i] = s.charCodeAt(i);
  }
  return out;
};

export const composeImage = (s: string): HTMLImageElement => {
  const image = new Image();
  image.width = 500;
  image.height = 500;
  image.src = s;

  return image;
};
