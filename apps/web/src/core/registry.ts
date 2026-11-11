import {
  AlignLeft,
  Combine,
  FileImage,
  FileText,
  FileType2,
  Images,
  Minimize2,
  RefreshCw,
  Scissors
} from 'lucide-react';
import type { ResultFile, ToolDef, ToolOption } from './types';
import { mergePdfs, splitPdf, compressPdf, pdfToImages, pdfToText, pdfToWord } from './pdf';
import { convertImages, imagesToPdf } from './images';
import { officeToPdf } from './office';

const single = (files: File[], message = 'Pilih satu berkas terlebih dahulu.'): File => {
  const file = files[0];
  if (!file) throw new Error(message);
  return file;
};

const qualityOption: ToolOption = {
  key: 'quality',
  label: 'Kualitas',
  type: 'select',
  defaultValue: '0.9',
  options: [
    { value: '0.6', label: 'Kecil (60%)' },
    { value: '0.78', label: 'Seimbang (78%)' },
    { value: '0.9', label: 'Bagus (90%)' },
    { value: '0.98', label: 'Maksimal (98%)' }
  ]
};

export const TOOLS: ToolDef[] = [
  {
    id: 'pdf-merge',
    name: 'Gabung PDF',
    short: 'Gabungkan beberapa PDF menjadi satu berkas.',
    description:
      'Urutan berkas mengikuti urutan pilihan. Geser urutan dengan tombol naik/turun di daftar berkas.',
    icon: Combine,
    group: 'pdf',
    accept: 'application/pdf,.pdf',
    acceptLabel: 'PDF',
    multiple: true,
    badge: 'offline',
    options: [],
    run: (files, _values, ctx) => mergePdfs(files, ctx.onProgress)
  },
  {
    id: 'pdf-split',
    name: 'Pisah PDF',
    short: 'Ambil atau pecah halaman tertentu.',
    description:
      'Masukkan rentang halaman. Setiap rentang menjadi berkas PDF terpisah, lalu dikemas dalam ZIP bila lebih dari satu.',
    icon: Scissors,
    group: 'pdf',
    accept: 'application/pdf,.pdf',
    acceptLabel: 'PDF',
    multiple: false,
    badge: 'offline',
    options: [
      {
        key: 'ranges',
        label: 'Rentang halaman',
        type: 'text',
        defaultValue: '1-2, 3',
        placeholder: 'contoh: 1-3, 5, 8-10',
        hint: 'Kosongkan untuk memecah setiap halaman menjadi berkas sendiri.'
      }
    ],
    run: (files, values, ctx) =>
      splitPdf(single(files), String(values.ranges ?? ''), ctx.onProgress)
  },
  {
    id: 'pdf-compress',
    name: 'Kompres PDF',
    short: 'Perkecil ukuran PDF dengan presisi.',
    description:
      'Mode aman mempertahankan teks dan tautan. Mode kuat merasterisasi halaman sehingga ukuran jauh lebih kecil, tetapi teks tidak lagi bisa dipilih.',
    icon: Minimize2,
    group: 'pdf',
    accept: 'application/pdf,.pdf',
    acceptLabel: 'PDF',
    multiple: false,
    badge: 'offline',
    options: [
      {
        key: 'level',
        label: 'Tingkat kompresi',
        type: 'select',
        defaultValue: 'medium',
        options: [
          { value: 'light', label: 'Ringan — aman, teks utuh' },
          { value: 'medium', label: 'Sedang — seimbang' },
          { value: 'strong', label: 'Kuat — ukuran terkecil' }
        ]
      }
    ],
    run: (files, values, ctx) =>
      compressPdf(single(files), String(values.level ?? 'medium'), ctx.onProgress)
  },
  {
    id: 'pdf-to-image',
    name: 'PDF ke Gambar',
    short: 'Ubah setiap halaman menjadi JPG atau PNG.',
    description:
      'Skala 2× cocok untuk layar, 3× untuk cetak. Hasil lebih dari satu halaman otomatis dikemas dalam ZIP.',
    icon: Images,
    group: 'pdf',
    accept: 'application/pdf,.pdf',
    acceptLabel: 'PDF',
    multiple: false,
    badge: 'offline',
    options: [
      {
        key: 'format',
        label: 'Format gambar',
        type: 'select',
        defaultValue: 'png',
        options: [
          { value: 'png', label: 'PNG — tajam, ukuran besar' },
          { value: 'jpg', label: 'JPG — kecil, cocok untuk foto' }
        ]
      },
      {
        key: 'scale',
        label: 'Resolusi',
        type: 'select',
        defaultValue: '2',
        options: [
          { value: '1', label: '1× — cepat' },
          { value: '2', label: '2× — direkomendasikan' },
          { value: '3', label: '3× — cetak' }
        ]
      }
    ],
    run: (files, values, ctx) =>
      pdfToImages(
        single(files),
        values.format === 'jpg' ? 'jpg' : 'png',
        Number(values.scale) || 2,
        ctx.onProgress
      )
  },
  {
    id: 'image-to-pdf',
    name: 'Gambar ke PDF',
    short: 'Satukan JPG/PNG menjadi dokumen PDF.',
    description:
      'Satu gambar per halaman. Pilih A4 agar rapi untuk dicetak, atau Ukuran gambar agar PDF mengikuti dimensi asli.',
    icon: FileImage,
    group: 'pdf',
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    acceptLabel: 'JPG, PNG, WebP',
    multiple: true,
    badge: 'offline',
    options: [
      {
        key: 'layout',
        label: 'Ukuran halaman',
        type: 'select',
        defaultValue: 'a4',
        options: [
          { value: 'a4', label: 'A4 — posisi tengah' },
          { value: 'fit', label: 'Ikuti ukuran gambar' }
        ]
      },
      {
        key: 'margin',
        label: 'Margin (A4)',
        type: 'select',
        defaultValue: '24',
        options: [
          { value: '0', label: 'Tanpa margin' },
          { value: '24', label: 'Normal' },
          { value: '48', label: 'Lebar' }
        ]
      }
    ],
    run: (files, values, ctx) =>
      imagesToPdf(files, String(values.layout ?? 'a4'), String(values.margin ?? '24'), ctx.onProgress)
  },
  {
    id: 'image-convert',
    name: 'Konversi Gambar',
    short: 'JPG, PNG, dan WebP saling tukar.',
    description:
      'Atur batas lebar untuk mengecilkan foto secara massal. Transparansi dipertahankan pada PNG/WebP; JPG memakai latar putih.',
    icon: RefreshCw,
    group: 'pdf',
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    acceptLabel: 'JPG, PNG, WebP',
    multiple: true,
    badge: 'offline',
    options: [
      {
        key: 'format',
        label: 'Format tujuan',
        type: 'select',
        defaultValue: 'jpg',
        options: [
          { value: 'jpg', label: 'JPG' },
          { value: 'png', label: 'PNG' },
          { value: 'webp', label: 'WebP' }
        ]
      },
      qualityOption,
      {
        key: 'maxWidth',
        label: 'Lebar maksimum (px)',
        type: 'text',
        defaultValue: '',
        placeholder: 'opsional, contoh: 1920'
      }
    ],
    run: (files, values, ctx) =>
      convertImages(
        files,
        String(values.format ?? 'jpg'),
        String(values.quality ?? '0.9'),
        String(values.maxWidth ?? ''),
        ctx.onProgress
      )
  },
  {
    id: 'office-to-pdf',
    name: 'Office ke PDF',
    short: 'Word, Excel, PowerPoint, dan CSV menjadi PDF.',
    description:
      'Hasil terbaik memakai LibreOffice di server/aplikasi desktop. Tanpa koneksi, DOCX/XLSX/CSV/ODS memakai mode perkiraan; DOC/RTF/ODT dan PowerPoint tetap butuh LibreOffice.',
    icon: FileText,
    group: 'pdf',
    accept:
      '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.odt,.ods,.odp,.csv',
    acceptLabel: 'DOCX, XLSX, PPTX, CSV, ODS',
    multiple: true,
    badge: 'hybrid',
    options: [],
    run: async (files, _values, ctx) => {
      if (!files.length) throw new Error('Pilih berkas Office terlebih dahulu.');
      const results: ResultFile[] = [];
      for (let index = 0; index < files.length; index++) {
        const file = files[index]!;
        const scoped = {
          ...ctx,
          onProgress: (percent: number, label?: string) =>
            ctx.onProgress(
              Math.round(((index + percent / 100) / files.length) * 100),
              label ? `${file.name}: ${label}` : file.name
            )
        };
        const converted = await officeToPdf(file, scoped);
        results.push(...converted);
      }
      return results;
    }
  },
  {
    id: 'pdf-to-word',
    name: 'PDF ke Word',
    short: 'Ambil teks PDF menjadi dokumen DOCX.',
    description:
      'Ekstraksi berbasis teks, bukan pemindaian. Layout, gambar, dan tabel tidak disalin. Untuk PDF hasil scan, gunakan OCR terlebih dahulu.',
    icon: FileType2,
    group: 'pdf',
    accept: 'application/pdf,.pdf',
    acceptLabel: 'PDF',
    multiple: false,
    badge: 'beta',
    options: [],
    run: (files, _values, ctx) => pdfToWord(single(files), ctx.onProgress)
  },
  {
    id: 'pdf-to-text',
    name: 'PDF ke Teks',
    short: 'Ekstrak seluruh teks ke berkas .txt.',
    description:
      'Ringan dan cepat. Cocok untuk menyalin isi dokumen, pencarian, atau bahan analisis lebih lanjut.',
    icon: AlignLeft,
    group: 'pdf',
    accept: 'application/pdf,.pdf',
    acceptLabel: 'PDF',
    multiple: false,
    badge: 'offline',
    options: [],
    run: (files, _values, ctx) => pdfToText(single(files), ctx.onProgress)
  }
];

export const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.id, tool]));

export function getTool(id: string): ToolDef | undefined {
  return TOOL_MAP.get(id);
}

export function defaultValues(tool: ToolDef): Record<string, string> {
  return Object.fromEntries(tool.options.map((option) => [option.key, option.defaultValue]));
}
