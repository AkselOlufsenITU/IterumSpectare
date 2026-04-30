// Checks if state is legal
export interface IsStateLegal<GameStateType, UserInputType>  {
    (state: GameStateType, input: UserInputType) : boolean
}

// sets next state of the game given user input
export interface GetNextState<GameStateType, UserInputType, EndGameStateType> {
    (state: GameStateType, input: UserInputType) : GameStateType| EndGameStateType
}

// Log levels
export type LogLevelEnum = "Debug" | "Info" | "Warn" | "Error" | "Fatal";

// sets the log level.
export function LogLevel(level: LogLevelEnum) : void {}