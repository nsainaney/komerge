#!/usr/bin/env node
import 'source-map-support/register.js'
import { readdir, copyFile, unlink, access } from 'fs/promises'
import { PromisedDatabase } from 'promised-sqlite3'
import PrettyError from 'pretty-error'
import arg from 'arg'
import path from 'path'

// const srcFolder = path.resolve(__dirname, '../samples')
// const outFile = path.resolve(__dirname, '../samples/out.sqlite')
// const onlyCopyTables = ['Bookmark', 'content']

const parseArgs = () => {
    try {
        return arg({
            '--src': String,
            '--dst': String,
            '--table': [String],

            // Aliases
            '-s': '--src',
            '-d': '--dst',
            '-t': '--table',
        })
    }
    catch {
        console.log('Options are:\n\n')
        console.log('       --src, -s:        Folder containing source databases')
        console.log('       --dst, -d:        Destination file to merge data into')
        console.log('       --table, -t:      Tables to merge')
        process.exit(0)
    }
}

const renderError = (err: Error) => {
    const pe = new PrettyError()
    console.error(pe.render(err))
}

const exists = async (file: string) => {
    try {
        await access(file)
        return true
    }
    catch { return false }
}

const toAbsolutePath = (unknownPath: string) =>  unknownPath.startsWith('/') ?
    unknownPath :
    path.resolve(process.cwd(), unknownPath)

const generateOutDb = async (fullPath: string, outFile: string) => {
    const outExists = await exists(outFile)
    if (!outExists) {
        console.log(`Copying ${fullPath} to ${outFile}`)
        await copyFile(fullPath, outFile)
    }

    try {
        const dstDb = new PromisedDatabase()
        await dstDb.open(outFile)
        // console.log('tables', tables)
        const tables = await dstDb.all('select name from sqlite_master where type="table"')
        return {
            continue: !outExists,
            tables: tables.map(t => t.name),
            dstDb
        }
    }
    catch(err) {
        // Something went wrong
        if (!outExists) {
            renderError(err)
            await unlink(outFile)
            return { continue: true }
        }
        // Cannot proceed if outFile is a bad sqlite file
        console.error(`${outFile} is not a sqlite database`)
        const fatal = new Error(`${outFile} failed because ${err.message}`)
        return { fatal }
    }
}

const main = async () => {

    const args = parseArgs()
    if (!args['--src']) throw new Error('missing required argument: --src')

    const srcFolder = toAbsolutePath(args['--src'])
    const outFile = toAbsolutePath(args['--dst'] || './out.sqlite')
    const onlyCopyTables = args['--table']

    const files = await readdir(srcFolder)
    let dstDb: PromisedDatabase
    let index = 0
    let fatal
    let success = 0
    let skips = []
    let tables

    try {
        for(const file of files) {
            const fullPath = `${srcFolder}/${file}`
            const dbName = `db${index++}`
            console.log(`Processing ${fullPath}`)
            try {
                if (!dstDb) {
                    const result = await generateOutDb(fullPath, outFile)
                    dstDb = result.dstDb
                    tables = result.tables
                    fatal = result.fatal
                    // console.log('tables', tables)
                    
                    if (fatal) throw fatal
                    if (!dstDb) skips.push(fullPath)
                    if (result.continue) continue
                }
                else if (fullPath === outFile) {
                    // Don't copy self
                    skips.push(fullPath)
                    console.error(`Skipping ${file}`)
                    continue
                }
            
                await dstDb.run(`ATTACH '${fullPath}' AS ${dbName}`)

                for(const table of tables) {
                    if (onlyCopyTables && !onlyCopyTables.includes(table)) {
                        console.log(`Skipping table ${table}`)    
                        continue
                    }
                    console.log(`Processing table ${table}`)    
                    const copyCmd = `INSERT OR IGNORE INTO ${table} SELECT * FROM ${dbName}.${table}`
                    await dstDb.run(copyCmd)
                }

                success++
            }
            catch(err) {
                if (fatal) throw fatal
                skips.push(fullPath)
                console.error(`Skipping ${file} because:`)
                renderError(err)
            }
        }

        // Compact the db
        await dstDb?.run('VACUUM')
    }

    finally {
        await dstDb?.close()
        console.log(`Successfully processed ${success} files`)
        if (skips) {
            console.log(`Skipped ${skips.length} files:`)
            for(const skip of skips)
                console.log(skip)
        }
    }
}

main()
    .then(_ => console.log('DONE'))
    .catch(err => renderError(err))