// Client-side image checks + compression before anything is sent to Supabase Storage.
// The bucket enforces MIME and size limits again server-side, and the storage policy
// only accepts the random file names generated here.

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MIN_DIMENSION = 120;
const MAX_INPUT_DIMENSION = 12000;

export interface PreparedImage { blob: Blob; previewUrl: string; width: number; height: number; extension: 'webp' | 'jpg' | 'png' }

export class ImageValidationError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file: File, opts: { maxDimension?: number; keepTransparency?: boolean; maxBytes?: number } = {}): Promise<PreparedImage> {
  const { maxDimension = 1600, keepTransparency = false, maxBytes = 5 * 1024 * 1024 } = opts;
  if (!ALLOWED_TYPES.includes(file.type) || !ALLOWED_EXT.test(file.name)) {
    throw new ImageValidationError('That file type is not supported. Please choose a JPG, PNG or WebP image.');
  }
  if (file.size > MAX_INPUT_BYTES) throw new ImageValidationError('That image is too large. Please choose one under 12 MB.');

  let bitmap: ImageBitmap;
  try {
    // Decoding proves the file really is an image, whatever its name claims.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageValidationError('That file could not be read as an image. Please try a different one.');
  }
  if (bitmap.width < MIN_DIMENSION || bitmap.height < MIN_DIMENSION) {
    bitmap.close();
    throw new ImageValidationError(`That image is too small. Please use one at least ${MIN_DIMENSION}px on each side.`);
  }
  if (bitmap.width > MAX_INPUT_DIMENSION || bitmap.height > MAX_INPUT_DIMENSION) {
    bitmap.close();
    throw new ImageValidationError('That image is too large in dimensions. Please resize it and try again.');
  }

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); throw new ImageValidationError('Your browser could not process this image.'); }
  if (!keepTransparency) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Re-encoding strips EXIF (including GPS) and any non-image payload. WebP where the browser can encode it.
  let blob = await toBlob(canvas, 'image/webp', 0.82);
  let extension: PreparedImage['extension'] = 'webp';
  if (!blob || blob.type !== 'image/webp') {
    if (keepTransparency) { blob = await toBlob(canvas, 'image/png'); extension = 'png'; }
    else { blob = await toBlob(canvas, 'image/jpeg', 0.85); extension = 'jpg'; }
  }
  if (!blob) throw new ImageValidationError('Your browser could not process this image.');
  if (blob.size > maxBytes) throw new ImageValidationError('That image is still too large after compression. Please choose a smaller one.');
  return { blob, previewUrl: URL.createObjectURL(blob), width, height, extension };
}

/** Random, unguessable, traversal-proof object name. The original file name is never used. */
export function storageObjectName(folder: string, extension: string): string {
  const safeFolder = folder.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'img';
  return `${safeFolder}/${crypto.randomUUID()}.${extension}`;
}
