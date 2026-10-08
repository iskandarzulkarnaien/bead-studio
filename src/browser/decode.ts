import {decode, hasPngSignature} from 'fast-png';
import type {Pixels} from '../image-core';
import {MAX_FILE_BYTES, validateImageSize} from './limits';
export async function decodeImage(file: Blob): Promise<Pixels> {
  if (!file.size || file.size > MAX_FILE_BYTES) throw Error('Choose an image file smaller than 64 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (hasPngSignature(bytes)) {
    if (bytes.length < 24) throw Error('PNG header is incomplete.');
    const view = new DataView(bytes.buffer);
    validateImageSize(view.getUint32(16), view.getUint32(20));
    const png = decode(bytes, {checkCrc: true});
    const rgb = new Uint8Array(png.width * png.height * 3);
    const maximum = 2 ** png.depth - 1;
    for (let i = 0; i < png.width * png.height; i++) {
      if (png.palette) {
        const color = png.palette[png.data[i]];
        if (!color) throw Error('PNG palette contains an invalid index.');
        rgb.set(color.slice(0, 3), i * 3);
      } else {
        const base = i * png.channels;
        for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(png.data[base + (png.channels <= 2 ? 0 : c)] * 255 / maximum);
      }
    }
    // Reference behavior ignores alpha; do not composite transparent pixels onto black.
    return {width: png.width, height: png.height, data: rgb};
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, {imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none'}); }
  catch { throw Error('This image could not be decoded. Try a PNG, JPEG, or WebP image.'); }
  try {
    validateImageSize(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) throw Error('Image decoding is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0);
    const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const rgb = new Uint8Array(bitmap.width * bitmap.height * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2];
    }
    canvas.width = canvas.height = 1;
    return {width: bitmap.width, height: bitmap.height, data: rgb};
  } finally { bitmap.close(); }
}
