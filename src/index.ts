import { LogLevelEnum } from './state.js'

export * from './state.js'

export type InitialRequest<GameStateType> = {
    guid: string,
    tick: number,
    initialState: GameStateType
}

export type LogEntry = {
    level: LogLevelEnum,
    message: string,
    timestamp: string
}

export type UserInputBatch<UserInputType> = {
    userInput: UserInputType,
    logEntries: LogEntry[]
}

export type InProgressRequest<UserInputType> = {
    guid: string,
    tick: number, 
    userInputs: UserInputBatch<UserInputType>[]
}

export class StateRecorder<GameStateType, UserInputType> {
  private buf: UserInputBatch<UserInputType>[] = [];
  private logBuf: LogEntry[] = [];
  private initial: GameStateType | undefined = undefined;
  private guid: string | undefined = undefined;
  private startedRemoteSession: boolean = false; 
  private tick: number = 0; 
  private bufSize: number = 256;
  // Client is free to add any headers/auth logic/other tracking to the requests as needed 
  private sendInitialRequest: (req: InitialRequest<GameStateType>) => Promise<string>;
  private sendInProgressRequest: (req: InProgressRequest<UserInputType>) => Promise<void>;
  
  constructor (
    sendInitialRequest: (req: InitialRequest<GameStateType>) => Promise<string>,
    sendInProgressRequest: (req: InProgressRequest<UserInputType>) => Promise<void>,
    bufSize : number | undefined = undefined
  ) {
    if (bufSize) {
        this.bufSize = bufSize;
    }
    this.sendInitialRequest = sendInitialRequest;
    this.sendInProgressRequest = sendInProgressRequest;
  }

  Log(level: LogLevelEnum, message: string) {
    this.logBuf.push({
      level: level, 
      message: message, 
      timestamp: new Date().toUTCString()
    });
  }

  async RecordUserInput(input : UserInputType) : Promise<void> {
    this.buf.push({userInput: input, logEntries: this.logBuf});
    this.logBuf = [];
    if (this.buf.length >= this.bufSize) {
        await this.Flush_it();
    }
  }

  IsInitialized() : boolean {
    return this.initial != undefined;
  }

  Reset() : void {
    this.Flush();
    this.initial = undefined;
    this.buf = []
    this.guid = undefined;
    this.startedRemoteSession = false;
    this.tick = 0; 
  }

  async Initialize(initialState: GameStateType) : Promise<string> {
    console.log("initialize")
    await this.Flush();
    this.initial = initialState; 
    this.buf = []; 
    this.guid = crypto.randomUUID();
    this.startedRemoteSession = false; 
    console.log("guid: ", this.guid)
    return this.guid; 
  }

  async Flush() : Promise<void> {
    if (this.buf.length < 1) return
    await this.Flush_it();
  }

  private async Flush_it() : Promise<void> {
    if (this.startedRemoteSession && this.guid) {
        await this.sendInProgressRequest({
          guid: this.guid, 
          tick: this.tick, 
          userInputs: this.buf
        });
        this.buf = []; 
    } else if(this.initial && this.guid) {
        const resp = await this.sendInitialRequest({
            initialState: this.initial,
            tick: this.tick,
            guid: this.guid
        });
        this.startedRemoteSession = true; 
    } else {
        throw new Error(`Tried to flush without GUID:${this.guid} or initial state ${this.initial}!`);
    }
    this.tick++; 
  }
}

/* 
    Implement this interface for whatever database providers you want to maintain compatibility with 
    Call into these methods at the end of whatever request pipeline you have 
*/
export interface ServerAdapter<GameStateType, UserInputType> {
    HandleInitialRequestAsync(req: InitialRequest<GameStateType>) : Promise<void>
    HandleInProgressRequestAsync(req: InProgressRequest<UserInputType>) : Promise<void>
    GetStoredGame(guid: string) : Promise<{initial: GameStateType, inputs: UserInputType[]}>
}
