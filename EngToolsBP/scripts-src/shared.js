/* eslint-disable no-unused-vars */
// ##### Logging and utility functions #####

/**
 * Log levels
 * 0: off
 * 1: errors
 * 2: info
 * 3: log
 * 4: debug
 * 5: verbose
 * 6: super verbose
 */

const LOG_PREFIX = 'ET'

function writeToScreen( message ) {
    let eventData = system.createEventData( 'minecraft:display_chat_event' )
    eventData.data.message = message
    system.broadcastEvent( 'minecraft:display_chat_event', eventData )
}

function chat( message ) {
    if ( Object( message ) === message ) {
        message = stringify( message )
    }

    writeToScreen( message )
}

function formatMsg( type, msgStr1, msgStr2 ) {
    let output = `[${ LOG_PREFIX }:${ type.toUpperCase() }] `

    if ( Object( msgStr1 ) === msgStr1 ) {
        msgStr1 = stringify( msgStr1 )
    }

    if ( ! msgStr2 ) {
        return output + msgStr1
    }
    if ( Object( msgStr2 ) === msgStr2 ) {
        output += `${ msgStr1 }\n`
        output += stringify( msgStr2 )
        return output
    }

    return `${ output }${ msgStr1 }: ${ msgStr2 }`
}

function _log_( msgStr1, msgStr2, type, levelOverride ){

    const level = levelOverride !== undefined ? levelOverride : type
    if ( ! level || level > DEBUG_LOG.LEVEL ) {
        return
    }

    const labels = [
        '',
        'error',
        'info',
        'log',
        'debug',
        'verbose-log',
    ]

    const message = formatMsg( labels[ type ], msgStr1, msgStr2 )

    if ( DEBUG_LOG.DISPLAY ) {
        writeToScreen( message )
    }

    if ( DEBUG_LOG.WRITE ) {
        server.log( message )
    }
}

function error( msgStr1, msgStr2 = undefined, levelOverride = undefined ) {
    _log_( msgStr1, msgStr2, 1, levelOverride )
}

function info( msgStr1, msgStr2 = undefined, levelOverride = undefined ) {
    _log_( msgStr1, msgStr2, 2, levelOverride )
}

function log( msgStr1, msgStr2 = undefined, levelOverride = undefined ) {
    _log_( msgStr1, msgStr2, 3, levelOverride )
}

function debug( msgStr1, msgStr2 = undefined, levelOverride = undefined ) {
    _log_( msgStr1, msgStr2, 4, levelOverride )
}

function stringify( object ) {
    return JSON.stringify( object, null, 5 )
}

function __noop(){}

function getToolIdentifier( item ) {
    return `${ NAMESPACE }:${ item }`
}

function getToolName( identifier ) {
    const isTool = identifier.substring( 0, NAMESPACE.length + 1 ) === `${ NAMESPACE }:`

    if ( isTool ) {
        return identifier.substring( NAMESPACE.length + 1 )
    }
}

/**
 * Tick counter - replacement for missing setTimeout
 * Returns timer function - use in system.update() to count ticks
 */
function timeOut( seconds, callback ) {
    const TicksPerSecond = 20 // 1 second = 20 ticks

    let _tickCounter = 0
    let enabled = true
    const maxTicks = TicksPerSecond * seconds

    return () => {
        if ( ! enabled ) {
            return
        }

        _tickCounter++
        if ( ! ( _tickCounter % maxTicks ) ) {
            enabled = false
            callback()
        }
    }
}
