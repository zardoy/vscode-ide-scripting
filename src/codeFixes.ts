import { CodeAction, CodeActionKind, Diagnostic, languages, Task, window } from 'vscode'
import { getExtensionCommandId, registerExtensionCommand } from 'vscode-framework'
import { SCHEME } from './fileSystem'
import { getActiveRegularEditor } from '@zardoy/vscode-utils'
import { detectedPackageManager } from './tsPluginIntegration'
import { compact } from '@zardoy/utils'

export default () => {
    languages.registerCodeActionsProvider(
        { scheme: SCHEME },
        {
            provideCodeActions(_document, _range, context, _token) {
                const problem = context.diagnostics[0]
                if (!problem) return
                const moduleName = getMissingModuleFromDiagnostic(problem)
                if (!moduleName) return
                const codeAction = new CodeAction(`Run ${detectedPackageManager} i -g ${moduleName}`, CodeActionKind.QuickFix)
                codeAction.isPreferred = true
                codeAction.diagnostics = [problem]
                codeAction.command = {
                    command: getExtensionCommandId('installMissingPackages'),
                    arguments: [[moduleName]],
                    title: '',
                }
                const codeActionAll = new CodeAction(`Install all missing packages with ${detectedPackageManager}`, CodeActionKind.QuickFix)
                codeActionAll.isPreferred = false
                codeActionAll.diagnostics = [problem]
                codeActionAll.command = {
                    command: getExtensionCommandId('installMissingPackages'),
                    arguments: [],
                    title: '',
                }
                return [codeAction, codeActionAll]
            },
        },
    )

    registerExtensionCommand('installMissingPackages', (_, packages?: string[]) => {
        // dont support for now
        const { document } = getActiveRegularEditor() ?? {}
        if (document?.uri.scheme !== SCHEME) return
        if (!packages) {
            const diagnostics = languages.getDiagnostics(document.uri)
            packages = compact(diagnostics.map(getMissingModuleFromDiagnostic))
        }
        if (!packages.length) return
        const terminal = window.createTerminal('packages install')
        terminal.show()
        terminal.sendText(`${detectedPackageManager} i -g ${packages.join(' ')}`, true)
    })
}

const getMissingModuleFromDiagnostic = (problem: Diagnostic | undefined) => {
    const hasMissingImport = problem && problem.source === 'ts' && problem.code === 2307
    if (!hasMissingImport) return
    const { document } = getActiveRegularEditor()!
    const { range } = problem
    const pos = range.start
    const lineText = document.lineAt(pos.line).text
    const regexs = [/(import .*)(['"].*['"])/, /(} from )(['"].*['"])/]
    let moduleNameIndex: number | undefined
    for (const regex of regexs) {
        const result = regex.exec(lineText)
        if (!result) continue
        moduleNameIndex = result[1]!.length
        return getModuleName(result[2]!.slice(1, -1))
    }

    return
}

const getModuleName = (importPath: string) => /^(@[a-z\d-~][a-z\d-._~]*\/)?[a-z\d-~][a-z\d-._~]*/.exec(importPath)?.[0]
