/*
 * Name: Engineering Tools
 * Author: Bjornar Egede-Nissen
 * License: GNU General Public License v3.0 (GPL-v3)
 * Full license terms included in license.txt.
 */


// ##### Configurable settings #####

const ADDON_SETTINGS = {
    uiConfig: {
        overlays: { main: 'main.html' },
    },

    toolConfig: {
        'build': {
            fillMode: 'replace',
            // preset: 'cube w:1 h: 1 d: 1',
            size: { width: 2, depth: 2, height: 2 },
            maxSize: 200,
            maxDistance: 5, // Minecraft default is 5
        },
        'destroy': {
            fillMode: 'replace',
            size: { width: 2, depth: 2, height: 2 },
            maxSize: 200,
            maxDistance: 5, // Minecraft default is 5
        },
        'teleport': {
            maxDistance: 50,
        },
    },

    // #todo: implement presets
    fillPresets: {
        'cube w:1 h: 1 d: 1': {
            size: {
                width: 1, // x: lateral/across
                height: 2, // z: perpendicular
                depth: 1, // y: parallel
            },
        },
        wall_3x_3x_1x: {
            size: {
                width: 3, // x: lateral/across
                height: 3, // z: perpendicular
                depth: 1, // y: parallel
            },
        },
        cube_3x_3x_3x: {
            size: {
                width: 3, // x: lateral/across
                height: 3, // z: perpendicular
                depth: 3, // y: parallel
            },
        },
    },

}

// ##### Internal settings #####

const NAMESPACE = 'engtools'

const TOOL_LIST = [ 'build', 'destroy', 'measure', 'query', 'teleport' ]

// ##### Logging/debugging #####

const SIMULATE_COMMANDS = false

const DEBUG_LOG = {
    DISPLAY: true, // print to screen
    WRITE: false, // write to system log
    LEVEL: 1, // log all messages of this level and above
}

// System log settings
const SYSTEM_LOGGER = {
    log_errors: true,
    log_information: true,
    log_warnings: false,
}


const state = {
    targetMonitorActive: null,
}

let uiOverlay

// =============================================
const system = client.registerSystem( 0, 0 )

system.initialize = function() {
    // turn on logging of information, warnings, and errors
    const scriptLoggerConfig = this.createEventData( 'minecraft:script_logger_config' )
    scriptLoggerConfig.data = SYSTEM_LOGGER

    // Send data to server
    this.registerEventData( `${ NAMESPACE }:client_send`, { action: null, data: {} } )
    this.registerEventData( `${ NAMESPACE }:init_player`, { action: 'init_player', player: null } )
    this.registerEventData( `${ NAMESPACE }:send_target_position`, { action: 'send_target_position', position: null } )

    this.listenForEvent( 'minecraft:client_entered_world', ( eventData ) => onClientEnteredWorld( eventData ) )

    // Listen for server communication
    this.listenForEvent( `${ NAMESPACE }:server_send`, ( eventData ) => onReceiveFromServer( eventData ) )
}

function onClientEnteredWorld( eventData ) {
    info( '=== Initializing Engineering Tools (client) ===' )

    // Send player data to server
    const { data } = eventData
    initPlayerData( data.player )
}

function onReceiveFromServer( eventData ) {
    log( '######## receiveFromServer #########', '', 6 )
    const { data } = eventData

    switch ( data.action ) {
        case 'open_tool_settings':
            log( 'open_tool_settings', data, 6 )

            if ( ! uiOverlay ) {
                uiOverlay = loadUiOverlay( 'main', data )
            }

            if ( ! uiOverlay.isOpen() ) {
                uiOverlay.load( data )
            }
            break

        case 'toggle_target_monitor':
            if ( state.targetMonitorActive === null ) {
                initTargetMonitor()
            }
            state.targetMonitorActive = data

    }
}

function initTargetMonitor() {
    system.listenForEvent( 'minecraft:hit_result_continuous', ( _eventData ) => sendTargetPosition( _eventData ) )
}

function sendClientData( action, data = undefined ) {
    log( '######## sendClientData #########', '', 6 )
    const sendData = system.createEventData( `${ NAMESPACE }:client_send` )
    sendData.data = { action, data }
    system.broadcastEvent( `${ NAMESPACE }:client_send`, sendData )
}

function initPlayerData( playerEntity ) {
    log( '######## initPlayerData #########', '', 6 )
    const sendData = system.createEventData( `${ NAMESPACE }:init_player` )
    sendData.data.player = playerEntity
    system.broadcastEvent( `${ NAMESPACE }:init_player`, sendData )
}

function sendTargetPosition( eventData ) {
    const { data } = eventData

    if ( state.targetMonitorActive ) {
        const sendData = system.createEventData( `${ NAMESPACE }:send_target_position` )
        sendData.data.position = data.position || undefined
        system.broadcastEvent( `${ NAMESPACE }:send_target_position`, sendData )
    }
}

function loadUiOverlay( overlay ) {
    let isOpen = false
    let uiData

    const uiFilePath = ADDON_SETTINGS.uiConfig.overlays[ overlay ]

    const ui = system.createEventData( 'minecraft:load_ui' )
    ui.data.path = uiFilePath
    ui.data.options.is_showing_menu = true
    ui.data.options.absorbs_input = true
    ui.data.options.always_accepts_input = true
    // ui.data.options.should_steal_mouse = true
    // ui.data.options.render_game_behind = false
    ui.data.options.force_render_below = true

    system.listenForEvent( 'minecraft:ui_event', ( eventData ) => onReceiveUiData( eventData ) )

    return {
        isOpen() {
            return isOpen
        },

        load( data ) {
            uiData = data
            isOpen = true
            system.broadcastEvent( 'minecraft:load_ui', ui )
        },
    }

    function onReceiveUiData ( eventDataObject ) {
        // Get the data out of the event data object. If there's no data, nothing to do
        log( '=== uiReceive ===', '', 6 )

        let eventData = eventDataObject.data
        debug( eventData, '', 6 )

        if ( ! eventData ) {
            unloadOverlay()
            return
        }

        try {
            eventData = JSON.parse( eventData )
        }
        catch ( error ) {
            // Send input data back
            error( 'Invalid data returned from UI overlay.' )
            error( 'eventData', eventData )
            eventData = {}
        }

        if ( eventData.action === 'ui_loaded' ) {
            onUiLoaded()
            return
        }

        if ( eventData.action !== 'close' ) {
            sendClientData( eventData.action, eventData.data )
        }

        unloadOverlay()
    }

    /**
     * on load event callback
     */
    function onUiLoaded() {
        let sendData = system.createEventData( 'minecraft:send_ui_event' )
        sendData.data.eventIdentifier = 'onLoadCallback'
        sendData.data.data = JSON.stringify( uiData )
        system.broadcastEvent( 'minecraft:send_ui_event', sendData )
    }

    function unloadOverlay() {
        let unloadEventData = system.createEventData( 'minecraft:unload_ui' )
        unloadEventData.data.path = uiFilePath
        system.broadcastEvent( 'minecraft:unload_ui', unloadEventData )
        isOpen = false
    }
}


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
