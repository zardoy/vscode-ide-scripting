import * as vscode from 'vscode'
import { SCHEME } from './fileSystem'
import { getExtensionContributionsPrefix } from 'vscode-framework'

export default () => {
    const makeRequest = async (doc: vscode.TextDocument, pos: vscode.Position, req: string) => {
        const { uri } = doc
        const response = await vscode.commands
            .executeCommand('typescript.tsserverRequest', 'completionInfo', {
                _: '%%%',
                file: `^/${uri.scheme}/${uri.authority || 'ts-nul-authority'}/${uri.path.replace(/^\//, '')}`,
                line: pos.line + 1,
                offset: pos.character + 1,
                triggerCharacter: req,
            })
            .then((r: any) => r?.body?.specialResponse)
        return response
    }

    vscode.languages.registerCodeActionsProvider(
        {
            scheme: SCHEME,
        },
        {
            async provideCodeActions(document, range, context, token) {
                const pos = range.start
                const endOffset = document.offsetAt(range.end)
                const response = await makeRequest(
                    document,
                    pos,
                    `scripting-code-actions:${endOffset},${context.diagnostics.map(d => (typeof d.code === 'object' ? d.code.value : d.code)).join(',')}`,
                )
                if (!response) return

                const refactors = response.refactors as import('typescript').ApplicableRefactorInfo[]
                const quickFixes = response.quickFixes as import('typescript').CodeFixAction[]
                return [
                    ...refactors.flatMap(refactor =>
                        refactor.actions.map(
                            action =>
                                ({
                                    __data: {
                                        document,
                                        position: pos,
                                        endOffset,
                                        action: `${refactor.name},${action.name}`,
                                    },
                                    title: action.description,
                                    kind: action.kind ? vscode.CodeActionKind.Empty.append(action.kind) : undefined,
                                    disabled: action.notApplicableReason
                                        ? {
                                              reason: action.notApplicableReason,
                                          }
                                        : undefined,
                                } as vscode.CodeAction),
                        ),
                    ),
                    ...quickFixes.flatMap(quickFix => ({
                        title: quickFix.description,
                        edit: textFileChangesToWorkspaceEdit(document, quickFix.changes),
                    })),
                ]
            },
            async resolveCodeAction(codeAction, token) {
                const { document: doc, position: pos, endOffset, action } = (codeAction as any).__data
                const response: import('typescript').RefactorEditInfo | undefined = await makeRequest(
                    doc,
                    pos,
                    `scripting-resolve-code-actions:${endOffset},${action}`,
                )
                if (!response) return
                codeAction.edit = textFileChangesToWorkspaceEdit(doc, response.edits)
                if (response.renameLocation !== undefined) {
                    codeAction.command = {
                        title: '',
                        command: 'editor.action.rename',
                        arguments: [[vscode.Uri.parse(doc.uri), doc.positionAt(response.renameLocation)]],
                    }
                }
                return codeAction
            },
        },
    )

    // workaround
    vscode.languages.registerRenameProvider(
        { scheme: SCHEME },
        {
            async provideRenameEdits(document, position, newName, token) {
                const highlights: vscode.DocumentHighlight[] | undefined =
                    (await vscode.commands.executeCommand('vscode.executeDocumentHighlights', document.uri, position)) ?? []
                const edit = new vscode.WorkspaceEdit()
                edit.set(
                    document.uri,
                    highlights.map(h => ({
                        newText: newName,
                        range: h.range,
                    })),
                )
                return edit
            },
        },
    )
}

const textFileChangesToWorkspaceEdit = (doc: vscode.TextDocument, changes: import('typescript').FileTextChanges[]) => {
    if (changes.length !== 1) throw new Error('Wrong code action edit')
    const edit = new vscode.WorkspaceEdit()
    const { textChanges } = changes[0]!
    const editor = vscode.window.activeTextEditor
    const spaces = editor?.options.insertSpaces ? (editor?.options.tabSize as number) : undefined
    edit.set(
        doc.uri,
        textChanges.map(change => ({
            newText: spaces !== undefined ? change.newText.replaceAll('\t', ' '.repeat(spaces)) : change.newText,
            range: new vscode.Range(doc.positionAt(change.span.start), doc.positionAt(change.span.start + change.span.length)),
        })),
    )
    return edit
}
