declare module "lz4js" {
  export function compress(data: string): Uint8Array;
  export function decompress(data: Uint8Array): Uint8Array;
}
