import { describe, expect, it } from 'vitest';

/**
 * A deterministic MODEL of the checkout / pricing-change locking protocol of the P3 migration draft (rpc_checkout takes the shared pricing advisory lock, every privileged
 * pricing, status, assignment or rule change takes it exclusively). It enumerates EVERY interleaving of the atomic steps of one checkout and one administrator change and
 * checks that the order snapshot is internally consistent (all lines priced from one version) and equals the state of some serial order. It models the protocol, not
 * PostgreSQL: whether the real database behaves like the model is exactly what the disposable-database concurrency test must show (P10); nothing here ran a database.
 */
type State = { version: number; price: number; floor: number }; // an admin change bumps version and changes the price and the floor together
type Lock = { shared: number; exclusive: boolean };
type Proc = { name: string; steps: ((ctx: Ctx) => 'ok' | 'blocked')[]; pc: number };
type Ctx = { state: State; lock: Lock; snapshot: { price?: number; floor?: number; versions: number[] } };

function checkoutSteps(locked: boolean, singleStatement: boolean): Proc['steps'] {
  const s: Proc['steps'] = [];
  if (locked) s.push((c) => (c.lock.exclusive ? 'blocked' : ((c.lock.shared += 1), 'ok'))); // pg_advisory_xact_lock_shared
  if (singleStatement) {
    s.push((c) => { c.snapshot.price = c.state.price; c.snapshot.floor = c.state.floor; c.snapshot.versions.push(c.state.version, c.state.version); return 'ok'; }); // all lines in ONE statement
  } else {
    s.push((c) => { c.snapshot.price = c.state.price; c.snapshot.versions.push(c.state.version); return 'ok'; }); // price read
    s.push((c) => { c.snapshot.floor = c.state.floor; c.snapshot.versions.push(c.state.version); return 'ok'; }); // floor read in a LATER statement
  }
  s.push((c) => { if (locked) c.lock.shared -= 1; return 'ok'; }); // commit: the transaction lock is released
  return s;
}
const adminSteps = (locked: boolean): Proc['steps'] => [
  ...(locked ? [(c: Ctx) => (c.lock.exclusive || c.lock.shared > 0 ? 'blocked' : ((c.lock.exclusive = true), 'ok')) as 'ok' | 'blocked'] : []),
  (c) => { c.state.version += 1; c.state.price += 500; c.state.floor += 500; return 'ok'; },
  (c) => { if (locked) c.lock.exclusive = false; return 'ok'; },
];

function explore(locked: boolean, singleStatement: boolean) {
  const results: { snapshot: Ctx['snapshot']; final: State }[] = [];
  const run = (ctx: Ctx, procs: Proc[]): void => {
    const live = procs.filter((p) => p.pc < p.steps.length);
    if (live.length === 0) { results.push({ snapshot: JSON.parse(JSON.stringify(ctx.snapshot)), final: { ...ctx.state } }); return; }
    let progressed = false;
    for (const p of live) {
      const c2: Ctx = { state: { ...ctx.state }, lock: { ...ctx.lock }, snapshot: { ...ctx.snapshot, versions: [...ctx.snapshot.versions] } };
      const copy = procs.map((x) => ({ ...x }));
      const self = copy.find((x) => x.name === p.name) as Proc;
      if (self.steps[self.pc]!(c2) === 'blocked') continue;
      self.pc += 1;
      progressed = true;
      run(c2, copy);
    }
    if (!progressed) throw new Error('deadlock in the model');
  };
  run({ state: { version: 0, price: 10000, floor: 1000 }, lock: { shared: 0, exclusive: false }, snapshot: { versions: [] } }, [
    { name: 'checkout', steps: checkoutSteps(locked, singleStatement), pc: 0 },
    { name: 'admin', steps: adminSteps(locked), pc: 0 },
  ]);
  return results;
}
const consistent = (r: { snapshot: Ctx['snapshot'] }) => new Set(r.snapshot.versions).size === 1;
const isSerial = (r: { snapshot: Ctx['snapshot'] }) =>
  (r.snapshot.price === 10000 && r.snapshot.floor === 1000) || (r.snapshot.price === 10500 && r.snapshot.floor === 1500); // before or after the change, never a mix

describe('checkout versus a pricing change: every interleaving', () => {
  it('with the shared/exclusive pricing lock AND a single-statement snapshot (the P3 protocol): every order is priced from one version, the same as a serial execution', () => {
    const rs = explore(true, true);
    expect(rs.length).toBeGreaterThan(1);
    for (const r of rs) { expect(consistent(r)).toBe(true); expect(isSerial(r)).toBe(true); }
    expect(new Set(rs.map((r) => r.snapshot.price)).size).toBe(2); // both serial outcomes occur (the change before or after the checkout); the model is not vacuous
  });
  it('the lock alone also prevents a mixed snapshot even when the prices were read in separate statements (defense in depth)', () => {
    for (const r of explore(true, false)) { expect(consistent(r)).toBe(true); expect(isSerial(r)).toBe(true); }
  });
  it('a single-statement snapshot alone is also consistent (one statement sees one snapshot)', () => {
    for (const r of explore(false, true)) { expect(consistent(r)).toBe(true); expect(isSerial(r)).toBe(true); }
  });
  it('NEGATIVE CONTROL: without the lock and with separate read statements a mixed price/floor snapshot IS reachable (the model can detect the anomaly)', () => {
    const rs = explore(false, false);
    expect(rs.some((r) => !consistent(r) || !isSerial(r))).toBe(true);
  });
  it('the final database state always holds the administrator change (checkout never loses or reorders it)', () => {
    for (const r of explore(true, true)) expect(r.final).toEqual({ version: 1, price: 10500, floor: 1500 });
  });
  it('two checkouts only share the lock: they never block each other', () => {
    const lock: Lock = { shared: 0, exclusive: false };
    const ctx = { state: { version: 0, price: 1, floor: 1 }, lock, snapshot: { versions: [] } } as Ctx;
    const a = checkoutSteps(true, true)[0]!;
    expect(a(ctx)).toBe('ok');
    expect(a(ctx)).toBe('ok');
    expect(lock.shared).toBe(2);
  });
});
