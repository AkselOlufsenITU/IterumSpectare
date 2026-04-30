# IterumSpectare

![IterumSpectare logo](./IterumSpectare_logo.png)

A lightweight TypeScript framework for recording initial state, user input batches, and logs for replayable interactive sessions.

## Installation

```sh
npm install iterumspectare
```

## Usage

```ts
import { StateRecorder, type InitialRequest, type InProgressRequest } from 'iterumspectare';

type GameState = { score: number };
type UserInput = { action: string };

const recorder = new StateRecorder<GameState, UserInput>(
  async (request: InitialRequest<GameState>) => {
    await fetch('/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });

    return request.guid;
  },
  async (request: InProgressRequest<UserInput>) => {
    await fetch('/session/input', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  },
);

await recorder.Initialize({ score: 0 });
recorder.Log('Info', 'Player moved');
await recorder.RecordUserInput({ action: 'move-left' });
await recorder.Flush();
```

## SQLite Adapter

```ts
import { SqliteAdapter } from 'iterumspectare/adapters/sqlite';

const adapter = new SqliteAdapter<GameState, UserInput>('sessions.db');
```

The SQLite adapter uses `better-sqlite3`.
