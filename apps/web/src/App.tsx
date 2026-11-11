import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { MediaPage } from './pages/MediaPage';
import { SettingsPage } from './pages/SettingsPage';
import { ToolPage } from './pages/ToolPage';
import { TOOLS } from './core/registry';
import { useAppStore } from './lib/store';

const VALID_PAGES = new Set(['home', 'media', 'settings', ...TOOLS.map((tool) => tool.id)]);

function readPage(): string {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  return VALID_PAGES.has(hash) ? hash : 'home';
}

export default function App() {
  const [page, setPage] = useState(readPage);
  const checkServer = useAppStore((state) => state.checkServer);

  useEffect(() => {
    void checkServer();
    const onHashChange = () => {
      setPage(readPage());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [checkServer]);

  function navigate(target: string) {
    if (!VALID_PAGES.has(target)) target = 'home';
    if (target === page) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.location.hash = target === 'home' ? '#/' : `#/${target}`;
    setPage(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <Layout page={page} onNavigate={navigate}>
      {page === 'home' ? <Home onNavigate={navigate} /> : null}
      {page === 'media' ? <MediaPage onNavigate={navigate} /> : null}
      {page === 'settings' ? <SettingsPage /> : null}
      {page !== 'home' && page !== 'media' && page !== 'settings' ? (
        <ToolPage key={page} toolId={page} onNavigate={navigate} />
      ) : null}
    </Layout>
  );
}
