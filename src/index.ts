import 'source-map-support/register.js'
import  { readdir, copyFile } from 'fs/promises'
import { PromisedDatabase } from 'promised-sqlite3'
import path from 'path'

const srcFolder = path.resolve(__dirname, '../samples')
const outFile = path.resolve(__dirname, '../samples/out.sqlite')

const main = async () => {    
    const files = await readdir(srcFolder)
    let dstDb: PromisedDatabase
    let index = 0
    let tables

    try {
        for(const file of files) {
            const fullPath = `${srcFolder}/${file}`
            const dbName = `db${index++}`
        
            console.log(`Processing ${fullPath}`)

            if (!dstDb) {
                await copyFile(fullPath, outFile)
                dstDb = new PromisedDatabase()
                await dstDb.open(outFile)
                tables = await dstDb.all('select name from sqlite_master where type="table"')
                console.log('tables', tables)
                continue
            }

            await dstDb.run(`ATTACH '${fullPath}' AS ${dbName}`)

            for(const table of tables) {
                const tableName = table.name
                console.log(`Processing table ${tableName}`)    
                const copyCmd = `INSERT OR IGNORE INTO ${tableName} SELECT * FROM ${dbName}.${tableName}`
                await dstDb.run(copyCmd)
            }
        }
    }
    finally {
        await dstDb?.close()
    }
    
}

main()
    .then(_ => console.log('DONE'))
    .catch(err => console.error('ERROR', err))