import { Blob } from "buffer";
import type { BinaryLike } from "node:crypto";

type FileBits = Array<ArrayBuffer | BinaryLike | Blob>;
interface FileOptions {
  type?: string;
  lastModified?: number;
}

const globalWithFile = globalThis as { File?: unknown };

if (typeof globalWithFile.File === "undefined") {
  class NodeFile extends Blob {
    readonly name: string;
    readonly lastModified: number;

    constructor(fileBits: FileBits, fileName: string, options: FileOptions = {}) {
      const { type, lastModified } = options;
  super(fileBits, type ? { type } : undefined);
      this.name = fileName.replace(/[\\/]/g, ":");
      this.lastModified = lastModified ?? Date.now();
    }

    get [Symbol.toStringTag]() {
      return "File";
    }
  }

  globalWithFile.File = NodeFile;
}
