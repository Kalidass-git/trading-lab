// Three-way merge of the portfolio data when the same file was changed on two devices.
// base = copy at the last sync, local = this device now, remote = what is in Drive now.
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const stable = (x) => JSON.stringify(x, (k, v) => (isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((kk) => [kk, v[kk]])) : v));
const same = (a, b) => stable(a) === stable(b);
const keyOf = (it) => (isObj(it) ? (it.id != null ? 'id:' + it.id : it.name != null && it.kind != null ? 'name:' + it.name : it.date != null && Object.keys(it).length < 8 && it.net != null ? 'date:' + it.date : null) : null);
const keyed = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => keyOf(x) != null);

export function merge(base, local, remote) {
  const st = { clashes: 0, fromRemote: 0, fromLocal: 0, renamed: 0 };
  const out = mergeValue(base, local, remote, st);
  return { data: out, ...st };
}

function mergeValue(b, l, r, st) {
  if (same(l, r)) return l;
  if (b !== undefined && same(b, l)) { st.fromRemote++; return r; }
  if (b !== undefined && same(b, r)) { st.fromLocal++; return l; }
  if (isObj(l) && isObj(r)) {
    const bb = isObj(b) ? b : {};
    const out = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      if (k === 'updatedAt') { out[k] = [l[k], r[k]].filter(Boolean).sort().pop(); continue; }
      const inL = k in l, inR = k in r, inB = k in bb;
      if (inL && inR) out[k] = mergeValue(inB ? bb[k] : undefined, l[k], r[k], st);
      else if (inL) { if (inB && same(bb[k], l[k])) { st.fromRemote++; /* removed remotely */ } else { out[k] = l[k]; if (inB) st.clashes++; } }
      else if (inB && same(bb[k], r[k])) { st.fromLocal++; /* removed locally */ } else { out[k] = r[k]; if (inB) st.clashes++; }
    }
    return out;
  }
  if (keyed(l) && keyed(r) && (b === undefined || Array.isArray(b))) return mergeList(Array.isArray(b) ? b : [], l, r, st);
  if (Array.isArray(l) && Array.isArray(r) && l.length === 0) { st.fromRemote++; return r; }
  if (Array.isArray(l) && Array.isArray(r) && r.length === 0) { st.fromLocal++; return l; }
  st.clashes++; return l; // edited in both places in a way we cannot combine: keep this device's version
}

function mergeList(b, l, r, st) {
  const mapOf = (a) => new Map(a.map((x) => [keyOf(x), x]));
  const B = mapOf(b), L = mapOf(l), R = mapOf(r);
  const order = [...r.map(keyOf), ...l.map(keyOf).filter((k) => !R.has(k))];
  const out = [];
  const taken = new Set(order);
  const spare = [];
  for (const k of order) {
    const inB = B.has(k), inL = L.has(k), inR = R.has(k);
    if (inL && inR) {
      if (!inB && !same(L.get(k), R.get(k))) { // the same new id was used on both devices for different things
        out.push(R.get(k)); spare.push(L.get(k)); st.renamed++; continue;
      }
      out.push(mergeValue(B.get(k), L.get(k), R.get(k), st));
    } else if (inL) {
      if (inB && same(B.get(k), L.get(k))) st.fromRemote++; // deleted remotely, untouched here
      else { out.push(L.get(k)); if (inB) st.clashes++; else st.fromLocal++; }
    } else if (inR) {
      if (inB && same(B.get(k), R.get(k))) st.fromLocal++; // deleted here, untouched remotely
      else { out.push(R.get(k)); if (inB) st.clashes++; else st.fromRemote++; }
    }
  }
  // give clashing new local items a fresh id so both survive
  const nums = out.concat(spare).map((x) => Number(x.id)).filter((n) => Number.isFinite(n));
  let next = nums.length ? Math.max(...nums) + 1 : 1, n = 1;
  const strIds = new Set(out.concat(spare).map((x) => String(x.id)));
  for (const it of spare) {
    let id;
    if (typeof it.id === 'number') id = next++;
    else { do { id = it.id + '_m' + n++; } while (strIds.has(id)); strIds.add(id); }
    out.push({ ...it, id });
  }
  return out;
}
