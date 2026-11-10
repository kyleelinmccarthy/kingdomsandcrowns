import type { Client, InStatement, Transaction, TransactionMode } from "@libsql/client";

/**
 * Makes a local `file:` libsql database wait for its write lock the way Turso does.
 *
 * On Turso, a write that arrives while another connection's transaction holds the write lock
 * waits for it. The local driver is synchronous, so it cannot wait: a second writer fails at once
 * with SQLITE_BUSY, even when the transaction holding the lock is in this same process and only
 * needs the event loop to finish. Here every write and every transaction takes a turn in one
 * in-process queue instead, so two overlapping requests in `next dev` (or two calls in a test)
 * behave as they would in production. Reads skip the queue, as they do on Turso.
 *
 * A write made with `db` (not `tx`) inside a transaction's callback would wait on that same
 * transaction forever, here and on Turso alike; inside a transaction, write with `tx`.
 */
export function queueLocalWrites(client: Client): Client {
  let tail: Promise<void> = Promise.resolve();

  /** Waits for every earlier turn, then returns the function that ends this one. */
  async function takeTurn(): Promise<() => void> {
    const before = tail;
    let done!: () => void;
    tail = new Promise<void>((resolve) => (done = resolve));
    await before;
    return done;
  }

  async function inTurn<T>(run: () => Promise<T>): Promise<T> {
    const done = await takeTurn();
    try {
      return await run();
    } finally {
      done();
    }
  }

  return new Proxy(client, {
    get(target, prop) {
      if (prop === "execute") {
        return (stmt: InStatement, args?: unknown) =>
          isRead(stmt) ? target.execute(stmt as never, args as never) : inTurn(() => target.execute(stmt as never, args as never));
      }
      if (prop === "batch" || prop === "migrate" || prop === "executeMultiple") {
        const fn = Reflect.get(target, prop, target) as (...a: unknown[]) => Promise<unknown>;
        return (...a: unknown[]) => inTurn(() => fn.apply(target, a));
      }
      if (prop === "transaction") {
        return async (mode?: TransactionMode) => {
          const done = await takeTurn();
          try {
            return endsTurn(await target.transaction(mode), done);
          } catch (err) {
            done();
            throw err;
          }
        };
      }
      return passThrough(target, prop);
    },
  });
}

/** The transaction, ending the turn when it commits, rolls back or closes (whichever is first). */
function endsTurn(tx: Transaction, done: () => void): Transaction {
  let ended = false;
  const end = () => {
    if (!ended) {
      ended = true;
      done();
    }
  };
  return new Proxy(tx, {
    get(target, prop) {
      if (prop === "commit" || prop === "rollback") {
        const fn = Reflect.get(target, prop, target) as () => Promise<void>;
        return async () => {
          try {
            return await fn.call(target);
          } finally {
            end();
          }
        };
      }
      if (prop === "close") {
        const fn = Reflect.get(target, prop, target) as () => void;
        return () => {
          try {
            fn.call(target);
          } finally {
            end();
          }
        };
      }
      return passThrough(target, prop);
    },
  });
}

/** Everything else, bound to the real object: the libsql classes keep their state in private fields. */
function passThrough(target: object, prop: string | symbol): unknown {
  const value = Reflect.get(target, prop, target);
  return typeof value === "function" ? value.bind(target) : value;
}

function isRead(stmt: InStatement): boolean {
  const sql = typeof stmt === "string" ? stmt : stmt.sql;
  return /^\s*(select|pragma)\b/i.test(sql);
}
