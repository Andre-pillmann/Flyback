/**
 * VooLisboa — Cloudflare Worker (proxy para SerpAPI Google Flights)
 *
 * Variáveis de ambiente necessárias (em Settings → Variables):
 *   SERPAPI_KEY     — sua chave da SerpAPI (obrigatória, marque como Secret)
 *   APP_SECRET      — string compartilhada com o app (opcional, recomendado)
 *   ALLOWED_ORIGIN  — domínio do app pra restringir CORS (opcional; default "*")
 *
 * Endpoint: GET /?from=LIS&to=GRU&outbound=2026-09-10&return=2026-09-22&travel_class=1&adults=1&currency=EUR
 *
 * Headers (do app):
 *   x-app-secret: <APP_SECRET>     // se configurado
 *
 * Resposta:
 *   {
 *     priceEur, priceLevel, typicalRange,
 *     airline, airlineLogo, flightNumber, durationMin, nonstop,
 *     bookingUrl, fetchedAt
 *   }
 */

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-app-secret',
      'Access-Control-Max-Age': '86400',
    };

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return json({ error: 'Método não permitido' }, 405, corsHeaders);
    }

    // Secret check (se configurado)
    if (env.APP_SECRET) {
      const provided = request.headers.get('x-app-secret') || '';
      if (provided !== env.APP_SECRET) {
        return json({ error: 'Não autorizado' }, 401, corsHeaders);
      }
    }

    if (!env.SERPAPI_KEY) {
      return json({ error: 'SERPAPI_KEY não configurada no Worker' }, 500, corsHeaders);
    }

    const url = new URL(request.url);
    const p = url.searchParams;

    const from = (p.get('from') || '').toUpperCase().trim();
    const to = (p.get('to') || '').toUpperCase().trim();
    const outbound = p.get('outbound');
    const ret = p.get('return');
    const travelClass = p.get('travel_class') || '1';
    const adults = p.get('adults') || '1';
    const currency = (p.get('currency') || 'EUR').toUpperCase();

    if (!from || !to || !outbound || !ret) {
      return json({ error: 'Parâmetros obrigatórios: from, to, outbound, return' }, 400, corsHeaders);
    }

    // Edge cache key (30 min)
    const cacheKey = new Request(
      `https://cache.local/flights?from=${from}&to=${to}&out=${outbound}&ret=${ret}&cls=${travelClass}&adt=${adults}&cur=${currency}`,
      { method: 'GET' }
    );
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = await cached.text();
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-cache': 'HIT', ...corsHeaders },
      });
    }

    // Build SerpAPI request
    const serp = new URL('https://serpapi.com/search');
    serp.searchParams.set('engine', 'google_flights');
    serp.searchParams.set('api_key', env.SERPAPI_KEY);
    serp.searchParams.set('departure_id', from);
    serp.searchParams.set('arrival_id', to);
    serp.searchParams.set('outbound_date', outbound);
    serp.searchParams.set('return_date', ret);
    serp.searchParams.set('type', '1'); // round trip
    serp.searchParams.set('travel_class', travelClass);
    serp.searchParams.set('adults', adults);
    serp.searchParams.set('currency', currency);
    serp.searchParams.set('hl', 'pt');
    serp.searchParams.set('gl', 'pt');

    let serpData;
    try {
      const r = await fetch(serp.toString());
      if (!r.ok) {
        const txt = await r.text();
        return json({ error: `SerpAPI ${r.status}: ${txt.slice(0, 200)}` }, 502, corsHeaders);
      }
      serpData = await r.json();
    } catch (e) {
      return json({ error: `Falha ao chamar SerpAPI: ${e.message}` }, 502, corsHeaders);
    }

    if (serpData.error) {
      return json({ error: `SerpAPI: ${serpData.error}` }, 502, corsHeaders);
    }

    // Pick cheapest flight
    const allFlights = [
      ...(serpData.best_flights || []),
      ...(serpData.other_flights || []),
    ];
    if (allFlights.length === 0) {
      return json({ error: 'Nenhum voo encontrado para esta rota/data' }, 404, corsHeaders);
    }
    const cheapest = allFlights.reduce((a, b) =>
      (a.price ?? Infinity) <= (b.price ?? Infinity) ? a : b
    );

    const firstLeg = cheapest.flights?.[0];
    const legs = cheapest.flights || [];
    // For round-trip, SerpAPI returns the *outbound* legs in the first call.
    // Build a quick airline string (handle codeshare/multi-carrier elegantly).
    const airlines = [...new Set(legs.map(l => l.airline).filter(Boolean))];
    const airlineStr = airlines.length === 1 ? airlines[0] : airlines.join(' + ');

    const out = {
      priceEur: serpData.price_insights?.lowest_price ?? cheapest.price ?? null,
      priceLevel: serpData.price_insights?.price_level || 'unknown',
      typicalRange: serpData.price_insights?.typical_price_range || null,
      airline: airlineStr || null,
      airlineLogo: firstLeg?.airline_logo || cheapest.airline_logo || null,
      flightNumber: firstLeg?.flight_number || null,
      durationMin: cheapest.total_duration || null,
      nonstop: legs.length === 1,
      stops: Math.max(0, legs.length - 1),
      bookingUrl: serpData.search_metadata?.google_flights_url || null,
      fetchedAt: Date.now(),
    };

    const responseBody = JSON.stringify(out);

    // Cache for 30 minutes
    const cacheResponse = new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800',
      },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));

    return new Response(responseBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-cache': 'MISS', ...corsHeaders },
    });
  },
};

function json(obj, status, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
