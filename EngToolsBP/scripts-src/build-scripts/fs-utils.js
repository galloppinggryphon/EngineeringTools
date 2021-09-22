const { readFileSync, writeFileSync } = require( 'fs' )
const { mkdir } = require( 'fs' ).promises
const path = require( 'path' )

function readFile( filename, onError = 'skip' ) {
    let file
    try {
        file = readFileSync( filename, 'utf8' )
    }
    catch ( err ) {
        switch ( onError ) {
            case 'error': console.error( err ); return false
            case 'warn': console.warn( err ); return false
            case 'skip': return false
        }

        throw err
    }
    return file
}

async function saveFile( filePath, fileName, data ) {
    await mkdir( filePath, { recursive: true } )
    const fullFilename = path.join( filePath, fileName )

    // write file asynchronously
    writeFileSync( fullFilename, data, function ( err ) {
        if ( err ) {
            throw new Error( err )
        }
    } )
}

exports.readFile = readFile
exports.saveFile = saveFile
