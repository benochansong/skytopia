import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Result } from '../src/game/online/protocol';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export class Database {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version;
    if (version > 1) throw Error('Unsupported multiplayer database version');
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, players TEXT NOT NULL, result TEXT NOT NULL, running INTEGER NOT NULL);
      PRAGMA user_version=1;`);
    // A process failure cannot manufacture wins, losses or rated results.
    for (const row of this.db.prepare('SELECT id,result FROM matches WHERE running=1').all()) {
      const result = JSON.parse(String(row.result)) as Result;
      this.finish({
        ...result,
        at: new Date().toISOString(),
        reason: 'serverRestart',
        winner: null,
      });
    }
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  }
  authenticate(token: string | undefined, name: string) {
    if (token) {
      const row = this.db
        .prepare('SELECT id,name FROM sessions WHERE token_hash=? AND expires>?')
        .get(hash(token), Date.now());
      if (!row) return null;
      return { id: String(row.id), name: String(row.name), token };
    }
    token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO sessions VALUES (?,?,?,?)')
      .run(id, hash(token), name, Date.now() + 30 * 86400000);
    return { id, name, token };
  }
  begin(result: Result) {
    this.db
      .prepare('INSERT INTO matches VALUES (?,?,?,1)')
      .run(result.id, JSON.stringify(result.players.map((p) => p.id)), JSON.stringify(result));
  }
  finish(result: Result) {
    this.db
      .prepare('UPDATE matches SET result=?,running=0 WHERE id=? AND running=1')
      .run(JSON.stringify(result), result.id);
  }
  history(id: string): Result[] {
    return this.db
      .prepare(
        'SELECT result FROM matches WHERE running=0 AND EXISTS (SELECT 1 FROM json_each(matches.players) WHERE value=?) ORDER BY rowid DESC LIMIT 20',
      )
      .all(id)
      .map((row) => JSON.parse(String(row.result)) as Result);
  }
  close() {
    this.db.close();
  }
}
