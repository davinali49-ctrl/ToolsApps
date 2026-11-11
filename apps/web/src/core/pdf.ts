import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import type { ProgressFn, ResultFile } from './types';
import { baseName } from '../lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDF_MIME = 'application/pdf';

export interface PdfDocHandle {
  doc: pdfjs.PDFDocumentProxy;
  pageCount: number;
  file: File;
}

async function openPdf(file: File): Promise<PdfDocHandle> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
    return { doc, pageCount: doc.numPages, file };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/password/i.test(message)) {
      throw new Error('PDF terkunci dengan kata sandi. Hapus proteksi terlebih dahulu.');
    }
    throw new Error('PDF tidak bisa dibaca atau rusak.');
  }
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

async function loadPdfLib(file: File): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  } catch {
    throw new Error('PDF tidak bisa dibuka. Pastikan berkas tidak rusak atau terkunci.');
  }
}

function pdfBlob(bytes: Uint8Array): Blob {
  // pdf-lib mengembalikan Uint8Array generik; cast diperlukan untuk tipe BlobPart DOM.
  return new Blob([bytes as unknown as BlobPart], { type: PDF_MIME });
}

/* ------------------------------------------------------------------ */
/* Gabung & pisah                                                      */
/* ------------------------------------------------------------------ */

export async function mergePdfs(
  files: File[],
  onProgress: ProgressFn
): Promise<ResultFile[]> {
  if (files.length < 2) throw new Error('Pilih minimal dua berkas PDF.');
  const output = await PDFDocument.create();

  for (let index = 0; index < files.length; index++) {
    const file = files[index]!;
    onProgress(Math.round((index / files.length) * 90), `Menambahkan ${file.name}`);
    const source = await loadPdfLib(file);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }

  onProgress(95, 'Menyusun PDF...');
  const bytes = await output.save();
  return [{ name: 'gabungan.pdf', blob: pdfBlob(bytes) }];
}

export function parsePageRanges(input: string, pageCount: number): number[][] {
  const text = input.trim();
  // Rentang kosong berarti pecah setiap halaman menjadi berkas sendiri.
  if (!text) return Array.from({ length: pageCount }, (_, index) => [index + 1]);

  const groups: number[][] = [];
  for (const token of text.split(',')) {
    const part = token.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      let start = Number(range[1]);
      let end = Number(range[2]);
      if (start > end) [start, end] = [end, start];
      const group: number[] = [];
      for (let page = start; page <= end; page++) {
        if (page >= 1 && page <= pageCount) group.push(page);
      }
      if (group.length) groups.push(group);
      continue;
    }
    if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page >= 1 && page <= pageCount) groups.push([page]);
      continue;
    }
    throw new Error(`Rentang "${part}" tidak valid. Contoh: 1-3, 5, 8-10`);
  }

  if (!groups.length) {
    throw new Error(`Tidak ada halaman valid. PDF ini memiliki ${pageCount} halaman.`);
  }
  return groups;
}

export async function splitPdf(
  file: File,
  rangesInput: string,
  onProgress: ProgressFn
): Promise<ResultFile[]> {
  const handle = await openPdf(file);
  try {
    const groups = parsePageRanges(rangesInput, handle.pageCount);
    const source = await loadPdfLib(file);
    const base = baseName(file.name);
    const results: ResultFile[] = [];

    for (let index = 0; index < groups.length; index++) {
      const group = groups[index]!;
      const output = await PDFDocument.create();
      const zeroBased = group.map((page) => page - 1);
      const pages = await output.copyPages(source, zeroBased);
      pages.forEach((page) => output.addPage(page));
      const bytes = await output.save();

      const label =
        group.length === 1
          ? `hal-${group[0]}`
          : `hal-${group[0]}-${group[group.length - 1]}`;
      results.push({
        name: `${base}_${label}.pdf`,
        blob: pdfBlob(bytes)
      });
      onProgress(Math.round(((index + 1) / groups.length) * 95), `Membuat ${label}`);
    }

    if (results.length === 1) return results;

    onProgress(97, 'Mengemas hasil...');
    const zip = new JSZip();
    results.forEach((result) => zip.file(result.name, result.blob));
    const blob = await zip.generateAsync({ type: 'blob' });
    return [
      {
        name: `${base}_terpisah.zip`,
        blob,
        note: `${results.length} berkas PDF`
      }
    ];
  } finally {
    await handle.doc.destroy();
  }
}

/* ------------------------------------------------------------------ */
/* Kompres                                                             */
/* ------------------------------------------------------------------ */

export async function compressPdf(
  file: File,
  level: string,
  onProgress: ProgressFn
): Promise<ResultFile[]> {
  const base = baseName(file.name);

  if (level === 'light') {
    onProgress(35, 'Mengoptimalkan struktur PDF...');
    const doc = await loadPdfLib(file);
    doc.setProducer('ToolsApps');
    doc.setCreator('ToolsApps');
    const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
    onProgress(95, 'Selesai');
    return [
      {
        name: `${base}_kompres.pdf`,
        blob: pdfBlob(bytes),
        note: 'Mode aman: teks & tautan tetap utuh.'
      }
    ];
  }

  const presets: Record<string, { scale: number; quality: number }> = {
    medium: { scale: 1.25, quality: 0.72 },
    strong: { scale: 0.95, quality: 0.55 }
  };
  const preset = presets[level] ?? presets.medium!;

  const handle = await openPdf(file);
  try {
    const output = await PDFDocument.create();

    for (let pageNumber = 1; pageNumber <= handle.pageCount; pageNumber++) {
      const page = await handle.doc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: preset.scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Browser tidak mendukung canvas.');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;

      const jpeg = await canvasToBlob(canvas, 'image/jpeg', preset.quality);
      const image = await output.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      const outputPage = output.addPage([baseViewport.width, baseViewport.height]);
      outputPage.drawImage(image, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height
      });

      onProgress(
        Math.round((pageNumber / handle.pageCount) * 92),
        `Mengompres halaman ${pageNumber}/${handle.pageCount}`
      );
    }

    onProgress(96, 'Menyimpan PDF...');
    const bytes = await output.save();
    return [
      {
        name: `${base}_kompres.pdf`,
        blob: pdfBlob(bytes),
        note: 'Mode kuat: halaman dirasterisasi, teks tidak lagi bisa dipilih.'
      }
    ];
  } finally {
    await handle.doc.destroy();
  }
}

/* ------------------------------------------------------------------ */
/* PDF ke gambar                                                       */
/* ------------------------------------------------------------------ */

export async function pdfToImages(
  file: File,
  format: 'png' | 'jpg',
  scale: number,
  onProgress: ProgressFn
): Promise<ResultFile[]> {
  const handle = await openPdf(file);
  try {
    const base = baseName(file.name);
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const extension = format === 'png' ? 'png' : 'jpg';
    const images: Array<{ name: string; blob: Blob }> = [];

    for (let pageNumber = 1; pageNumber <= handle.pageCount; pageNumber++) {
      const page = await handle.doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Browser tidak mendukung canvas.');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await canvasToBlob(canvas, mime, format === 'jpg' ? 0.92 : undefined);
      images.push({
        name: `${base}_hal-${String(pageNumber).padStart(2, '0')}.${extension}`,
        blob
      });
      onProgress(
        Math.round((pageNumber / handle.pageCount) * 92),
        `Merender halaman ${pageNumber}/${handle.pageCount}`
      );
    }

    if (images.length === 1) return [images[0]!];

    onProgress(96, 'Mengemas gambar...');
    const zip = new JSZip();
    images.forEach((image) => zip.file(image.name, image.blob));
    return [
      {
        name: `${base}_gambar.zip`,
        blob: await zip.generateAsync({ type: 'blob' }),
        note: `${images.length} gambar`
      }
    ];
  } finally {
    await handle.doc.destroy();
  }
}

/* ------------------------------------------------------------------ */
/* Ekstraksi teks                                                      */
/* ------------------------------------------------------------------ */

interface LineBucket {
  y: number;
  items: Array<{ x: number; text: string }>;
}

export async function extractPdfText(
  file: File,
  onProgress: ProgressFn
): Promise<string[]> {
  const handle = await openPdf(file);
  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= handle.pageCount; pageNumber++) {
      const page = await handle.doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const buckets = new Map<number, LineBucket>();

      for (const item of content.items) {
        if (!('str' in item)) continue;
        const text = item.str.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const transform = item.transform as number[];
        const y = transform[5] ?? 0;
        const x = transform[4] ?? 0;
        const key = Math.round(y / 4);
        const bucket = buckets.get(key) ?? { y, items: [] };
        bucket.items.push({ x, text });
        buckets.set(key, bucket);
      }

      const lines = [...buckets.values()]
        .sort((a, b) => b.y - a.y)
        .map((bucket) =>
          bucket.items
            .sort((a, b) => a.x - b.x)
            .map((part) => part.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
        )
        .filter(Boolean);

      pages.push(lines.join('\n'));
      onProgress(
        Math.round((pageNumber / handle.pageCount) * 92),
        `Membaca halaman ${pageNumber}/${handle.pageCount}`
      );
    }

    return pages;
  } finally {
    await handle.doc.destroy();
  }
}

export async function pdfToText(
  file: File,
  onProgress: ProgressFn
): Promise<ResultFile[]> {
  const pages = await extractPdfText(file, onProgress);
  const text = pages
    .map((page, index) => `===== Halaman ${index + 1} =====\n${page}`)
    .join('\n\n');
  return [
    {
      name: `${baseName(file.name)}.txt`,
      blob: new Blob([text || '(Tidak ada teks yang bisa diekstrak.)'], {
        type: 'text/plain;charset=utf-8'
      })
    }
  ];
}

export async function pdfToWord(
  file: File,
  onProgress: ProgressFn
): Promise<ResultFile[]> {
  const pages = await extractPdfText(file, onProgress);
  const { Document, Packer, Paragraph, TextRun, PageBreak } = await import('docx');

  const paragraphs: InstanceType<typeof Paragraph>[] = [];
  pages.forEach((pageText, pageIndex) => {
    const lines = pageText.split('\n').filter((line) => line.trim().length > 0);
    if (pageIndex > 0) {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
    }
    if (!lines.length) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: '(Halaman ini tidak memiliki teks.)', italics: true, color: '888888' })]
        })
      );
      return;
    }
    lines.forEach((line) => {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 22 })],
          spacing: { after: 100, line: 300 }
        })
      );
    });
  });

  const doc = new Document({
    creator: 'ToolsApps',
    description: `Konversi teks dari ${file.name}`,
    sections: [
      {
        properties: {
          page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } }
        },
        children: paragraphs
      }
    ]
  });

  onProgress(96, 'Menyusun dokumen Word...');
  const blob = await Packer.toBlob(doc);
  return [
    {
      name: `${baseName(file.name)}.docx`,
      blob,
      note: 'Berbasis teks: layout, gambar, dan tabel tidak disalin.'
    }
  ];
}
