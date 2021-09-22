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
