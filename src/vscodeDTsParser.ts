import * as fs from 'fs'

import { lowerCaseFirst } from '@zardoy/utils'
import got from 'got'
import type { ArrayLiteralExpression, CallExpression, Identifier, ModuleDeclaration, NewExpression, Node, PropertyAccessExpression } from 'typescript'

let ts: typeof import('typescript')

export const doParse = async (_ts: typeof import('typescript')) => {
    ts = _ts
    // let file = fs.readFileSync(require('vscode').env.appRoot + 'out/vscode-dts/vscode.d.ts', 'utf8')
    let file = fs.readFileSync(require.resolve('@types/vscode/index.d.ts'), 'utf8')
    const sourceFile = ts.createSourceFile('fileName.ts', file, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
    const vscode = sourceFile.statements.find(statement => ts.isModuleDeclaration(statement)) as ModuleDeclaration

    const toAutoDispose = [] as [ns: string, method: string][]
    for (const statement of (vscode.body as any).statements) {
        let ns = ''
        if (ts.isModuleDeclaration(statement)) {
            ns = statement.name.text
            const statements = (statement.body as any).statements
            if (!statements) continue
            for (const statement of statements) {
                if (ts.isFunctionDeclaration(statement) && statement.type && statement.type.getText() === 'Disposable') {
                    toAutoDispose.push([ns, statement.name!.text])
                }
                if (ts.isVariableStatement(statement)) {
                    const type = statement.declarationList.declarations[0]?.type
                    if (type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === 'Event') {
                        toAutoDispose.push([ns, statement.declarationList.declarations[0]!.name.getText()])
                    }
                }
            }
        }
    }

    console.log(toAutoDispose)
}

doParse(require('typescript'))
