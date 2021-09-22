'use strict'

/*
 * BP Script Builder
 *
 * A very, very simple utility to concatenate server and client JS.
 * Bedrock does not have any kind of JS module system,
 * so it's necessary to join files beforehand.
 *
 * (C) Copyright Bjornar Egede-Nissen, 2021
 * License: MIT
 * License details: https://choosealicense.com/licenses/mit/
 */

// === Configuration ===

const scripts = '../scripts'
const src = ''
const serverFiles = [ 'header.js', 'config.js', 'server.js', 'shared.js' ]
const clientFiles = [ 'header.js', 'config.js', 'client.js', 'shared.js' ]

// === Run script ===

const path = require( 'path' )
const { readFile, saveFile } = require( './fs-utils' )

const server = compileFile( 'server', 'server.js', serverFiles )
const client = compileFile( 'client', 'client.js', clientFiles )

if ( server && client ) {
    console.log( '\nScripts built successfully.' )
}

function compileFile( targetPath, targetFile, sourceFiles ) {
    targetPath = path.join( scripts, targetPath )
    const fnWithPath = path.join( targetPath, targetFile )
    console.log( `\n[Building ${ fnWithPath }]` )

    const sources = sourceFiles.map( ( file ) => {
        console.log( file )

        const fn = path.resolve( src, file )
        const contents = readFile( fn )

        if ( contents === '' ) {
            console.log( `${ fn } is empty, skipping.` )
            return
        }
        if ( ! contents ) {
            console.error( `Error, cannot find file ${ fn }.` )
            return false
        }
        return contents
    } )

    if ( sources.some( ( x ) => x === false ) ) {
        console.error( `\n\n-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-\nERROR: Failed to build ${ targetFile }\n` )
        return
    }

    // Create server/server.js
    try {
        saveFile( targetPath, targetFile, sources.join( '\n\n' ) )

    }
    catch ( error ) {
        console.error( 'Something went wrong - see other error message(s).' )
        return false
    }

    return fnWithPath
}
