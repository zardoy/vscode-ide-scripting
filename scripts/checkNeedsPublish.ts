import { readPackageJsonFile } from 'typed-jsonfile'
import https from 'https'
import fs, { existsSync } from 'fs'
import AdmZip from 'adm-zip'
import semver from 'semver'

const { publisher, name } = (await readPackageJsonFile({ dir: '.' })) as any

// const latestVsixUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${name}/latest/vspackage`
const latestVsixUrl = `https://${publisher}.gallery.vsassets.io/_apis/public/gallery/publisher/${publisher}/extension/${name}/latest/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`

const tempVsix = './_temp.vsix'
if (!existsSync(tempVsix)) {
    const file = fs.createWriteStream(tempVsix)
    await new Promise<void>(resolve => {
        https.get(latestVsixUrl, res => {
            res.pipe(file)

            file.on('finish', () => {
                file.close(() => resolve())
            })
        })
    })
}
const zip = new AdmZip(tempVsix)

const { version } = await readPackageJsonFile({ dir: './node_modules/vscode-latest' })
const { vscodeTypesVersion } = JSON.parse(zip.readAsText('extension/package.json'))

fs.unlinkSync(tempVsix)

console.log(`::set-output name=shouldContinue::${semver.gt(version!, vscodeTypesVersion)}`)
