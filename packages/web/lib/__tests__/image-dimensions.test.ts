import { describe, it, expect } from "vitest";
import { getImageDimensions } from "../image-dimensions";

// ---------------------------------------------------------------------------
// Helpers to build minimal valid image buffers
// ---------------------------------------------------------------------------

function makePngBuffer(width: number, height: number): Buffer {
  // 8-byte PNG signature + 4-byte chunk length + "IHDR" + 4-byte width + 4-byte height = 24 bytes
  const buf = Buffer.alloc(24);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  // IHDR chunk length (13 bytes) at offset 8
  buf.writeUInt32BE(13, 8);
  // "IHDR" at offset 12
  buf.write("IHDR", 12, 4, "ascii");
  // Width (big-endian) at offset 16
  buf.writeUInt32BE(width, 16);
  // Height (big-endian) at offset 20
  buf.writeUInt32BE(height, 20);
  return buf;
}

function makeGifBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(10);
  buf.write("GIF89a", 0, 6, "ascii");
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

function makeJpegBuffer(width: number, height: number): Buffer {
  // SOI (FF D8) + SOF0 marker (FF C0) + segment length (2 bytes) + precision (1 byte)
  // + height (2 bytes BE) + width (2 bytes BE) = 11 bytes total
  const buf = Buffer.alloc(11);
  // SOI marker
  buf[0] = 0xff;
  buf[1] = 0xd8;
  // SOF0 marker
  buf[2] = 0xff;
  buf[3] = 0xc0;
  // Segment length (includes itself: 2 + 1 + 2 + 2 + ... = at least 8)
  buf.writeUInt16BE(8, 4);
  // Precision byte
  buf[6] = 8;
  // Height (big-endian uint16) at offset 7
  buf.writeUInt16BE(height, 7);
  // Width (big-endian uint16) at offset 9
  buf.writeUInt16BE(width, 9);
  return buf;
}

function makeWebpVP8Buffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, 4, "ascii");
  buf.writeUInt32LE(22, 4); // file size minus 8
  buf.write("WEBP", 8, 4, "ascii");
  buf.write("VP8 ", 12, 4, "ascii");
  // VP8 chunk size at offset 16
  buf.writeUInt32LE(10, 16);
  // VP8 frame header bytes (3 bytes at 20) — minimal valid frame tag
  buf[20] = 0x9d;
  buf[21] = 0x01;
  buf[22] = 0x2a;
  // Padding bytes 23-25
  buf[23] = 0x00;
  buf[24] = 0x00;
  buf[25] = 0x00;
  // Width at offset 26 (LE, masked with 0x3FFF)
  buf.writeUInt16LE(width & 0x3fff, 26);
  // Height at offset 28 (LE, masked with 0x3FFF)
  buf.writeUInt16LE(height & 0x3fff, 28);
  return buf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getImageDimensions", () => {
  describe("PNG", () => {
    it("extracts dimensions from a valid PNG buffer", () => {
      const result = getImageDimensions(makePngBuffer(800, 600), "image/png");
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it("handles 1x1 PNG", () => {
      const result = getImageDimensions(makePngBuffer(1, 1), "image/png");
      expect(result).toEqual({ width: 1, height: 1 });
    });

    it("handles large dimensions", () => {
      const result = getImageDimensions(
        makePngBuffer(4096, 2160),
        "image/png",
      );
      expect(result).toEqual({ width: 4096, height: 2160 });
    });

    it("returns null for truncated PNG (less than 24 bytes)", () => {
      const buf = makePngBuffer(100, 100).subarray(0, 20);
      expect(getImageDimensions(buf, "image/png")).toBeNull();
    });

    it("returns null for invalid PNG signature", () => {
      const buf = makePngBuffer(100, 100);
      buf[0] = 0x00; // corrupt signature
      expect(getImageDimensions(buf, "image/png")).toBeNull();
    });
  });

  describe("GIF", () => {
    it("extracts dimensions from a valid GIF89a buffer", () => {
      const result = getImageDimensions(makeGifBuffer(320, 240), "image/gif");
      expect(result).toEqual({ width: 320, height: 240 });
    });

    it("handles GIF87a signature", () => {
      const buf = makeGifBuffer(640, 480);
      buf.write("GIF87a", 0, 6, "ascii");
      const result = getImageDimensions(buf, "image/gif");
      expect(result).toEqual({ width: 640, height: 480 });
    });

    it("returns null for truncated GIF (less than 10 bytes)", () => {
      const buf = makeGifBuffer(100, 100).subarray(0, 8);
      expect(getImageDimensions(buf, "image/gif")).toBeNull();
    });

    it("returns null for invalid GIF signature", () => {
      const buf = makeGifBuffer(100, 100);
      buf.write("PNG", 0, 3, "ascii");
      expect(getImageDimensions(buf, "image/gif")).toBeNull();
    });
  });

  describe("JPEG", () => {
    it("extracts dimensions from a valid JPEG buffer with SOF0", () => {
      const result = getImageDimensions(
        makeJpegBuffer(1920, 1080),
        "image/jpeg",
      );
      expect(result).toEqual({ width: 1920, height: 1080 });
    });

    it("extracts dimensions from JPEG with SOF2 (progressive)", () => {
      const buf = makeJpegBuffer(640, 480);
      buf[3] = 0xc2; // SOF2 instead of SOF0
      const result = getImageDimensions(buf, "image/jpeg");
      expect(result).toEqual({ width: 640, height: 480 });
    });

    it("handles JPEG with non-SOF marker before SOF0", () => {
      // SOI + APP0 (FF E0) with small segment + SOF0
      const buf = Buffer.alloc(21);
      // SOI
      buf[0] = 0xff;
      buf[1] = 0xd8;
      // APP0 marker
      buf[2] = 0xff;
      buf[3] = 0xe0;
      // APP0 segment length = 4 (just the length bytes + 2 padding)
      buf.writeUInt16BE(4, 4);
      // SOF0 marker at offset 8 (2 + 2 + 4)
      buf[8] = 0xff;
      buf[9] = 0xc0;
      // Segment length
      buf.writeUInt16BE(8, 10);
      // Precision
      buf[12] = 8;
      // Height at offset 13
      buf.writeUInt16BE(768, 13);
      // Width at offset 15
      buf.writeUInt16BE(1024, 15);
      const result = getImageDimensions(buf, "image/jpeg");
      expect(result).toEqual({ width: 1024, height: 768 });
    });

    it("returns null for truncated JPEG (less than 4 bytes)", () => {
      const buf = Buffer.from([0xff, 0xd8]);
      expect(getImageDimensions(buf, "image/jpeg")).toBeNull();
    });

    it("returns null for invalid JPEG SOI marker", () => {
      const buf = makeJpegBuffer(100, 100);
      buf[0] = 0x00; // corrupt SOI
      expect(getImageDimensions(buf, "image/jpeg")).toBeNull();
    });

    it("returns null when SOF marker segment is truncated", () => {
      // SOI + SOF0 marker but not enough bytes for dimensions
      const buf = Buffer.alloc(6);
      buf[0] = 0xff;
      buf[1] = 0xd8;
      buf[2] = 0xff;
      buf[3] = 0xc0;
      buf[4] = 0x00;
      buf[5] = 0x08;
      expect(getImageDimensions(buf, "image/jpeg")).toBeNull();
    });
  });

  describe("WebP VP8 (lossy)", () => {
    it("extracts dimensions from a valid WebP VP8 buffer", () => {
      const result = getImageDimensions(
        makeWebpVP8Buffer(512, 256),
        "image/webp",
      );
      expect(result).toEqual({ width: 512, height: 256 });
    });

    it("masks dimensions to 14 bits", () => {
      // Values written are already masked in the helper, but verify large values
      const result = getImageDimensions(
        makeWebpVP8Buffer(8192, 4096),
        "image/webp",
      );
      expect(result).toEqual({ width: 8192, height: 4096 });
    });

    it("returns null for truncated WebP (less than 30 bytes)", () => {
      const buf = makeWebpVP8Buffer(100, 100).subarray(0, 25);
      expect(getImageDimensions(buf, "image/webp")).toBeNull();
    });

    it("returns null for invalid RIFF signature", () => {
      const buf = makeWebpVP8Buffer(100, 100);
      buf.write("XXXX", 0, 4, "ascii");
      expect(getImageDimensions(buf, "image/webp")).toBeNull();
    });

    it("returns null for invalid WEBP tag", () => {
      const buf = makeWebpVP8Buffer(100, 100);
      buf.write("XXXX", 8, 4, "ascii");
      expect(getImageDimensions(buf, "image/webp")).toBeNull();
    });

    it("returns null for unknown WebP chunk type", () => {
      const buf = makeWebpVP8Buffer(100, 100);
      buf.write("ZZZZ", 12, 4, "ascii"); // unknown chunk
      expect(getImageDimensions(buf, "image/webp")).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("returns null for unknown mime type", () => {
      const buf = makePngBuffer(100, 100);
      expect(getImageDimensions(buf, "image/bmp")).toBeNull();
    });

    it("returns null for empty string mime type", () => {
      const buf = makePngBuffer(100, 100);
      expect(getImageDimensions(buf, "")).toBeNull();
    });

    it("returns null for empty buffer", () => {
      expect(getImageDimensions(Buffer.alloc(0), "image/png")).toBeNull();
      expect(getImageDimensions(Buffer.alloc(0), "image/jpeg")).toBeNull();
      expect(getImageDimensions(Buffer.alloc(0), "image/gif")).toBeNull();
      expect(getImageDimensions(Buffer.alloc(0), "image/webp")).toBeNull();
    });

    it("returns null for single-byte buffer", () => {
      expect(getImageDimensions(Buffer.alloc(1), "image/png")).toBeNull();
      expect(getImageDimensions(Buffer.alloc(1), "image/jpeg")).toBeNull();
      expect(getImageDimensions(Buffer.alloc(1), "image/gif")).toBeNull();
      expect(getImageDimensions(Buffer.alloc(1), "image/webp")).toBeNull();
    });
  });
});
