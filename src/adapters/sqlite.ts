import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
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

    private reqIDtoUUID = new Map<string, string> 
    private UUIDtoReqID = new Map<string, string>

    async HandleInitialRequestAsync(req: InitialRequest<GameStateType>): Promise<string> {
        const guid = randomUUID();

        const insertSession = this.db.prepare(
            'INSERT INTO sessions (guid, initial_state) VALUES (?, ?)'
        );

        const tx = this.db.transaction(() => {
            insertSession.run(guid, JSON.stringify(req.initialState));
        });

        tx();

        this.reqIDtoUUID.set(req.requestId, guid);
        this.UUIDtoReqID.set(guid, req.requestId);
        return guid;
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
        let uuid : string; 
        // if this is the first time we see that the client uses our uuid rather than the req id 
        const invalidReqID = this.UUIDtoReqID.get(req.guid);
        if (invalidReqID) {
            this.UUIDtoReqID.delete(req.guid);
            this.reqIDtoUUID.delete(invalidReqID);
            console.log(`Deleting ${invalidReqID}->${req.guid} and using ${req.guid}`)
            uuid = req.guid;
        } 
        else  
        {
            // if this is a req-id and the client hasn't accepted our uuid yet
            const correspondingUUID = this.reqIDtoUUID.get(req.guid)
            if (correspondingUUID) {
                console.log(`Using ${correspondingUUID} from ${req.guid}->${correspondingUUID}`)
                uuid = correspondingUUID;
            } 
            else 
            {
                uuid = req.guid
            }
        }
        console.log(`Using ${uuid}`)
        const tx = this.db.transaction(() => {
            for (let i = 0; i < req.userInputs.length; i++) {
                insertInput.run(uuid, JSON.stringify(req.userInputs[i]), req.tick, JSON.stringify(req.userInputs[i].logEntries));
            }
        });

        tx();
    }
}
