#!/usr/bin/env node
import 'source-map-support/register.js'
import { readdir, copyFile, unlink, access } from 'fs/promises'
import { PromisedDatabase } from 'promised-sqlite3'
import PrettyError from 'pretty-error'
import path from 'path'

const srcFolder = path.resolve(__dirname, '../samples')
const outFile = path.resolve(__dirname, '../samples/out.sqlite')

const renderError = (err) => {
    const pe = new PrettyError()
    console.error(pe.render(err))
}

const exists = async (file) => {
    try {
        await access(file)
        return true
    }
    catch { return false }
}

const generateOutDb = async (fullPath) => {
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
            tables,
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
                    const result = await generateOutDb(fullPath)
                    dstDb = result.dstDb
                    tables = result.tables
                    fatal = result.fatal
                    // console.log('tables', tables)
                    
                    if (fatal) throw fatal
                    if (!dstDb) skips.push(fullPath)
                    if (result.continue) continue
                }
            
                await dstDb.run(`ATTACH '${fullPath}' AS ${dbName}`)

                for(const table of tables) {
                    const tableName = table.name
                    console.log(`Processing table ${tableName}`)    
                    const copyCmd = `INSERT OR IGNORE INTO ${tableName} SELECT * FROM ${dbName}.${tableName}`
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

        await dstDb?.run('VACUUM') // Compact the db
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