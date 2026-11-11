import type { ResultFile, RunContext } from './types';
import {
  fetchJobFile,
  startOfficeConversion,
  waitForJob
} from '../lib/api';
import { convertOfficeLocal, getDesktopCapabilities } from '../lib/bridge';
import { baseName, extensionOf } from '../lib/utils';

const WORD_EXTENSIONS = new Set(['doc', 'docx', 'rtf', 'odt']);
// Hanya DOCX yang bisa dibaca mammoth. DOC/RTF/ODT memerlukan LibreOffice.
const MAMMOTH_EXTENSIONS = new Set(['docx']);
const SHEET_EXTENSIONS = new Set(['xls', 'xlsx', 'csv', 'ods']);
const SLIDE_EXTENSIONS = new Set(['ppt', 'pptx', 'odp']);

export async function officeToPdf(
  file: File,
  ctx: RunContext
): Promise<ResultFile[]> {
  const extension = extensionOf(file.name);

  // 1. Desktop: LibreOffice lokal = kualitas terbaik tanpa internet.
  if (ctx.runtime === 'desktop') {
    const capabilities = await getDesktopCapabilities();
    if (capabilities?.soffice.available) {
      ctx.onProgress(8, 'Menjalankan LibreOffice lokal...');
      const blob = await convertOfficeLocal(file, (percent) =>
        ctx.onProgress(8 + percent * 0.85, 'LibreOffice sedang bekerja...')
      );
      return [{ name: `${baseName(file.name)}.pdf`, blob, note: 'Diproses offline oleh LibreOffice.' }];
    }
  }

  // 2. Server: LibreOffice headless.
  if (ctx.serverOnline) {
    try {
      ctx.onProgress(8, 'Mengunggah berkas ke server...');
      const job = await startOfficeConversion(ctx.serverUrl, file);
      const finished = await waitForJob(ctx.serverUrl, job.id, {
        onUpdate: (update) =>
          ctx.onProgress(
            Math.min(95, 15 + update.progress * 0.78),
            update.message || 'Mengonversi di server...'
          ),
        signal: ctx.signal
      });
      const blob = await fetchJobFile(ctx.serverUrl, finished.id);
      return [
        {
          name: finished.fileName || `${baseName(file.name)}.pdf`,
          blob,
          note: 'Diproses oleh LibreOffice di server.'
        }
      ];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!WORD_EXTENSIONS.has(extension) && !SHEET_EXTENSIONS.has(extension)) {
        throw new Error(
          `Konversi gagal di server: ${message}\n\nPastikan LibreOffice terpasang di server, atau gunakan aplikasi desktop.`
        );
      }
      // Word/Excel punya fallback perkiraan di bawah.
    }
  }

  // 3. Fallback offline (DOCX dan spreadsheet, hasil perkiraan).
  if (WORD_EXTENSIONS.has(extension)) {
    if (!MAMMOTH_EXTENSIONS.has(extension)) {
      throw new Error(
        `Format .${extension} membutuhkan LibreOffice/server. Simpan ulang sebagai .docx atau aktifkan server.`
      );
    }
    return docxToPdf(file, ctx);
  }
  if (SHEET_EXTENSIONS.has(extension)) {
    return xlsxToPdf(file, ctx);
  }
  if (SLIDE_EXTENSIONS.has(extension)) {
    throw new Error(
      'PowerPoint butuh LibreOffice. Pasang LibreOffice di desktop/server, atau ekspor ke PDF dari PowerPoint.'
    );
  }
  throw new Error('Format Office ini belum didukung.');
}

/* ------------------------------------------------------------------ */
/* DOCX -> PDF (fallback perkiraan, tanpa server)                      */
/* ------------------------------------------------------------------ */

function sanitizeHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed
    .querySelectorAll('script, iframe, object, embed, link, meta, style, form')
    .forEach((element) => element.remove());
  parsed.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on')) element.removeAttribute(attribute.name);
      if (name === 'href' && /^\s*javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return parsed.body.innerHTML;
}

async function docxToPdf(file: File, ctx: RunContext): Promise<ResultFile[]> {
  ctx.onProgress(10, 'Membaca dokumen Word...');
  const mammoth = await import('mammoth');
  const { value: rawHtml } = await mammoth.convertToHtml({
    arrayBuffer: await file.arrayBuffer()
  });
  const html = sanitizeHtml(rawHtml);

  const container = document.createElement('div');
  container.style.cssText = [
    'position:fixed',
    'top:0',
    'left:-12000px',
    'width:794px',
    'min-height:1123px',
    'padding:56px 64px',
    'box-sizing:border-box',
    'background:#ffffff',
    'color:#111827',
    'font-family:Calibri,Carlito,Georgia,serif',
    'font-size:14px',
    'line-height:1.62',
    'word-wrap:break-word'
  ].join(';');
  container.innerHTML = `
    <style>
      img { max-width:100%; height:auto; }
      table { border-collapse:collapse; width:100%; margin:10px 0; }
      td, th { border:1px solid #cbd5e1; padding:5px 7px; vertical-align:top; }
      h1 { font-size:24px; margin:0 0 14px; line-height:1.25; }
      h2 { font-size:19px; margin:18px 0 10px; line-height:1.3; }
      h3 { font-size:16px; margin:16px 0 8px; }
      p { margin:0 0 10px; }
      ul, ol { margin:0 0 10px; padding-left:26px; }
      blockquote { margin:10px 0; padding-left:14px; border-left:3px solid #cbd5e1; color:#475569; }
      a { color:#1d4ed8; }
    </style>
    ${html || '<p><em>(Dokumen kosong)</em></p>'}`;

  document.body.appendChild(container);

  try {
    await document.fonts.ready.catch(() => undefined);
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) return resolve();
            image.onload = () => resolve();
            image.onerror = () => resolve();
          })
      )
    );

    ctx.onProgress(35, 'Merender dokumen...');
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true
    });

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageHeightPx = Math.floor((canvas.width / pageWidth) * pageHeight);

    let offset = 0;
    let first = true;
    while (offset < canvas.height) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - offset);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = pageHeightPx;
      const context = slice.getContext('2d');
      if (!context) throw new Error('Browser tidak mendukung canvas.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(
        canvas,
        0,
        offset,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );

      if (!first) pdf.addPage();
      // Halaman terakhir bisa lebih pendek; jangan diregangkan ke tinggi penuh.
      const renderHeight = pageHeight * (sliceHeight / pageHeightPx);
      pdf.addImage(
        slice.toDataURL('image/jpeg', 0.9),
        'JPEG',
        0,
        0,
        pageWidth,
        Math.min(pageHeight, renderHeight)
      );
      first = false;
      offset += sliceHeight;
      ctx.onProgress(
        Math.min(94, 35 + Math.round((offset / canvas.height) * 55)),
        'Menyusun halaman PDF...'
      );
    }

    return [
      {
        name: `${baseName(file.name)}.pdf`,
        blob: pdf.output('blob'),
        note: 'Mode offline: layout mendekati asli, tetapi bisa bergeser.'
      }
    ];
  } finally {
    container.remove();
  }
}

/* ------------------------------------------------------------------ */
/* XLSX -> PDF (fallback perkiraan, tanpa server)                      */
/* ------------------------------------------------------------------ */

async function xlsxToPdf(file: File, ctx: RunContext): Promise<ResultFile[]> {
  ctx.onProgress(15, 'Membaca spreadsheet...');
  const XLSX = await import('xlsx');
  const workbook =
    extensionOf(file.name) === 'csv'
      ? XLSX.read(await file.text(), { type: 'string' })
      : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const sheetNames = workbook.SheetNames.slice(0, 10);
  let truncated = false;

  sheetNames.forEach((sheetName, index) => {
    if (index > 0) pdf.addPage();
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    });
    const cleanRows = rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []));
    const header = cleanRows[0] ?? [];
    const body = cleanRows.slice(1, 501);
    if (cleanRows.length > 501) truncated = true;

    pdf.setFontSize(13);
    pdf.setTextColor(30, 41, 59);
    pdf.text(sheetName, 36, 34);

    if (!header.length && !body.length) {
      pdf.setFontSize(10);
      pdf.text('(Sheet kosong)', 36, 52);
      return;
    }

    autoTable(pdf, {
      head: header.length ? [header] : undefined,
      body,
      startY: 44,
      margin: { left: 30, right: 30, bottom: 30 },
      styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 247, 252] },
      theme: 'grid',
      didDrawPage: () => {
        const pageCount = pdf.getNumberOfPages();
        pdf.setFontSize(8);
        pdf.setTextColor(148, 163, 184);
        pdf.text(`ToolsApps • ${file.name} • hal. ${pageCount}`, 30, pdf.internal.pageSize.getHeight() - 14);
      }
    });

    ctx.onProgress(
      Math.min(94, 15 + Math.round(((index + 1) / sheetNames.length) * 75)),
      `Memproses sheet ${sheetName}`
    );
  });

  return [
    {
      name: `${baseName(file.name)}.pdf`,
      blob: pdf.output('blob'),
      note: truncated
        ? 'Maksimal 500 baris per sheet. Ekspor lengkap butuh LibreOffice.'
        : 'Mode offline: tabel diratakan, formatting asli tidak disalin.'
    }
  ];
}
