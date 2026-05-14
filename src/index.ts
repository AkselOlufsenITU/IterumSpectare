import { LogLevelEnum } from './state.js'

export * from './state.js'

export type InitialRequest<GameStateType> = {
    requestId: string,
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

  RecordUserInput(input : UserInputType) : void {
    this.buf.push({userInput: input, logEntries: this.logBuf});
    this.logBuf = [];
    if (this.buf.length >= this.bufSize) {
        this.Flush_it();
    }
  }

  IsInitialized() : boolean {
    return this.initial != undefined;
  }

  async Reset() : Promise<void> {
    // Reset needs flush to complete before it does anything 
    await this.Flush();
    this.initial = undefined;
    this.guid = undefined;
    this.startedRemoteSession = false;
    this.tick = 0;
  }

  Initialize(initialState: GameStateType) : void {
    console.log("initialize")
    this.initial = initialState;
    this.buf = [];
    this.guid =  crypto.randomUUID();
    this.startedRemoteSession = false;
    this.Flush_it();
    console.log("requestId: ", this.guid)
  }

  async Flush() : Promise<void> {
    if (this.buf.length < 1) return
    await this.Flush_it();
  }

  /* 
    When called synchronously, will execute up untill any async calls in sendInitialRequest/sendInProgressRequest, 
    meaning the current state of the caller is bound in the request. 

    However we need to make sure we reset bufs / set startedRemoteSession flags before this point 
    
  */
  private async Flush_it() : Promise<void> {
    this.tick++;
    if (this.startedRemoteSession && this.guid) {
        const request = {
          guid: this.guid,
          tick: this.tick - 1,
          userInputs: this.buf
        }
        this.buf = [];
        await this.sendInProgressRequest(request);
    } else if(this.initial && this.guid) {
        this.startedRemoteSession = true;
        const serverUUID = await this.sendInitialRequest({
            initialState: this.initial,
            tick: this.tick - 1,
            requestId: this.guid
        });
        this.guid = serverUUID;
    } else {
        throw new Error(`Tried to flush without requestId:${this.guid} or initial state ${this.initial}!`);
    }
  }
}

/* 
    Implement this interface for whatever database providers you want to maintain compatibility with 
    Call into these methods at the end of whatever request pipeline you have 
*/
export interface ServerAdapter<GameStateType, UserInputType> {
    HandleInitialRequestAsync(req: InitialRequest<GameStateType>) : Promise<string>
    HandleInProgressRequestAsync(req: InProgressRequest<UserInputType>) : Promise<void>
    GetStoredGame(guid: string) : Promise<{initial: GameStateType, inputs: UserInputType[]}>
}