declare module "mini-lz4" {
  export function compress(data: string): Uint8Array;
  export function decompress(data: Uint8Array): Uint8Array;
}
