// "Find a setting": type a word, pick the result, land on the exact screen. Sits at the top of Settings and Studio.
import { useState } from 'react';
import { searchControls } from './controlIndex';
import { SearchBox } from '../ui';

export default function SettingFinder({ open }: { open: (app: string, route?: string) => void }){
  const [q, setQ] = useState('');
  const found = q.trim() ? searchControls(q).slice(0, 8) : [];
  return (
    <div className="setting-finder">
      <SearchBox value={q} onChange={setQ} placeholder="Find a setting…" label="Find a setting" />
      {q.trim() !== '' && <ul className="setting-finder-list" role="listbox" aria-label="Matching settings">
        {found.map(c => <li key={c.title}><button type="button" role="option" aria-selected="false" onClick={() => { setQ(''); open(c.app, c.route); }}>
          <b>{c.title}</b><span>{c.group}</span></button></li>)}
        {!found.length && <li className="setting-finder-none">Nothing matches “{q}”. Try “logo”, “price” or “email”.</li>}
      </ul>}
    </div>
  );
}
