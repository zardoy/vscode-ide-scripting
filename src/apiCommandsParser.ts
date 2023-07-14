import { lowerCaseFirst } from '@zardoy/utils'
import got from 'got'
// import clipboard from 'clipboardy'
import type { ArrayLiteralExpression, CallExpression, Identifier, NewExpression, Node, PropertyAccessExpression } from 'typescript'

export type ArgType = 'uri' | 'pos' | 'range' | 'formattingOptions' | 'triggerCharacter'

const knownApiArgumentTypes = ['Uri', 'Position', 'Range', 'CallHierarchyItem', 'String', 'Number', 'Void', 'TypeHierarchyItem', 'TestItem'] as const

const typeToTypeStringMap: Record<(typeof knownApiArgumentTypes)[number], string> = {
    Uri: 'vscode.Uri',
    Position: 'vscode.Position',
    Range: 'vscode.Range',
    CallHierarchyItem: 'vscode.CallHierarchyItem',
    TypeHierarchyItem: 'vscode.TypeHierarchyItem',
    TestItem: 'vscode.TestItem',
    String: 'string',
    Number: 'number',
    Void: 'void',
}

const specialArgToTypeMap = {
    rangeOrSelection: 'vscode.Range | vscode.Selection',
    options: 'vscode.FormattingOptions',
    ch: 'string',
}

let body: string

let ts: typeof import('typescript')

export const doParse = async (_ts: typeof import('typescript')) => {
    ts = _ts
    body ??= await got('https://raw.githubusercontent.com/zardoy/vscode/main/src/vs/workbench/api/common/extHostApiCommands.ts').then(res => res.body)
    const sourceFile = ts.createSourceFile('fileName.ts', body, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
    // select const with name newCommands
    let newCommands: ArrayLiteralExpression | undefined
    sourceFile.statements.forEach(statement => {
        if (ts.isVariableStatement(statement)) {
            const declaration = statement.declarationList.declarations[0]
            if (!declaration) return
            if (
                ts.isIdentifier(declaration.name) &&
                declaration.name.text === 'newCommands' &&
                declaration.initializer &&
                ts.isArrayLiteralExpression(declaration.initializer)
            ) {
                newCommands = declaration.initializer
            }
        }
    })
    if (!newCommands) throw new Error('newCommands not found')

    type ArgsOutput = {
        name: string
        description: string
        optional: boolean
        typeStringified: string
    }
    const commands: {
        id: string
        description: string
        args: ArgsOutput[]
        output: string
    }[] = []
    newCommands.elements.forEach(element => {
        if (!ts.isNewExpression(element)) return
        if (element.arguments?.length !== 5) return
        const [id, _internalCommandName, description, args, resultType] = element.arguments
        if (!id || !ts.isStringLiteral(id)) return
        if (!description || !ts.isStringLiteral(description)) return
        if (!args || !ts.isArrayLiteralExpression(args)) return
        if (!resultType) return
        const argsOutput = [] as ArgsOutput[]
        const parseTypeDef = (arg: Node, forOutput = false): ArgsOutput | undefined => {
            const chain = ts.isPropertyAccessExpression(arg) || ts.isCallExpression(arg) ? propertyExpressionToNodesArray(ts, arg) : [arg]
            if (ts.isNewExpression(chain[0]!)) {
                const optional = chain.some(x => ts.isCallExpression(x) && x.expression.getText() === 'optional')
                let arg = chain[0] as NewExpression
                // new ApiCommandArgument<types.Position[], IPosition>('name', 'description')
                const name = arg.arguments?.[0]?.getText().slice(1, -1)!
                const description = arg.arguments?.[1]?.getText().slice(1, -1)!
                return {
                    name,
                    description,
                    optional,
                    typeStringified:
                        specialArgToTypeMap[name] ??
                        arg.typeArguments?.[forOutput ? 1 : 0]
                            ?.getText()
                            .replaceAll('types', 'vscode')
                            .replaceAll('URI', 'vscode.Uri')
                            .replaceAll(
                                'typeConverters.TextEditorOpenOptions',
                                'vscode.TextDocumentShowOptions & { background?: boolean, override?: boolean }',
                            ) ??
                        'any',
                }
            } else if (ts.isPropertyAccessExpression(arg) || ts.isCallExpression(arg)) {
                // const chain = propertyExpressionToNodesArray(ts, arg)
                const type = chain[1]?.getText()
                if (!type || !knownApiArgumentTypes.includes(type as any)) {
                    throw new Error(`Unknown type ${type}`)
                }
                const optional = chain.some(x => ts.isCallExpression(x) && x.expression.getText() === 'optional')
                const withData = chain.find(x => ts.isCallExpression(x) && x.expression.getText() === 'with') as CallExpression | undefined
                const name = withData?.arguments?.[0]?.getText().slice(1, -1) ?? lowerCaseFirst(type)
                const description = withData?.arguments?.[1]?.getText().slice(1, -1) ?? ''
                return {
                    name,
                    description,
                    optional,
                    typeStringified: typeToTypeStringMap[type],
                }
            }
            return
        }
        args.elements.forEach(arg => {
            const typeDef = parseTypeDef(arg)
            if (!typeDef) throw new Error('Unknown arg type')
            argsOutput.push(typeDef)
        })
        commands.push({
            id: id.text,
            description: description.text,
            args: argsOutput,
            output: parseTypeDef(resultType, true)?.typeStringified!,
        })
    })

    // const dts = commands
    //     .map(command => {
    //         const paramsDescriptions = command.args
    //             .map(arg => arg.description && `* @param ${arg.name} ${arg.description}`)
    //             .filter(Boolean)
    //             .join('\n')
    //         let string = `/**\n * ${command.description}\n ${paramsDescriptions} */\n`
    //         string += `executeCommand(id: '${command.id}', ${command.args
    //             .map(arg => `${arg.name}${arg.optional ? '?' : ''}: ${arg.typeStringified}`)
    //             .join(', ')}): Promise<${command.output}>`
    //         return string
    //     })
    //     .join('\n')
    // clipboard.writeSync(dts)

    return commands
}

const nodeText = (ts: typeof import('typescript'), node: Node) => {
    const printer = ts.createPrinter()
    return printer.printNode(ts.EmitHint.Unspecified, node, ts.createSourceFile('fileName.ts', '', ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS))
}

const propertyExpressionToNodesArray = (ts: typeof import('typescript'), _source: PropertyAccessExpression | CallExpression) => {
    const nodes = [] as import('typescript').Node[]
    let current = _source as import('typescript').LeftHandSideExpression
    while (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
        if (ts.isCallExpression(current)) {
            const { expression } = current
            const callExpression = ts.factory.createCallExpression(
                ts.isPropertyAccessExpression(expression) ? expression.name : expression,
                current.typeArguments,
                current.arguments,
            )
            callExpression.getText = () => nodeText(ts, callExpression)
            nodes.push(callExpression)
            current = ts.isPropertyAccessExpression(expression) ? expression.expression : expression
        } else {
            nodes.push(current.name)
            current = current.expression
        }
    }
    nodes.push(current)
    return nodes.reverse()
}
