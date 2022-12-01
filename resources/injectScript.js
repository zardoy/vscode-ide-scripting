// @ts-diagnostic-disable 6133
const vscode = require('vscode')
const __util = require('util')

// prettier-ignore
'$VSCODE_ALIASES'

const currentEditor = vscode.window.activeTextEditor
const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === '$TEXT_EDITOR_URI')
const editorPos = editor?.selection.active
const doc = editor?.document
const text = doc?.getText()
const lines = doc?.getText().split(/\r?\n/g)
const console = globalThis.__IDE_SCRIPTING_CONSOLE

module.exports.disposables = []
const trackDisposable = (thing, displayName) => {
    module.exports.disposables.push([thing, displayName])
    return thing
}

const info = (message, utilOptions) => vscode.window.showInformationMessage(__util.inspect(message, utilOptions))

const pos = (...args) => new vscode.Position(...args)
const range = (...args) => new vscode.Range(...args)
const selection = (...args) => (typeof args[0] === 'object' ? new vscode.Selection(args[0].start, args[0].end) : new vscode.Selection(...args))

const updateText = async (newText, replaceRange, _editor = editor) => {
    const { document } = _editor
    if (!replaceRange) {
        replaceRange = new vscode.Range(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end)
    }
    if (document.getText(replaceRange) === newText) return
    await new Promise(resolve => {
        const { document } = _editor
        if (document.getText() === '') {
            resolve()
            return
        }
        const { dispose } = vscode.workspace.onDidChangeTextDocument(({ document }) => {
            if (document.uri !== _editor.document.uri) return
            dispose()
            resolve()
        })
        void _editor.edit(builder => builder.replace(replaceRange, newText))
    })
}

const command = (commandId, ...args) => {
    return vscode.commands.executeCommand(commandId, ...args)
}
