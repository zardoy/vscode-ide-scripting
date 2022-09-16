'$VSCODE_ALIASES'

// TODO API:
// editor: selections: allow range, pos

/** **Target** editor text */
declare const text: string
/** **Target** editor text split by \r?\n */
declare const lines: [string, ...string[]]
// Target editor, defined only when @editor directive is on top
declare const editor: import('vscode').TextEditor | '$ADD_EDITOR_UNDEFINED'
// don't be too noisy and add undefined only to editor for now
/** Editor, that is being **currently focused**, can be playground editor */
declare const currentEditor: import('vscode').TextEditor
declare const doc: import('vscode').TextDocument | '$ADD_EDITOR_UNDEFINED'
declare const info: (message: any) => void

/**
 * @param replaceRange It is important this range to exist
 */
declare const updateText: (newText: string, replaceRange?: import('vscode').Range) => Promise<void>
/** Create new `vscode.Position` */
declare const pos: (start: number, end: number) => import('vscode').Position
/** Create new `vscode.Range` */
declare const range: (line: import('vscode').Position, character: import('vscode').Position) => import('vscode').Range

/** Execute vscode command. Recommended alias for `vscode.commands.executeCommand` */
declare const command: (commandId: string, ...args: any[]) => Promise<unknown>
declare const trackDisposable: <T extends import('vscode').Disposable>(thing: T, displayName?: string) => T

declare const constants: {
    startPos: import('vscode').Position
}

interface Console {
    /**
     * Reveal outputChannel with logs
     * @param preserveFocus false by default
     * */
    show(preserveFocus?: boolean): void
    /**
     * Hide outputChannel with logs
     * */
    hide(): void
}
