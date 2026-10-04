/*
 * KRUZBERG Booking Radar — pont vers le CRM.
 * La page du radar a été écrite pour claude.ai (window.claude.use("db") et
 * use("mcp")). Ce script fournit les mêmes interfaces, branchées sur l'API du
 * CRM (session de l'utilisateur) : stockage /api/radar/docs, « + Pipeline »
 * /api/radar/crm. Les écoutes onSnapshot sont rafraîchies après chaque
 * écriture, au retour sur l'onglet et toutes les 30 s (veille, autre appareil).
 */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var theme = params.get('theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);

  // Links to the CRM open in the main window, not inside the frame.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    try {
      var u = new URL(a.href, location.href);
      if (u.origin === location.origin && !u.pathname.startsWith('/radar-app/')) {
        e.preventDefault();
        (window.top || window).location.href = u.pathname + u.search;
      }
    } catch (_) {}
  });

  function apiError(res, body) {
    var err = new Error((body && (body.message || body.error)) || 'Erreur ' + res.status);
    err.code = res.status === 401 ? 'needs_reauth' : res.status === 403 ? 'permission_denied' : (body && body.code) || 'upstream_error';
    return err;
  }
  async function call(method, url, body) {
    var res = await fetch(url, {
      method: method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    if (res.redirected && /\/login/.test(res.url)) {
      var e = new Error('Session expirée : reconnecte-toi au CRM.');
      e.code = 'needs_reauth';
      throw e;
    }
    var json = null;
    try { json = await res.json(); } catch (_) {}
    if (!res.ok || json === null) throw apiError(res, json);
    return json;
  }

  // ---------- Firestore-like document store ----------
  var cache = {}; // collection -> [{id, data}]
  var listeners = []; // {collection, docId?, query, cb, err}

  async function load(collection) {
    var r = await call('GET', '/api/radar/docs?collection=' + encodeURIComponent(collection));
    cache[collection] = r.docs.map(function (d) { return { id: d.id, data: d.data || {} }; });
    return cache[collection];
  }
  function snapshotFor(l) {
    var docs = cache[l.collection] || [];
    if (l.docId) {
      var d = docs.find(function (x) { return x.id === l.docId; });
      return { exists: !!d, id: l.docId, data: function () { return d ? d.data : undefined; } };
    }
    var list = docs.slice();
    (l.query.where || []).forEach(function (w) {
      list = list.filter(function (d) {
        var v = d.data[w[0]];
        return w[1] === '==' ? v === w[2] : w[1] === '!=' ? v !== w[2] : true;
      });
    });
    if (l.query.orderBy) {
      var f = l.query.orderBy[0], dir = l.query.orderBy[1] === 'desc' ? -1 : 1;
      list.sort(function (a, b) { return String(a.data[f] ?? '').localeCompare(String(b.data[f] ?? '')) * dir; });
    }
    if (l.query.limit) list = list.slice(0, l.query.limit);
    return { docs: list.map(function (d) { return { id: d.id, data: function () { return d.data; } }; }) };
  }
  var refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    var cols = Array.from(new Set(listeners.map(function (l) { return l.collection; })));
    refreshing = Promise.all(cols.map(function (c) {
      return load(c).catch(function (e) {
        listeners.filter(function (l) { return l.collection === c; }).forEach(function (l) { l.err && l.err(e); });
      });
    })).then(function () {
      listeners.forEach(function (l) { try { l.cb(snapshotFor(l)); } catch (e) { console.error(e); } });
    }).finally(function () { refreshing = null; });
    return refreshing;
  }
  function listen(l) {
    listeners.push(l);
    (cache[l.collection] ? Promise.resolve() : load(l.collection))
      .then(function () { l.cb(snapshotFor(l)); })
      .catch(function (e) { l.err && l.err(e); });
    return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
  }
  async function write(op, collection, id, data) {
    var r = await call('POST', '/api/radar/docs', { op: op, collection: collection, id: id, data: data });
    refresh();
    return r;
  }

  function query(collection, q) {
    return {
      where: function (f, op, v) { return query(collection, Object.assign({}, q, { where: (q.where || []).concat([[f, op, v]]) })); },
      orderBy: function (f, dir) { return query(collection, Object.assign({}, q, { orderBy: [f, dir || 'asc'] })); },
      limit: function (n) { return query(collection, Object.assign({}, q, { limit: n })); },
      onSnapshot: function (cb, err) { return listen({ collection: collection, query: q, cb: cb, err: err }); },
      add: function (data) { return write('add', collection, null, data).then(function (r) { return { id: r.id }; }); },
    };
  }
  var db = {
    collection: function (name) { return query(name, {}); },
    doc: function (path) {
      var parts = String(path).split('/');
      var collection = parts[0], id = parts[1];
      return {
        onSnapshot: function (cb, err) { return listen({ collection: collection, docId: id, query: {}, cb: cb, err: err }); },
        update: function (data) { return write('update', collection, id, data); },
        set: function (data) { return write('set', collection, id, data); },
      };
    },
  };

  // ---------- "+ Pipeline" / statut → CRM ----------
  var mcp = {
    callTool: async function (_server, tool, args) {
      var payload = await call('POST', '/api/radar/crm', { tool: tool, args: args });
      return { payload: payload };
    },
  };

  window.claude = {
    use: function (cap) {
      if (cap === 'db') return Promise.resolve(db);
      if (cap === 'mcp') return Promise.resolve(mcp);
      return Promise.resolve(null);
    },
  };

  setInterval(function () { if (!document.hidden) refresh(); }, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
})();
