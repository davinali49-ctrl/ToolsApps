import {
  ArrowRight,
  Download,
  FileStack,
  Film,
  Server,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { TOOLS } from '../core/registry';
import { ToolBadge } from '../components/ui';

export function Home({ onNavigate }: { onNavigate: (page: string) => void }) {
  const tools = TOOLS;

  return (
    <div className="space-y-12">
      <section className="animate-fade-up pt-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
          Offline-first · Desktop & Android
        </p>
        <h1 className="mt-4 max-w-3xl text-[2rem] font-semibold leading-[1.1] tracking-tight text-white sm:text-[2.75rem]">
          Konversi berkas dan media
          <span className="block text-slate-400">tanpa langkah berlebih.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-slate-400">
          PDF, Word, Excel, PowerPoint, JPG, dan PNG dalam satu tempat. Unduh video atau audio
          dari YouTube, Instagram, dan TikTok dengan pilihan resolusi. Alat PDF dan gambar tetap
          berjalan tanpa internet.
        </p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          <button type="button" onClick={() => onNavigate('pdf-merge')} className="btn-primary">
            <FileStack className="h-4 w-4" />
            Mulai konversi berkas
          </button>
          <button type="button" onClick={() => onNavigate('media')} className="btn-ghost">
            <Download className="h-4 w-4" />
            Unduh media
          </button>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
            PDF & gambar diproses di perangkat
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-slate-500" />
            Server opsional untuk Office & media
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5 text-slate-500" />
            Windows & Android
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onNavigate('pdf-merge')}
          className="group panel panel-hover flex flex-col p-5 text-left"
        >
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-brand-300">
            <FileStack className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-white">Berkas & PDF</h2>
          <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-slate-400">
            Gabung, pisah, kompres, konversi PDF ke gambar, gambar ke PDF, dan Office ke PDF.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {['Gabung PDF', 'Kompres', 'PDF → JPG', 'Office → PDF'].map((item) => (
              <span key={item} className="chip">{item}</span>
            ))}
          </div>
          <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-brand-300">
            Buka alat
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('media')}
          className="group panel panel-hover flex flex-col p-5 text-left"
        >
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-brand-300">
            <Film className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-white">Media sosial</h2>
          <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-slate-400">
            Tempel tautan, pilih resolusi video atau bitrate audio, lalu unduh langsung.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="chip">YouTube</span>
            <span className="chip">Instagram</span>
            <span className="chip">TikTok</span>
            <span className="chip">MP3</span>
          </div>
          <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-brand-300">
            Buka downloader
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Semua alat berkas</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            {tools.length} alat. Tanpa unggah ke server kecuali konversi Office.
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onNavigate(tool.id)}
                className="group panel panel-hover flex items-start gap-3.5 p-4 text-left"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400 transition-colors group-hover:text-brand-300">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-slate-100">
                      {tool.name}
                    </span>
                    <ToolBadge badge={tool.badge} />
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-slate-500">
                    {tool.short}
                  </span>
                </span>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-700 transition-colors group-hover:text-brand-300" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: 'Privat secara desain',
              body: 'PDF dan gambar diproses di perangkat. Tidak ada berkas yang diunggah kecuali kamu memilih fitur server.'
            },
            {
              icon: Server,
              title: 'Server fleksibel',
              body: 'Pasang server sendiri untuk LibreOffice dan yt-dlp. URL server bisa diubah kapan saja dari Pengaturan.'
            },
            {
              icon: Smartphone,
              title: 'Satu basis kode',
              body: 'UI yang sama berjalan di web, desktop Electron, dan Android lewat Capacitor. Hasil konsisten.'
            }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title}>
                <Icon className="h-4 w-4 text-slate-500" />
                <h3 className="mt-3 text-[13px] font-medium text-slate-200">{item.title}</h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">{item.body}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
