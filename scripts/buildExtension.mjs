//@ts-check

import { modifyJsonFile } from 'modify-json-file'
import { readPackageJsonFile } from 'typed-jsonfile'

const catchFn = process.env.CI
    ? () => {
          throw new Error('No vscode-latest installed')
      }
    : () => {}

await modifyJsonFile(
    './out/package.json',
    {
        vscodeTypesVersion: (await readPackageJsonFile({ dir: './node_modules/vscode-latest' }).catch(catchFn))?.version,
    },
    { ifPropertyIsMissing: 'add' },
)
