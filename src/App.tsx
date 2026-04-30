import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Users, 
  Send, 
  BarChart3, 
  Plus, 
  Search, 
  Upload, 
  Info, 
  HelpCircle,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface Contact {
  id: number;
  name: string;
  company: string;
  email: string;
  category: string;
}

interface Stats {
  emails_sent: number;
  categories: { category: string; count: number }[];
}

interface SmtpSettings {
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_pass?: string;
  sender_email?: string;
  sender_name?: string;
}

// --- Components ---

const InfoBox = ({ children, title }: { children: React.ReactNode; title?: string }) => (
  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 my-4 flex gap-3 text-blue-800 rounded-r-lg">
    <Info className="flex-shrink-0 w-6 h-6" />
    <div>
      {title && <h4 className="font-bold mb-1">{title}</h4>}
      <p className="text-sm">{children}</p>
    </div>
  </div>
);

const HelpBox = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-slate-50 border border-slate-200 p-4 my-2 flex gap-3 text-slate-600 rounded-lg text-sm italic">
    <HelpCircle className="flex-shrink-0 w-5 h-5 text-slate-400" />
    {children}
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<'settings' | 'contacts' | 'outreach' | 'stats'>('settings');
  const [settings, setSettings] = useState<SmtpSettings>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Contacts flow
  const [search, setSearch] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', company: '', email: '', category: 'Inköpare' });

  // Outreach flow
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('Hej {{namn}}!\n\nJag skriver till dig från SourcingEU...');
  const [mailingProgress, setMailingProgress] = useState<{ current: number, total: number } | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchContacts();
    fetchStats();
  }, []);

  const fetchSettings = async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    setSettings(data);
  };

  const fetchContacts = async (query = '') => {
    const res = await fetch(`/api/contacts${query ? `?search=${query}` : ''}`);
    const data = await res.json();
    setContacts(data);
  };

  const fetchStats = async () => {
    const res = await fetch('/api/stats');
    const data = await res.json();
    setStats(data);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) setMessage({ type: 'success', text: 'Inställningar sparade!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Kunde inte spara inställningar.' });
    }
    setLoading(false);
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Kontakt tillagd!' });
        fetchContacts();
        setShowManualForm(false);
        setNewContact({ name: '', company: '', email: '', category: 'Inköpare' });
      } else {
        setMessage({ type: 'error', text: 'Kunde inte lägga till kontakt. E-post kan redan finnas.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Nätverksfel.' });
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    try {
      const res = await fetch('/api/contacts/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Import klar! ${data.count} kontakter hittades.` });
        fetchContacts();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Kunde inte ladda upp filen.' });
    }
    setLoading(false);
  };

  const handleSendEmails = async () => {
    if (selectedContacts.length === 0) return;
    setLoading(true);
    setMailingProgress({ current: 0, total: selectedContacts.length });
    
    try {
      const res = await fetch('/api/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: selectedContacts, subject, body }),
      });
      
      if (res.ok) {
        // Enforce the logic look: we show the progress bar moving
        for (let i = 1; i <= selectedContacts.length; i++) {
          setMailingProgress({ current: i, total: selectedContacts.length });
          // The backend does the delay, but we sync our UI feel
          if (i < selectedContacts.length) {
            await new Promise(resolve => setTimeout(resolve, 31000)); // slightly more than backend 30s
          }
        }
        setMessage({ type: 'success', text: 'Alla mejl har skickats!' });
        fetchStats();
      } else {
        const errorData = await res.json();
        setMessage({ type: 'error', text: errorData.error || 'Något gick fel vid utskicket.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Kunde inte initiera outreach.' });
    }
    setLoading(false);
    setMailingProgress(null);
  };

  const toggleContactSelection = (id: number) => {
    setSelectedContacts(prev => 
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg font-bold text-xl">SEU</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SourcingEU CRM</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Professional Outreach</p>
            </div>
          </div>
          <nav className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'settings', icon: Settings, label: 'Inställningar' },
              { id: 'contacts', icon: Users, label: 'Kontakter' },
              { id: 'outreach', icon: Send, label: 'Outreach' },
              { id: 'stats', icon: BarChart3, label: 'Statistik' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {/* Messages */}
          {message && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
                message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span className="flex-1">{message.text}</span>
              <button onClick={() => setMessage(null)} className="text-lg">&times;</button>
            </motion.div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="text-2xl font-bold mb-2">Inställningar</h2>
                <p className="text-slate-500 mb-6 font-medium">Börja här för att koppla ditt konto till Brevo.</p>
                
                <InfoBox title="Viktigt: Brevo Setup">
                  För att kunna skicka mejl behöver du ett konto på Brevo (tidigare Sendinblue). 
                  Använd <b>smtp-relay.brevo.com</b> som värd (host) och port <b>587</b>. 
                  Du hittar dina SMTP-nycklar i din Brevo-dashboard under fliken 'SMTP & API'.
                </InfoBox>

                <form onSubmit={handleSaveSettings} className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">SMTP Host</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="smtp-relay.brevo.com"
                      value={settings.smtp_host || ''}
                      onChange={e => setSettings({...settings, smtp_host: e.target.value})}
                    />
                    <HelpBox>Standard är smtp-relay.brevo.com</HelpBox>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">SMTP Port</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="587"
                      value={settings.smtp_port || ''}
                      onChange={e => setSettings({...settings, smtp_port: e.target.value})}
                    />
                    <HelpBox>Port 587 rekommenderas för TLS.</HelpBox>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">SMTP Användarnamn (Login)</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="din@epost.se"
                      value={settings.smtp_user || ''}
                      onChange={e => setSettings({...settings, smtp_user: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">SMTP Lösenord (Master Password)</label>
                    <input 
                      type="password" 
                      className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={settings.smtp_pass || ''}
                      onChange={e => setSettings({...settings, smtp_pass: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Avsändarens E-post</label>
                    <input 
                      type="email" 
                      className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="info@sourcingeu.com"
                      value={settings.sender_email || ''}
                      onChange={e => setSettings({...settings, sender_email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Avsändarens Namn</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="SourcingEU Team"
                      value={settings.sender_name || ''}
                      onChange={e => setSettings({...settings, sender_name: e.target.value})}
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end pt-4 border-t border-slate-100">
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2"
                    >
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      Spara Inställningar
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <motion.div
              key="contacts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="bg-blue-50 p-4 rounded-full">
                    <Upload className="w-8 h-8 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Ladda upp CSV</h3>
                    <p className="text-sm text-slate-500 px-4">Importera din lista med producenter och inköpare automatiskt.</p>
                  </div>
                  <label className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold cursor-pointer hover:bg-blue-700 transition">
                    Välj Fil
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                  </label>
                  <HelpBox>Programmet letar efter kolumner som 'Namn', 'Företag' och 'E-post'.</HelpBox>
                </div>

                <div 
                  onClick={() => setShowManualForm(true)}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center space-y-4 cursor-pointer hover:border-blue-300 transition-colors"
                >
                  <div className="bg-green-50 p-4 rounded-full">
                    <Plus className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Lägg till Manuellt</h3>
                    <p className="text-sm text-slate-500 px-4">Fyll i uppgifter för en enstaka kontakt direkt i CRM.</p>
                  </div>
                  <div className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
                    Öppna Formulär
                  </div>
                </div>
              </div>

              {showManualForm && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="bg-white p-6 rounded-2xl border-2 border-green-200 shadow-lg"
                >
                  <h3 className="font-bold mb-4">Ny Kontakt</h3>
                  <form onSubmit={handleAddContact} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input 
                      type="text" placeholder="Namn" required
                      className="p-2 border rounded-lg"
                      value={newContact.name}
                      onChange={e => setNewContact({...newContact, name: e.target.value})}
                    />
                    <input 
                      type="text" placeholder="Företag" required
                      className="p-2 border rounded-lg"
                      value={newContact.company}
                      onChange={e => setNewContact({...newContact, company: e.target.value})}
                    />
                    <input 
                      type="email" placeholder="E-post" required
                      className="p-2 border rounded-lg"
                      value={newContact.email}
                      onChange={e => setNewContact({...newContact, email: e.target.value})}
                    />
                    <select 
                      className="p-2 border rounded-lg"
                      value={newContact.category}
                      onChange={e => setNewContact({...newContact, category: e.target.value})}
                    >
                      <option value="Inköpare">Inköpare</option>
                      <option value="Producent">Producent</option>
                    </select>
                    <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                      <button type="button" onClick={() => setShowManualForm(false)} className="px-4 py-2 text-slate-500">Avbryt</button>
                      <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold">Spara Kontakt</button>
                    </div>
                  </form>
                </motion.div>
              )}

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Sök bland kontakter..." 
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                      value={search}
                      onChange={e => {
                        setSearch(e.target.value);
                        fetchContacts(e.target.value);
                      }}
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 w-10 text-center">Val</th>
                        <th className="px-6 py-4">Namn</th>
                        <th className="px-6 py-4">Företag</th>
                        <th className="px-6 py-4">E-post</th>
                        <th className="px-6 py-4">Kategori</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contacts.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-center">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded text-blue-600"
                              checked={selectedContacts.includes(c.id)}
                              onChange={() => toggleContactSelection(c.id)}
                            />
                          </td>
                          <td className="px-6 py-4 font-medium">{c.name}</td>
                          <td className="px-6 py-4 text-slate-600">{c.company}</td>
                          <td className="px-6 py-4 text-blue-600 text-sm italic underline cursor-pointer">{c.email}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              c.category === 'Inköpare' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {c.category}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* Outreach Tab */}
          {activeTab === 'outreach' && (
            <motion.div
              key="outreach"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="text-2xl font-bold mb-2">Outreach Campaign</h2>
                <p className="text-slate-500 mb-6">Skicka personifierade mejl till dina utvalda kontakter.</p>

                <InfoBox title="Så här fungerar personifiering">
                  Använd taggen <b>{`{{namn}}`}</b> i ditt mejl för att automatiskt byta ut det mot mottagarens namn. 
                  Programmet skickar mejlen med ett 30-sekunders intervall för att se till att du inte fastnar i spam-filter.
                </InfoBox>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold flex justify-between">
                      <span>Valda Kontakter</span>
                      <span className="text-blue-600">{selectedContacts.length} st markerade</span>
                    </label>
                    <div className="p-3 bg-slate-50 rounded-lg text-sm flex gap-2 flex-wrap max-h-24 overflow-y-auto">
                      {selectedContacts.length === 0 ? (
                        <span className="text-slate-400 italic">Inga kontakter valda. Gå till 'Kontakter' fliken och kryssa i de du vill nå.</span>
                      ) : (
                        contacts.filter(c => selectedContacts.includes(c.id)).map(c => (
                          <span key={c.id} className="bg-white border border-slate-200 px-2 py-1 rounded-md text-xs">{c.name}</span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold">Ämnesrad (Subject)</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      placeholder="Partnerskap med SourcingEU"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold">Meddelande (Body)</label>
                    <textarea 
                      rows={10}
                      className="w-full p-4 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm leading-relaxed"
                      value={body}
                      onChange={e => setBody(e.target.value)}
                    />
                  </div>

                  {mailingProgress && (
                    <div className="space-y-3 bg-blue-50 p-6 rounded-2xl border border-blue-100">
                      <div className="flex justify-between text-sm font-bold text-blue-800">
                        <span>Skickar mejl...</span>
                        <span>{mailingProgress.current} / {mailingProgress.total}</span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-4 overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(mailingProgress.current / mailingProgress.total) * 100}%` }}
                          className="h-full bg-blue-600 transition-all duration-500"
                        />
                      </div>
                      <p className="text-xs text-blue-600 italic">Väntar 30 sekunder mellan varje mejl för att optimera leverans...</p>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button 
                      onClick={handleSendEmails}
                      disabled={loading || selectedContacts.length === 0}
                      className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-blue-700 transition shadow-xl shadow-blue-200 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
                      Starta Utskick
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center flex flex-col items-center justify-center space-y-2">
                  <div className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Totalt Skickade Mejl</div>
                  <div className="text-5xl font-black text-blue-600">{stats?.emails_sent || 0}</div>
                  <p className="text-xs text-slate-400">Total volym sedan start</p>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 col-span-2">
                  <h3 className="font-bold text-lg mb-4">Kategorier i Databasen</h3>
                  <div className="flex gap-8 justify-around items-end h-32 pt-4">
                    {stats?.categories.map(cat => (
                      <div key={cat.category} className="flex flex-col items-center gap-2 flex-1">
                        <div className="text-xs font-bold text-slate-400">{cat.count}</div>
                        <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: `${(cat.count / (contacts.length || 1)) * 100}%` }}
                          className={`w-full rounded-t-lg shadow-sm ${cat.category === 'Inköpare' ? 'bg-orange-500' : 'bg-blue-500'}`}
                        />
                        <div className="text-xs font-bold mt-2 uppercase tracking-tighter">{cat.category}</div>
                      </div>
                    ))}
                    {(!stats?.categories || stats.categories.length === 0) && (
                      <div className="text-slate-400 italic text-sm w-full text-center pb-8 border-b border-slate-100">
                        Ingen data tillgänglig ännu. Ladda upp kontakter under fliken 'Kontakter'.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-blue-900 p-10 rounded-2xl text-white relative overflow-hidden shadow-2xl">
                <div className="relative z-10 space-y-4">
                  <h3 className="text-3xl font-bold">Välkommen till SourcingEU Intelligence</h3>
                  <p className="text-blue-100 max-w-lg leading-relaxed">
                    Här ser du resultaten av ditt nätverkande. Genom konsekvent outreach och uppföljning bygger du framtidens sourcingsystem.
                  </p>
                  <button onClick={() => fetchStats()} className="bg-white text-blue-900 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-50 transition">
                    Uppdatera Statistik
                  </button>
                </div>
                <div className="absolute top-0 right-0 p-8 transform translate-x-1/4 -translate-y-1/4">
                  <div className="w-64 h-64 border-8 border-blue-800 rounded-full opacity-20" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / Helper */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-3 px-6 z-20">
        <div className="max-w-6xl mx-auto flex justify-between items-center text-xs text-slate-400 font-medium">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>SourcingEU CRM v1.0 • Systemet är aktivt</span>
          </div>
          <div className="flex gap-4">
            <a href="https://brevo.com" target="_blank" rel="noreferrer" className="hover:text-slate-600 flex items-center gap-1">
              Brevo Dashboard <ExternalLink className="w-3 h-3" />
            </a>
            <span>Användarstöd: support@sourcingeu.com</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
