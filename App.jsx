import { useState, useEffect, useCallback } from 'react';
import {
  Plane, Plus, Calendar, X, TrendingDown, TrendingUp, Bell, ArrowRight,
  Sparkles, RefreshCw, ExternalLink, Settings, AlertCircle, Loader2, Check
} from 'lucide-react';

// ============ Persistência local ============
// Substitui o window.storage do ambiente de artifact por localStorage.
// Mantém a interface { value } para minimizar mudanças no resto do código.
const storage = {
  async get(key) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? null : { value: v };
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

// ============ City data: IATA + base price EUR (round-trip economy) ============
const CITY_DATA = {
  'são paulo': { code: 'GRU', base: 720 }, 'sao paulo': { code: 'GRU', base: 720 },
  'rio de janeiro': { code: 'GIG', base: 780 }, 'rio': { code: 'GIG', base: 780 },
  'paris': { code: 'CDG', base: 165 }, 'londres': { code: 'LHR', base: 175 }, 'london': { code: 'LHR', base: 175 },
  'nova york': { code: 'JFK', base: 580 }, 'new york': { code: 'JFK', base: 580 },
  'madrid': { code: 'MAD', base: 95 }, 'madri': { code: 'MAD', base: 95 },
  'barcelona': { code: 'BCN', base: 120 }, 'berlim': { code: 'BER', base: 170 }, 'berlin': { code: 'BER', base: 170 },
  'roma': { code: 'FCO', base: 155 }, 'rome': { code: 'FCO', base: 155 },
  'dubai': { code: 'DXB', base: 620 }, 'tóquio': { code: 'HND', base: 950 }, 'tokyo': { code: 'HND', base: 950 },
  'amsterdã': { code: 'AMS', base: 145 }, 'amsterdam': { code: 'AMS', base: 145 },
  'frankfurt': { code: 'FRA', base: 165 }, 'milão': { code: 'MXP', base: 140 }, 'milan': { code: 'MXP', base: 140 },
  'atenas': { code: 'ATH', base: 195 }, 'athens': { code: 'ATH', base: 195 },
  'istambul': { code: 'IST', base: 280 }, 'istanbul': { code: 'IST', base: 280 },
  'cingapura': { code: 'SIN', base: 880 }, 'singapore': { code: 'SIN', base: 880 },
  'buenos aires': { code: 'EZE', base: 820 }, 'cidade do méxico': { code: 'MEX', base: 670 },
  'porto': { code: 'OPO', base: 75 }, 'fortaleza': { code: 'FOR', base: 620 },
  'recife': { code: 'REC', base: 680 }, 'salvador': { code: 'SSA', base: 660 },
  'belo horizonte': { code: 'CNF', base: 750 }, 'brasília': { code: 'BSB', base: 720 }, 'brasilia': { code: 'BSB', base: 720 },
  'porto alegre': { code: 'POA', base: 760 }, 'florianópolis': { code: 'FLN', base: 770 }, 'florianopolis': { code: 'FLN', base: 770 },
  'curitiba': { code: 'CWB', base: 780 }, 'manaus': { code: 'MAO', base: 880 }, 'belém': { code: 'BEL', base: 820 }, 'belem': { code: 'BEL', base: 820 },
  'natal': { code: 'NAT', base: 690 },
  'cancún': { code: 'CUN', base: 580 }, 'cancun': { code: 'CUN', base: 580 },
  'miami': { code: 'MIA', base: 540 }, 'orlando': { code: 'MCO', base: 560 },
  'los angeles': { code: 'LAX', base: 720 }, 'boston': { code: 'BOS', base: 510 }, 'chicago': { code: 'ORD', base: 590 },
  'cidade do cabo': { code: 'CPT', base: 720 }, 'cape town': { code: 'CPT', base: 720 },
  'joanesburgo': { code: 'JNB', base: 680 }, 'maputo': { code: 'MPM', base: 850 }, 'luanda': { code: 'LAD', base: 690 },
  'praia': { code: 'RAI', base: 380 }, 'funchal': { code: 'FNC', base: 130 }, 'madeira': { code: 'FNC', base: 130 },
  'ponta delgada': { code: 'PDL', base: 145 }, 'açores': { code: 'PDL', base: 145 },
};

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function getCityInfo(name) {
  if (!name) return { code: '---', base: 400, known: false };
  const key = name.toLowerCase().trim();
  if (CITY_DATA[key]) return { ...CITY_DATA[key], known: true };
  const cleaned = name.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(cleaned)) {
    return { code: cleaned, base: 180 + (hashString(key) % 720), known: true };
  }
  const code = name.replace(/[^a-zA-Z\u00C0-\u017F]/g, '').slice(0, 3).toUpperCase() || '---';
  return { code, base: 180 + (hashString(key) % 720), known: false };
}

const CLASS_MULTIPLIER = { economy: 1, premium: 1.85, business: 3.4, first: 5.8 };
const CLASS_LABELS = { economy: 'Econômica', premium: 'Premium Eco.', business: 'Executiva', first: 'Primeira' };
const CLASS_CODES = { economy: 'Y', premium: 'W', business: 'J', first: 'F' };
const CLASS_API = { economy: 1, premium: 2, business: 3, first: 4 };

function calcMockPrice(route, seed = 0) {
  try {
    const info = getCityInfo(route.otherCity);
    const base = info.base;
    const classMult = CLASS_MULTIPLIER[route.travelClass] || 1;
    const today = new Date();
    const dep = new Date(route.departureDate);
    const daysOut = (dep - today) / 86400000;
    const daysFactor = daysOut < 7 ? 1.55 : daysOut < 21 ? 1.25 : daysOut < 60 ? 1.0 : daysOut < 120 ? 0.88 : 0.82;
    const ret = new Date(route.returnDate);
    const tripDays = Math.max(1, (ret - dep) / 86400000);
    const tripFactor = tripDays > 14 ? 0.95 : tripDays < 4 ? 1.08 : 1.0;
    const h = hashString((route.otherCity || '') + route.departureDate + route.returnDate);
    const variance = Math.sin((seed + h) * 0.0137) * 0.12 + Math.cos((seed + h) * 0.0083) * 0.06;
    return Math.max(50, Math.round(base * classMult * daysFactor * tripFactor * (1 + variance) * (route.passengers || 1)));
  } catch { return 0; }
}

async function fetchRealPrice(workerUrl, secret, route) {
  const info = getCityInfo(route.otherCity);
  const isFrom = route.direction === 'from-lisbon';
  const from = isFrom ? 'LIS' : info.code;
  const to = isFrom ? info.code : 'LIS';

  const u = new URL(workerUrl);
  u.searchParams.set('from', from);
  u.searchParams.set('to', to);
  u.searchParams.set('outbound', route.departureDate);
  u.searchParams.set('return', route.returnDate);
  u.searchParams.set('travel_class', CLASS_API[route.travelClass] || 1);
  u.searchParams.set('adults', route.passengers || 1);
  u.searchParams.set('currency', 'EUR');

  const headers = { 'Accept': 'application/json' };
  if (secret) headers['x-app-secret'] = secret;

  const res = await fetch(u.toString(), { headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

const fmtEUR = v => '€ ' + Number(v).toLocaleString('pt-PT', { maximumFractionDigits: 0 });
const fmtBRL = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) : '';
const fmtAgo = ts => {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
};
const fmtDuration = m => {
  if (!m) return '';
  const h = Math.floor(m / 60), min = m % 60;
  return `${h}h${min > 0 ? ` ${min}min` : ''}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function priceHistory(route, points = 14) {
  const out = [];
  const now = Math.floor(Date.now() / 86400000);
  for (let i = points - 1; i >= 0; i--) out.push(calcMockPrice(route, now - i));
  return out;
}

function Sparkline({ data, width = 80, height = 26, color = '#1B4F8E' }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  const lastY = height - ((data[data.length - 1] - min) / range) * height;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      <circle cx={width} cy={lastY} r="2.2" fill={color} />
    </svg>
  );
}

// ===================== MAIN =====================
export default function VooLisboa() {
  const [view, setView] = useState('monitor');
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rate, setRate] = useState(6.35);
  const [rateLoading, setRateLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const [workerUrl, setWorkerUrl] = useState('');
  const [workerSecret, setWorkerSecret] = useState('');

  const [fetchState, setFetchState] = useState({});
  const [fetchErr, setFetchErr] = useState({});

  const [direction, setDirection] = useState('from-lisbon');
  const [otherCity, setOtherCity] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [travelClass, setTravelClass] = useState('economy');
  const [passengers, setPassengers] = useState(1);
  const [targetPrice, setTargetPrice] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await storage.get('voos-lisboa:routes').catch(() => null);
        if (r?.value) { const p = JSON.parse(r.value); if (Array.isArray(p)) setRoutes(p); }
        const s = await storage.get('voos-lisboa:settings').catch(() => null);
        if (s?.value) { const v = JSON.parse(s.value); setWorkerUrl(v.workerUrl || ''); setWorkerSecret(v.workerSecret || ''); }
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=BRL');
        if (r.ok) { const d = await r.json(); if (d?.rates?.BRL) setRate(d.rates.BRL); }
      } catch {}
      setRateLoading(false);
    })();
  }, []);

  async function persistRoutes(next) {
    setRoutes(next);
    try { await storage.set('voos-lisboa:routes', JSON.stringify(next)); } catch {}
  }

  async function saveSettings(url, secret) {
    setWorkerUrl(url); setWorkerSecret(secret);
    try { await storage.set('voos-lisboa:settings', JSON.stringify({ workerUrl: url, workerSecret: secret })); } catch {}
  }

  const fetchOne = useCallback(async (route, baseRoutes) => {
    if (!workerUrl) return;
    setFetchState(s => ({ ...s, [route.id]: 'loading' }));
    setFetchErr(s => ({ ...s, [route.id]: null }));
    try {
      const data = await fetchRealPrice(workerUrl, workerSecret, route);
      const updated = { ...route, lastFetch: { ...data, fetchedAt: Date.now() } };
      const base = baseRoutes || routes;
      const next = base.map(r => r.id === route.id ? updated : r);
      await persistRoutes(next);
      setFetchState(s => ({ ...s, [route.id]: 'ok' }));
    } catch (e) {
      setFetchState(s => ({ ...s, [route.id]: 'error' }));
      setFetchErr(s => ({ ...s, [route.id]: e.message || 'Erro' }));
    }
  }, [workerUrl, workerSecret, routes]);

  const refreshAll = useCallback(async () => {
    if (!workerUrl) { setTick(t => t + 1); return; }
    await Promise.all(routes.map(r => fetchOne(r, routes)));
  }, [workerUrl, routes, fetchOne]);

  function resetForm() {
    setDirection('from-lisbon'); setOtherCity(''); setDepartureDate(''); setReturnDate('');
    setTravelClass('economy'); setPassengers(1); setTargetPrice(''); setFormError(''); setEditingId(null);
  }

  function loadIntoForm(r) {
    setDirection(r.direction); setOtherCity(r.otherCity);
    setDepartureDate(r.departureDate); setReturnDate(r.returnDate);
    setTravelClass(r.travelClass); setPassengers(r.passengers);
    setTargetPrice(r.targetPrice != null ? String(r.targetPrice) : '');
    setEditingId(r.id); setView('search');
  }

  async function handleSubmit() {
    setFormError('');
    if (!otherCity.trim()) return setFormError('Informe a cidade.');
    if (!departureDate) return setFormError('Selecione a data de ida.');
    if (!returnDate) return setFormError('Selecione a data de volta.');
    if (new Date(returnDate) < new Date(departureDate)) return setFormError('A volta deve ser depois da ida.');

    const id = editingId || uid();
    const existing = editingId ? routes.find(r => r.id === editingId) : null;
    const newRoute = {
      id, direction, otherCity: otherCity.trim(),
      departureDate, returnDate, travelClass, passengers,
      targetPrice: targetPrice ? Number(targetPrice) : null,
      createdAt: existing?.createdAt || Date.now(),
      lastFetch: existing?.lastFetch || null,
    };
    const next = editingId ? routes.map(r => r.id === editingId ? newRoute : r) : [newRoute, ...routes];
    await persistRoutes(next);
    resetForm();
    setView('monitor');
    if (workerUrl) fetchOne(newRoute, next);
  }

  const minDate = new Date().toISOString().slice(0, 10);
  const previewRoute = (otherCity && departureDate && returnDate)
    ? { direction, otherCity, departureDate, returnDate, travelClass, passengers } : null;

  return (
    <div className="min-h-screen w-full flex justify-center"
      style={{ background: 'linear-gradient(180deg, #F5EFE3 0%, #ECE2CE 100%)', fontFamily: '"DM Sans", system-ui, sans-serif', color: '#1C1A17' }}>
      <div className="w-full flex flex-col relative" style={{ maxWidth: '430px', minHeight: '100vh' }}>

        <header className="px-6 pt-12 pb-5 relative">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#1B4F8E' }}>
                <Plane className="w-4 h-4 text-white" strokeWidth={2.2} />
              </div>
              <button onClick={() => setShowSettings(true)} className="text-xs font-medium"
                style={{ color: '#8B7E68', letterSpacing: '0.18em' }}>
                LIS · {rateLoading ? '...' : `€1 = R$ ${rate.toFixed(2).replace('.', ',')}`}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowSettings(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90"
                aria-label="Configurações">
                <Settings className="w-4 h-4" />
              </button>
              <button onClick={refreshAll}
                className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90"
                aria-label="Atualizar preços">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <h1 style={{ fontFamily: '"Fraunces", serif', fontSize: '48px', lineHeight: 0.95, fontWeight: 400, letterSpacing: '-0.025em' }}>
            Voo<span style={{ fontStyle: 'italic', fontWeight: 300, color: '#1B4F8E' }}>Lisboa</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: '#8B7E68' }}>
            Monitor de passagens · ida e volta
            {!workerUrl && <span style={{ marginLeft: 6, color: '#C95E3D' }}>· modo demo</span>}
          </p>

          <div className="mt-6 flex gap-1 p-1 rounded-full" style={{ backgroundColor: 'rgba(28,26,23,0.06)' }}>
            <button onClick={() => { setView('monitor'); resetForm(); }}
              className="flex-1 py-2 text-sm rounded-full transition"
              style={{ backgroundColor: view === 'monitor' ? '#1C1A17' : 'transparent', color: view === 'monitor' ? '#F5EFE3' : '#1C1A17', fontWeight: 500 }}>
              Rotas {routes.length > 0 && <span style={{ opacity: 0.55, marginLeft: 4 }}>· {routes.length}</span>}
            </button>
            <button onClick={() => { resetForm(); setView('search'); }}
              className="flex-1 py-2 text-sm rounded-full transition"
              style={{ backgroundColor: view === 'search' ? '#1C1A17' : 'transparent', color: view === 'search' ? '#F5EFE3' : '#1C1A17', fontWeight: 500 }}>
              Nova busca
            </button>
          </div>
        </header>

        <main className="px-6 pb-24 flex-1">
          {view === 'monitor' && (
            loading ? (
              <div className="py-16 text-center text-sm" style={{ color: '#8B7E68' }}>Carregando suas rotas…</div>
            ) : routes.length === 0 ? (
              <EmptyState onNew={() => setView('search')} hasWorker={!!workerUrl} onSetup={() => setShowSettings(true)} />
            ) : (
              <div className="space-y-4">
                {routes.map(r => (
                  <RouteCard key={r.id} route={r} tick={tick} rate={rate}
                    fetchStatus={fetchState[r.id]} fetchError={fetchErr[r.id]} hasWorker={!!workerUrl}
                    onRefresh={() => fetchOne(r, routes)}
                    onDelete={() => persistRoutes(routes.filter(x => x.id !== r.id))}
                    onEdit={() => loadIntoForm(r)} />
                ))}
                <button onClick={() => { resetForm(); setView('search'); }}
                  className="w-full py-4 rounded-2xl transition active:scale-95 flex items-center justify-center gap-2"
                  style={{ border: '2px dashed #C9B996', color: '#1B4F8E', fontWeight: 500 }}>
                  <Plus className="w-4 h-4" /> Adicionar rota
                </button>
              </div>
            )
          )}

          {view === 'search' && (
            <SearchForm
              direction={direction} setDirection={setDirection}
              otherCity={otherCity} setOtherCity={setOtherCity}
              departureDate={departureDate} setDepartureDate={setDepartureDate}
              returnDate={returnDate} setReturnDate={setReturnDate}
              travelClass={travelClass} setTravelClass={setTravelClass}
              passengers={passengers} setPassengers={setPassengers}
              targetPrice={targetPrice} setTargetPrice={setTargetPrice}
              minDate={minDate} onSubmit={handleSubmit} formError={formError}
              isEditing={!!editingId}
              onCancel={() => { resetForm(); setView('monitor'); }}
              rate={rate} previewRoute={previewRoute} />
          )}
        </main>

        <footer className="px-6 py-4 text-center" style={{ color: '#A89B82', fontSize: '10px', letterSpacing: '0.15em' }}>
          {workerUrl ? 'DADOS VIA GOOGLE FLIGHTS · SERPAPI' : 'MODO DEMO · CONFIGURE A FONTE DE DADOS NAS CONFIGURAÇÕES'}
        </footer>

        {showSettings && (
          <SettingsSheet
            initialUrl={workerUrl} initialSecret={workerSecret}
            onSave={async (u, s) => { await saveSettings(u, s); setShowSettings(false); }}
            onClose={() => setShowSettings(false)} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ onNew, hasWorker, onSetup }) {
  return (
    <div className="py-10 text-center">
      <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: 'rgba(27,79,142,0.08)' }}>
        <Plane className="w-8 h-8" style={{ color: '#1B4F8E' }} strokeWidth={1.4} />
      </div>
      <h2 style={{ fontFamily: '"Fraunces", serif', fontSize: '26px', fontWeight: 400, letterSpacing: '-0.01em' }}>
        Para onde, e por quanto?
      </h2>
      <p className="mt-3 mb-8 text-sm leading-relaxed mx-auto" style={{ color: '#8B7E68', maxWidth: '300px' }}>
        Adicione uma rota para acompanhar os preços de ida e volta saindo de Lisboa, ou de qualquer cidade para cá.
      </p>
      <button onClick={onNew}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full transition active:scale-95"
        style={{ backgroundColor: '#1C1A17', color: '#F5EFE3', fontWeight: 500 }}>
        <Plus className="w-4 h-4" /> Primeira rota
      </button>
      {!hasWorker && (
        <button onClick={onSetup}
          className="block mx-auto mt-6 text-xs hover:underline" style={{ color: '#1B4F8E', textUnderlineOffset: '3px' }}>
          Configurar dados reais →
        </button>
      )}
    </div>
  );
}

function RouteCard({ route, tick, rate, fetchStatus, fetchError, hasWorker, onRefresh, onDelete, onEdit }) {
  const otherInfo = getCityInfo(route.otherCity);
  const isFrom = route.direction === 'from-lisbon';
  const fromCode = isFrom ? 'LIS' : otherInfo.code;
  const toCode = isFrom ? otherInfo.code : 'LIS';
  const fromName = isFrom ? 'Lisboa' : route.otherCity;
  const toName = isFrom ? route.otherCity : 'Lisboa';

  const real = route.lastFetch;
  const priceEur = real?.priceEur ?? calcMockPrice(route, tick);
  const priceBrl = Math.round(priceEur * rate);
  const history = priceHistory(route);
  const prev = history[history.length - 2] || priceEur;
  const trend = priceEur < prev ? 'down' : priceEur > prev ? 'up' : 'flat';
  const trendPct = prev ? Math.round(((priceEur - prev) / prev) * 100) : 0;
  const target = route.targetPrice;
  const belowTarget = target && priceEur <= target;

  const isLoading = fetchStatus === 'loading';
  const hasError = fetchStatus === 'error';

  const priceLevelLabel = {
    low: 'preço baixo', typical: 'preço típico', high: 'preço alto'
  }[real?.priceLevel];

  return (
    <div className="relative rounded-2xl overflow-hidden"
      style={{ backgroundColor: '#FFFEFA', boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 10px 28px -14px rgba(28,26,23,0.18)' }}>
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div style={{ fontSize: '10px', color: '#8B7E68', letterSpacing: '0.18em', fontWeight: 500 }}>
            {CLASS_CODES[route.travelClass]} · {CLASS_LABELS[route.travelClass].toUpperCase()}
            {route.passengers > 1 && ` · ${route.passengers} PAX`}
          </div>
          <button onClick={onDelete} className="transition active:scale-90" style={{ color: '#B8AC95' }} aria-label="Remover">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-baseline gap-3">
          <div>
            <div style={{ fontFamily: '"Fraunces", serif', fontSize: '30px', fontWeight: 500, lineHeight: 0.95, letterSpacing: '-0.02em' }}>
              {fromCode}
            </div>
            <div style={{ fontSize: '10px', color: '#8B7E68', letterSpacing: '0.1em', marginTop: 4, textTransform: 'uppercase' }}>
              {fromName}
            </div>
          </div>
          <div className="flex-1 relative" style={{ paddingTop: 14 }}>
            <div style={{ borderTop: '1px dashed #C9B996' }}></div>
            <Plane className="w-3.5 h-3.5 absolute"
              style={{ top: 7, left: '50%', transform: 'translateX(-50%) rotate(90deg)', color: '#1B4F8E' }}
              fill="#1B4F8E" strokeWidth={1.5} />
          </div>
          <div className="text-right">
            <div style={{ fontFamily: '"Fraunces", serif', fontSize: '30px', fontWeight: 500, lineHeight: 0.95, letterSpacing: '-0.02em' }}>
              {toCode}
            </div>
            <div style={{ fontSize: '10px', color: '#8B7E68', letterSpacing: '0.1em', marginTop: 4, textTransform: 'uppercase' }}>
              {toName}
            </div>
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: '1px', backgroundColor: '#F0E8D6' }}>
        <div className="absolute w-4 h-4 rounded-full" style={{ left: -8, top: -8, backgroundColor: '#F5EFE3' }}></div>
        <div className="absolute w-4 h-4 rounded-full" style={{ right: -8, top: -8, backgroundColor: '#ECE2CE' }}></div>
      </div>

      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between mb-3" style={{ fontSize: '12px', color: '#8B7E68' }}>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
              {fmtDate(route.departureDate)} → {fmtDate(route.returnDate)}
            </span>
          </div>
          {belowTarget ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#1B4F8E', color: '#F5EFE3', fontSize: '10px', fontWeight: 500 }}>
              <Sparkles className="w-3 h-3" /> ALVO ATINGIDO
            </div>
          ) : target ? (
            <div className="flex items-center gap-1"><Bell className="w-3 h-3" /> alvo {fmtEUR(target)}</div>
          ) : null}
        </div>

        {real?.airline && (
          <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px dashed #F0E8D6' }}>
            {real.airlineLogo ? (
              <img src={real.airlineLogo} alt={real.airline} style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} />
            ) : (
              <div style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: 'rgba(27,79,142,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plane className="w-3 h-3" style={{ color: '#1B4F8E' }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#1C1A17', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {real.airline}
              </div>
              <div style={{ fontSize: '10px', color: '#8B7E68', letterSpacing: '0.05em' }}>
                {real.nonstop ? 'Direto' : 'Com escala'}
                {real.durationMin ? ` · ${fmtDuration(real.durationMin)}` : ''}
                {priceLevelLabel ? ` · ${priceLevelLabel}` : ''}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-end justify-between">
          <div style={{ opacity: isLoading ? 0.5 : 1 }}>
            <div style={{
              fontFamily: '"Fraunces", serif', fontSize: '34px', fontWeight: 500, lineHeight: 0.95,
              color: belowTarget ? '#1B4F8E' : '#1C1A17', letterSpacing: '-0.02em'
            }}>
              {fmtEUR(priceEur)}
            </div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#8B7E68', marginTop: 4 }}>
              ≈ {fmtBRL(priceBrl)}
            </div>
            {!real && (
              <div style={{ fontSize: '10px', color: '#A89B82', marginTop: 4, fontStyle: 'italic' }}>
                {hasWorker ? 'aguardando dados reais…' : 'estimativa (modo demo)'}
              </div>
            )}
            {real?.fetchedAt && (
              <div style={{ fontSize: '10px', color: '#A89B82', marginTop: 4 }}>
                atualizado {fmtAgo(real.fetchedAt)}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Sparkline data={history} color={trend === 'down' ? '#3D8B5C' : trend === 'up' ? '#C95E3D' : '#8B7E68'} />
            <div className="flex items-center gap-0.5"
              style={{ color: trend === 'down' ? '#3D8B5C' : trend === 'up' ? '#C95E3D' : '#8B7E68', fontSize: '11px' }}>
              {trend === 'down' && <TrendingDown className="w-3 h-3" />}
              {trend === 'up' && <TrendingUp className="w-3 h-3" />}
              <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                {trend !== 'flat' ? `${trendPct > 0 ? '+' : ''}${trendPct}%` : '—'}
              </span>
            </div>
          </div>
        </div>

        {hasError && (
          <div className="mt-3 px-3 py-2 rounded-lg flex items-start gap-2"
            style={{ backgroundColor: '#FBE9E0', color: '#C95E3D', fontSize: '11px' }}>
            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <div style={{ flex: 1 }}>Falha ao buscar: {fetchError}</div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          {real?.bookingUrl ? (
            <a href={real.bookingUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition active:scale-95"
              style={{ backgroundColor: '#1B4F8E', color: '#F5EFE3', fontSize: '13px', fontWeight: 500 }}>
              Comprar passagem <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : hasWorker ? (
            <button onClick={onRefresh} disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition active:scale-95"
              style={{ backgroundColor: 'rgba(27,79,142,0.08)', color: '#1B4F8E', fontSize: '13px', fontWeight: 500 }}>
              {isLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…</> : <>Buscar agora</>}
            </button>
          ) : (
            <div className="flex-1 text-center py-2.5 rounded-xl"
              style={{ backgroundColor: 'rgba(28,26,23,0.04)', color: '#A89B82', fontSize: '12px' }}>
              link de compra após configurar
            </div>
          )}
          <button onClick={onEdit}
            className="px-3 py-2.5 rounded-xl transition active:scale-95"
            style={{ backgroundColor: 'rgba(28,26,23,0.04)', color: '#1C1A17', fontSize: '12px', fontWeight: 500 }}>
            Editar
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchForm(props) {
  const {
    direction, setDirection, otherCity, setOtherCity,
    departureDate, setDepartureDate, returnDate, setReturnDate,
    travelClass, setTravelClass, passengers, setPassengers,
    targetPrice, setTargetPrice, minDate, onSubmit, formError,
    isEditing, onCancel, rate, previewRoute
  } = props;

  const previewPrice = previewRoute ? calcMockPrice(previewRoute) : null;
  const previewBrl = previewPrice ? Math.round(previewPrice * rate) : null;
  const otherInfo = otherCity ? getCityInfo(otherCity) : null;

  const inputStyle = { backgroundColor: '#FFFEFA', border: '1px solid #E5DBC4', color: '#1C1A17', fontFamily: '"DM Sans", sans-serif' };
  const labelStyle = { color: '#8B7E68', fontSize: '11px', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase' };

  return (
    <div className="space-y-5">
      <div>
        <label style={labelStyle} className="block mb-2">Direção</label>
        <div className="grid grid-cols-2 gap-2">
          {[{ k: 'from-lisbon', a: 'LIS', b: 'outra' }, { k: 'to-lisbon', a: 'outra', b: 'LIS' }].map(opt => (
            <button key={opt.k} onClick={() => setDirection(opt.k)}
              className="py-3 px-3 rounded-xl text-sm transition active:scale-95 flex items-center justify-center gap-2"
              style={{
                backgroundColor: direction === opt.k ? '#1C1A17' : '#FFFEFA',
                color: direction === opt.k ? '#F5EFE3' : '#1C1A17',
                border: `1px solid ${direction === opt.k ? '#1C1A17' : '#E5DBC4'}`, fontWeight: 500,
              }}>
              {opt.a} <ArrowRight className="w-3 h-3" /> {opt.b}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle} className="block mb-2">{direction === 'from-lisbon' ? 'Destino' : 'Origem'}</label>
        <input type="text" value={otherCity} onChange={e => setOtherCity(e.target.value)}
          placeholder="ex: São Paulo, Paris, ou código (GRU, CDG)…"
          className="w-full px-4 py-3 rounded-xl text-base outline-none"
          style={{ ...inputStyle, fontSize: '16px' }} />
        {otherCity && otherInfo && (
          <div style={{ fontSize: '11px', color: otherInfo.known ? '#3D8B5C' : '#C95E3D', marginTop: 6 }}>
            {otherInfo.known
              ? <>Aeroporto: <strong style={{ fontFamily: '"JetBrains Mono", monospace' }}>{otherInfo.code}</strong></>
              : <>Cidade não reconhecida. Use o código IATA (3 letras, ex: GRU, LHR).</>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle} className="block mb-2">Ida</label>
          <input type="date" value={departureDate} min={minDate}
            onChange={e => setDepartureDate(e.target.value)}
            className="w-full px-3 py-3 rounded-xl outline-none" style={{ ...inputStyle, fontSize: '15px' }} />
        </div>
        <div>
          <label style={labelStyle} className="block mb-2">Volta</label>
          <input type="date" value={returnDate} min={departureDate || minDate}
            onChange={e => setReturnDate(e.target.value)}
            className="w-full px-3 py-3 rounded-xl outline-none" style={{ ...inputStyle, fontSize: '15px' }} />
        </div>
      </div>

      <div>
        <label style={labelStyle} className="block mb-2">Categoria</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(CLASS_LABELS).map(([k, v]) => (
            <button key={k} onClick={() => setTravelClass(k)}
              className="py-2.5 px-3 rounded-xl text-sm transition active:scale-95"
              style={{
                backgroundColor: travelClass === k ? '#1B4F8E' : '#FFFEFA',
                color: travelClass === k ? '#F5EFE3' : '#1C1A17',
                border: `1px solid ${travelClass === k ? '#1B4F8E' : '#E5DBC4'}`, fontWeight: 500,
              }}>
              <div className="flex items-center justify-between">
                <span>{v}</span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', opacity: travelClass === k ? 0.8 : 0.5 }}>
                  {CLASS_CODES[k]}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle} className="block mb-2">Passageiros</label>
        <div className="flex items-center gap-2">
          <button onClick={() => setPassengers(Math.max(1, passengers - 1))}
            className="rounded-xl flex items-center justify-center transition active:scale-90"
            style={{ width: 48, height: 48, backgroundColor: '#FFFEFA', border: '1px solid #E5DBC4', fontSize: '20px', fontWeight: 500 }}>−</button>
          <div className="flex-1 text-center py-3 rounded-xl"
            style={{ backgroundColor: '#FFFEFA', border: '1px solid #E5DBC4', fontFamily: '"Fraunces", serif', fontSize: '20px', fontWeight: 500 }}>
            {passengers} {passengers === 1 ? 'pessoa' : 'pessoas'}
          </div>
          <button onClick={() => setPassengers(Math.min(9, passengers + 1))}
            className="rounded-xl flex items-center justify-center transition active:scale-90"
            style={{ width: 48, height: 48, backgroundColor: '#FFFEFA', border: '1px solid #E5DBC4', fontSize: '20px', fontWeight: 500 }}>+</button>
        </div>
      </div>

      <div>
        <label style={labelStyle} className="block mb-2">Alerta de preço · opcional (€)</label>
        <input type="number" inputMode="numeric" value={targetPrice}
          onChange={e => setTargetPrice(e.target.value)} placeholder="ex: 400" min="0"
          className="w-full px-4 py-3 rounded-xl outline-none" style={{ ...inputStyle, fontSize: '16px' }} />
        <p className="text-xs mt-1.5" style={{ color: '#A89B82' }}>
          Marcaremos a rota quando o preço cair abaixo deste valor.
        </p>
      </div>

      {previewPrice ? (
        <div className="rounded-xl p-4 flex items-center justify-between"
          style={{ backgroundColor: 'rgba(27,79,142,0.06)', border: '1px dashed #1B4F8E' }}>
          <div>
            <div style={{ color: '#1B4F8E', fontSize: '10px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4 }}>
              Estimativa inicial
            </div>
            <div style={{ fontFamily: '"Fraunces", serif', fontSize: '26px', fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {fmtEUR(previewPrice)}
            </div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#8B7E68', marginTop: 4 }}>
              ≈ {fmtBRL(previewBrl)}
            </div>
            <div style={{ fontSize: '10px', color: '#A89B82', marginTop: 6, fontStyle: 'italic' }}>
              preço real é buscado ao salvar
            </div>
          </div>
          <Plane className="w-10 h-10" style={{ color: '#1B4F8E', opacity: 0.4 }} strokeWidth={1.2} />
        </div>
      ) : null}

      {formError ? (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: '#FBE9E0', color: '#C95E3D' }}>
          {formError}
        </div>
      ) : null}

      <div className="space-y-2 pt-1">
        <button onClick={onSubmit}
          className="w-full py-4 rounded-xl text-base transition active:scale-95"
          style={{ backgroundColor: '#1C1A17', color: '#F5EFE3', fontWeight: 500 }}>
          {isEditing ? 'Salvar alterações' : 'Monitorar esta rota'}
        </button>
        <button onClick={onCancel}
          className="w-full py-3 rounded-xl text-sm transition" style={{ color: '#8B7E68' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function SettingsSheet({ initialUrl, initialSecret, onSave, onClose }) {
  const [url, setUrl] = useState(initialUrl);
  const [secret, setSecret] = useState(initialSecret);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const inputStyle = { backgroundColor: '#FFFEFA', border: '1px solid #E5DBC4', color: '#1C1A17' };
  const labelStyle = { color: '#8B7E68', fontSize: '11px', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase' };

  async function testConnection() {
    setTesting(true); setTestResult(null);
    try {
      const u = new URL(url);
      u.searchParams.set('from', 'LIS');
      u.searchParams.set('to', 'MAD');
      u.searchParams.set('outbound', new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
      u.searchParams.set('return', new Date(Date.now() + 37 * 86400000).toISOString().slice(0, 10));
      u.searchParams.set('travel_class', 1);
      u.searchParams.set('adults', 1);
      u.searchParams.set('currency', 'EUR');
      const headers = {};
      if (secret) headers['x-app-secret'] = secret;
      const r = await fetch(u.toString(), { headers });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { const j = await r.json(); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setTestResult({ ok: true, message: `Conectado! Teste LIS→MAD: ${fmtEUR(d.priceEur || 0)}` });
    } catch (e) {
      setTestResult({ ok: false, message: e.message || 'Falha na conexão' });
    }
    setTesting(false);
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end"
      style={{ backgroundColor: 'rgba(28,26,23,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full rounded-t-3xl px-6 pt-5 pb-8" onClick={e => e.stopPropagation()}
        style={{ backgroundColor: '#F5EFE3', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="w-12 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: '#C9B996' }}></div>

        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 style={{ fontFamily: '"Fraunces", serif', fontSize: '28px', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1 }}>
              Fonte de dados
            </h2>
            <p className="mt-1 text-xs" style={{ color: '#8B7E68' }}>
              Cole a URL do teu proxy (Cloudflare Worker).
            </p>
          </div>
          <button onClick={onClose} className="transition active:scale-90" style={{ color: '#8B7E68' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label style={labelStyle} className="block mb-2">URL do Worker</label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://voo-lisboa.SEU-USER.workers.dev"
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={{ ...inputStyle, fontSize: '14px', fontFamily: '"JetBrains Mono", monospace' }} />
          </div>

          <div>
            <label style={labelStyle} className="block mb-2">Segredo · opcional</label>
            <input type="password" value={secret} onChange={e => setSecret(e.target.value)}
              placeholder="se configurou APP_SECRET no Worker"
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={{ ...inputStyle, fontSize: '14px', fontFamily: '"JetBrains Mono", monospace' }} />
          </div>

          {url && (
            <button onClick={testConnection} disabled={testing}
              className="w-full py-3 rounded-xl text-sm transition active:scale-95 flex items-center justify-center gap-2"
              style={{ backgroundColor: 'rgba(27,79,142,0.1)', color: '#1B4F8E', fontWeight: 500 }}>
              {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Testando…</> : 'Testar conexão'}
            </button>
          )}

          {testResult && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-2 text-sm"
              style={{ backgroundColor: testResult.ok ? '#E3EDDF' : '#FBE9E0', color: testResult.ok ? '#3D8B5C' : '#C95E3D' }}>
              {testResult.ok ? <Check className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              <div>{testResult.message}</div>
            </div>
          )}

          <div className="rounded-xl p-4 text-xs space-y-2"
            style={{ backgroundColor: 'rgba(28,26,23,0.04)', color: '#5C5547' }}>
            <p style={{ fontWeight: 600, color: '#1C1A17' }}>Como configurar (5 min):</p>
            <ol style={{ paddingLeft: 16, listStyle: 'decimal' }} className="space-y-1">
              <li>Crie conta grátis em <strong>serpapi.com</strong> (250 buscas/mês grátis).</li>
              <li>Crie um Worker em <strong>workers.cloudflare.com</strong> e cole o código de <code style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10 }}>worker/voo-lisboa-worker.js</code>.</li>
              <li>Em "Settings → Variables" configure <code style={{ fontFamily: '"JetBrains Mono", monospace', backgroundColor: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3 }}>SERPAPI_KEY</code>.</li>
              <li>Copie a URL do Worker e cole acima.</li>
            </ol>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => onSave(url.trim(), secret.trim())}
              className="flex-1 py-3 rounded-xl transition active:scale-95"
              style={{ backgroundColor: '#1C1A17', color: '#F5EFE3', fontWeight: 500 }}>
              Salvar
            </button>
            {url && (
              <button onClick={() => { setUrl(''); setSecret(''); setTestResult(null); }}
                className="px-4 py-3 rounded-xl transition active:scale-95"
                style={{ color: '#C95E3D', fontSize: '13px' }}>
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
