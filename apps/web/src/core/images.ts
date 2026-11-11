import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import type { ProgressFn, ResultFile } from './types';
import { baseName } from '../lib/utils';

const A4 = { width: 595.28, height: 841.89 };

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Gambar "${file.name}" tidak bisa dibaca.`));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal membuat gambar.'))),
      type,
      quality
    );
  });
}

function drawToCanvas(
  image: HTMLImageElement,
  options: { maxWidth?: number; background?: string }
): HTMLCanvasElement {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const limit = options.maxWidth && options.maxWidth > 0 ? options.maxWidth : naturalWidth;
  const ratio = Math.min(1, limit / naturalWidth);
  const width = Math.max(1, Math.round(naturalWidth * ratio));
  const height = Math.max(1, Math.round(naturalHeight * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser tidak mendukung canvas.');
  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let index = 2;
  while (used.has(`${base}-${index}${ext}`)) index++;
  const result = `${base}-${index}${ext}`;
  used.add(result);
  return result;
}

/* ------------------------------------------------------------------ */
/* Konversi format gambar                                              */
/* ------------------------------------------------------------------ */

export async function convertImages(
  files: File[],
  target: string,
  qualityValue: string,
  maxWidthValue: string,
  onProgress: ProgressFn
): Promise<ResultFile[]> {
  const format = target === 'jpg' ? 'jpeg' : target === 'webp' ? 'webp' : 'png';
  const extension = format === 'jpeg' ? 'jpg' : format;
  const mime = `image/${format}`;
  const quality = format === 'png' ? undefined : Number(qualityValue) || 0.9;
  const maxWidth = Number(maxWidthValue) || 0;
  const used = new Set<string>();
  const results: ResultFile[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index]!;
    const image = await loadImageElement(file);
    const canvas = drawToCanvas(image, {
      maxWidth,
      background: format === 'jpeg' ? '#ffffff' : undefined
    });
    const blob = await canvasToBlob(canvas, mime, quality);
    results.push({
      name: uniqueName(`${baseName(file.name)}.${extension}`, used),
      blob
    });
    onProgress(
      Math.round(((index + 1) / files.length) * 94),
      `Mengonversi ${file.name}`
    );
  }

  if (results.length <= 1) return results;

  onProgress(96, 'Mengemas hasil...');
  const zip = new JSZip();
  results.forEach((result) => zip.file(result.name, result.blob));
  return [
    {
      name: `gambar_${extension}.zip`,
      blob: await zip.generateAsync({ type: 'blob' }),
      note: `${results.length} gambar`
    }
  ];
}

/* ------------------------------------------------------------------ */
/* Gambar ke PDF                                                       */
/* ------------------------------------------------------------------ */

export async function imagesToPdf(
  files: File[],
  layout: string,
  marginValue: string,
  onProgress: ProgressFn
): Promise<ResultFile[]> {
  if (!files.length) throw new Error('Pilih minimal satu gambar.');
  const document = await PDFDocument.create();
  const margin = Number(marginValue) || 0;

  for (let index = 0; index < files.length; index++) {
    const file = files[index]!;
    const image = await loadImageElement(file);
    const canvas = drawToCanvas(image, { background: '#ffffff' });
    const png = await canvasToBlob(canvas, 'image/png');
    const embedded = await document.embedPng(new Uint8Array(await png.arrayBuffer()));

    if (layout === 'fit') {
      const page = document.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: embedded.width,
        height: embedded.height
      });
    } else {
      const page = document.addPage([A4.width, A4.height]);
      const availableWidth = A4.width - margin * 2;
      const availableHeight = A4.height - margin * 2;
      const scale = Math.min(
        availableWidth / embedded.width,
        availableHeight / embedded.height,
        1
      );
      const width = embedded.width * scale;
      const height = embedded.height * scale;
      page.drawImage(embedded, {
        x: (A4.width - width) / 2,
        y: (A4.height - height) / 2,
        width,
        height
      });
    }

    onProgress(
      Math.round(((index + 1) / files.length) * 94),
      `Menambahkan ${file.name}`
    );
  }

  onProgress(96, 'Menyimpan PDF...');
  const bytes = await document.save();
  const name = files.length === 1 ? `${baseName(files[0]!.name)}.pdf` : 'gambar_gabungan.pdf';
  return [
    {
      name,
      blob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
      note: `${files.length} halaman`
    }
  ];
}
