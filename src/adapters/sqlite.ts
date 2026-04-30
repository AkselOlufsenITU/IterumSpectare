import Database from 'better-sqlite3';
import type { ServerAdapter, InitialRequest, InProgressRequest } from '../index.js';

export class SqliteAdapter<GameStateType, UserInputType> implements ServerAdapter<GameStateType, UserInputType> {
    private db: Database.Database;

    constructor(dbPath: string) {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                guid TEXT PRIMARY KEY,
                initial_state TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS user_inputs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,   
                session_guid TEXT NOT NULL,
                input TEXT NOT NULL,
                batch_index INTEGER NOT NULL,
                logs TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (session_guid) REFERENCES sessions(guid)
            );
        `);
    }

    async GetStoredGame(guid: string): Promise<{ initial: GameStateType; inputs: UserInputType[]; }> {
        const session = this.db.prepare(
            'SELECT initial_state FROM sessions WHERE guid = ?'
        ).get(guid) as { initial_state: string } | undefined;

        if (!session) {
            throw new Error(`Session not found: ${guid}`);
        }

        const rows = this.db.prepare(
            'SELECT input FROM user_inputs WHERE session_guid = ? ORDER BY batch_index'
        ).all(guid) as { input: string }[];

        return {
            initial: JSON.parse(session.initial_state) as GameStateType,
            inputs: rows.map(r => JSON.parse(r.input) as UserInputType),
        };
    }

    async HandleInitialRequestAsync(req: InitialRequest<GameStateType>): Promise<void> {

        const insertSession = this.db.prepare(
            'INSERT INTO sessions (guid, initial_state) VALUES (?, ?)'
        );

        const tx = this.db.transaction(() => {
            insertSession.run(req.guid, JSON.stringify(req.initialState));
        });

        tx();
    }

    GetSessions(): { guid: string; created_at: string }[] {
        return this.db.prepare(
            'SELECT guid, created_at FROM sessions ORDER BY created_at DESC'
        ).all() as { guid: string; created_at: string }[];
    }

    async HandleInProgressRequestAsync(req: InProgressRequest<UserInputType>): Promise<void> {
        const insertInput = this.db.prepare(
            'INSERT INTO user_inputs (session_guid, input, batch_index, logs) VALUES (?, ?, ?, ?)'
        );

        const tx = this.db.transaction(() => {
            for (let i = 0; i < req.userInputs.length; i++) {
                insertInput.run(req.guid, JSON.stringify(req.userInputs[i]), req.tick, JSON.stringify(req.userInputs[i].logEntries));
            }
        });

        tx();
    }
}
