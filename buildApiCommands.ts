import * as fs from 'fs'
import { doParse } from './src/apiCommandsParser'

const outFile = 'out/api-commands.json'

if (fs.existsSync(outFile)) {
    console.log('file already downloaded')
    process.exit(0)
}

const { default: ts } = await import('typescript')
fs.writeFileSync(outFile, JSON.stringify(await doParse(ts)), 'utf8')
