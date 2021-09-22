// ##### System #####

// Objects from factories
let player
let displayMsg
const build = Build()

// Create server object
const system = server.registerSystem( 0, 0 )

system.initialize = function() {
    const scriptLoggerConfig = system.createEventData( 'minecraft:script_logger_config' )
    scriptLoggerConfig.data = SYSTEM_LOGGER
    system.broadcastEvent( 'minecraft:script_logger_config', scriptLoggerConfig )

    // === Client communication ===
    // Send data to client
    this.registerEventData( `${ NAMESPACE }:server_send`, { action: undefined, data: {} } )

    // Listen for data from client
    this.listenForEvent( `${ NAMESPACE }:client_send`, ( eventData ) => this.onReceiveDataFromClient( eventData ) )
    this.listenForEvent( `${ NAMESPACE }:init_player`, ( eventData ) => this.onPlayerInit( eventData ) )
    this.listenForEvent( `${ NAMESPACE }:send_target_position`, ( eventData ) => this.onReceiveTargetPositionFromClient( eventData ) )

    // this.listenForEvent( "minecraft:block_interacted_with", ( eventData ) => system.onBlockInteract( eventData ) )
}

system.sendToClient = function( action, data = undefined ) {
    log( 'sendToClient', '', 6 )
    const saveData = this.createEventData( `${ NAMESPACE }:server_send` )
    saveData.data = { action, data }

    debug( saveData, '', 6 )

    this.broadcastEvent( `${ NAMESPACE }:server_send`, saveData )
}

/**
 * Returns eventData = {
 *      data {
 *          statusMessage: string,
 *          statusCode: 0 on success, other values on error
 *      }
 * }
 */
system.commandExecute = function ( { command, argString, callback, successMsg, feedback = true, simulate = false } ) {
    const commandString = `/${ command } ${ argString }`

    if ( simulate || SIMULATE_COMMANDS ) {
        info( 'system.executeCommand', commandString )
        displayMsg( `Simulated command: ${ commandString }` )
    }
    else {
        let _callback = __noop

        if ( callback !== false ){
            _callback = ( results ) => {
                const { statusCode, statusMessage } = results.data
                const code = parseInt( statusCode )
                const status = code ? 'error' : 'success'

                info( 'Executed command', results.command )
                debug( 'Results', `Status: ${ status }; statusCode: ${ statusCode };  Message: [ ${ statusMessage } ]`, 6 )
                debug( { executionData: results.data }, '', 6 )

                if ( feedback ) {
                    let errMsg = '--- Execution Error --- \n\n'

                    // Errors and warnings (0 == success)
                    if ( code < 0 ) {
                        if ( command === 'fill' ) {
                            const fillCount = parseInt( results.data.fillCount )

                            if ( fillCount === 0 ) {
                                errMsg = 'No blocks were filled.'
                            }
                            else {
                                error( statusMessage )
                                errMsg += statusMessage
                            }
                        }
                        else {
                            error( statusMessage )
                            errMsg += statusMessage
                        }
                        displayMsg( errMsg )
                    }
                    // Custom success message
                    else if ( successMsg ) {
                        displayMsg( successMsg )
                    }
                    // Generic success message
                    else {
                        displayMsg( statusMessage )
                    }
                }

                if ( typeof callback === 'function' ) {
                    callback( results )
                }
            }
        }

        this.executeCommand( commandString, _callback )
    }
}

system.getEntityPosition = function( entity ) {
    const pos = this.getComponent( entity, 'minecraft:position' )
    return new Position( pos && pos.data, true )
}

system.getEntityName = function( entity ) {
    const nameable = this.getComponent( entity, 'minecraft:nameable' )
    const { name } = nameable && nameable.data
    return name
}

/**
 * Get block at given position.
 * Returns Block object.
 */
system.getBlockFromCoordinates = function ( coordinates ) {
    log( 'getBlockFromCoordinates: ', new Position( coordinates ).toString() )

    // Grab the player ticking area, use it to get the block
    const tickingArea = this.getComponent( player.entity(), 'minecraft:tick_world' )
    const rawBlock = this.getBlock( tickingArea.data.ticking_area, coordinates )
    return rawBlock
}

// ##### Event functions #####

system.onReceiveTargetPositionFromClient = function( eventData ) {
    const { position } = eventData.data
    player.setLookingAtPosition( position )

    // if ( player.displayLookingAtPosition ) {
    //     displayMsg( `X:${ player.lookingAtPosition.x } Y:${ player.lookingAtPosition.y } Z:${ player.lookingAtPosition.z }` )
    // }

}

system.onPlayerInit = function( eventData ) {
    const { data } = eventData
    info( '=== Initializing Engineering Tools (server) ===' )

    const name = system.getEntityName( data.player )
    displayMsg = DisplayInfo( name )
    player = Player( data.player, name )

    displayMsg( 'Engineering Tools loaded', 10 )
}

system.onReceiveDataFromClient = function( eventData ) {

    log( '=== onReceiveDataFromClient ===', '', 6 )
    debug( 'eventData', eventData, 6 )

    const { data, action } = eventData.data

    switch ( action ) {
        case 'update_tool_settings':
            info( 'Received UI data: update_tool_settings' )

            const { toolConfig } = data
            if ( ! toolConfig || isEmpty( toolConfig ) ) {
                displayMsg( 'No settings were changed.' )
                info( 'UI: No settings have been changed.' )
                return
            }

            const { size, targetBlock, buildDirections } = toolConfig
            const config = {}

            if ( size ) {
                const _size = advParseInt( size )
                if ( ! isEmpty( _size ) ) {
                    config.size = _size
                }
            }
            if ( targetBlock ) {
                config.targetBlock = targetBlock
            }
            if ( buildDirections ) {
                config.buildDirections = buildDirections
            }

            info( 'UI data', { config } )

            if ( isEmpty( config ) ) {
                info( 'No settings were updated.' )
                return
            }

            player.currentTool().configure( config )
            displayMsg( 'Settings saved.' )

            break
    }
}

// ##### Factories/classes #####

/**
 * Player Factory
 */
function Player( playerEntity, name ) {

    // === Event listeners ===
    system.listenForEvent( 'minecraft:player_placed_block', ( eventData ) => onPlayerPlacedBlock( eventData ) )
    system.listenForEvent( 'minecraft:entity_carried_item_changed', ( eventData ) => onCarriedItemChange( eventData ) )
    system.listenForEvent( 'minecraft:entity_sneak', ( eventData ) => onSneakingChange( eventData ) )

    // ! With 1.17 update, entity_use_item stopped working with custom items
    // Using entity_carried_item_changed as a workaround
    system.listenForEvent( 'minecraft:entity_use_item', ( eventData ) => onUseItem( eventData ) )

    const playerData = {
        name,
        entity: playerEntity,
        block: undefined,
        currentTool: undefined,
        activeConstructionTool: undefined,
        toolsUsed: {},
        lookingAtPosition: undefined,
        isCarriedBlockChanged: true,
    }

    // === Player data API ===
    const playerApi = {
        get name(){
            return playerData.name
        },

        get block(){
            return playerData.block || Block()
        },

        get isCarriedBlockChanged() {
            return playerData.isCarriedBlockChanged
        },

        get direction() {
            const headRotation = getPlayerComponent( 'rotation' )
            return directionHelper().parseRotation( headRotation )
        },

        get lookingAtPosition() {
            const pos = new Position( playerData.lookingAtPosition, true )
            return pos.isValid() ? pos : undefined
        },

        get position() {
            return system.getEntityPosition( playerData.entity )
        },

        entity(){
            return playerData.entity
        },

        activeConstructionTool() {
            const { activeConstructionTool } = playerData
            return activeConstructionTool && activeConstructionTool.name ? activeConstructionTool : {}
        },

        currentTool(){
            const { currentTool } = playerData
            return currentTool && currentTool.isValid ? currentTool : {}
        },

        toolsUsed( toolName = undefined ){
            if ( ! toolName ) {
                return playerData.toolsUsed
            }
            const tool = playerData.toolsUsed[ toolName ]
            return tool && tool.isValid ? tool : undefined
        },

        /**
         * Retrieve list of nicely formatted information to display in the actionbar or elsewhere.
         *
         * Returns object.
         */
        getInfo() {
            const currentTool = this.currentTool()
            const { block, direction, position } = this
            const { pitch, yaw, level } = direction
            const { x: xAlign, z: zAlign } = direction.alignment

            const _info = {
                block: block.name ? `Block: ${ block.niceName }` : 'Block: [none selected]',
                direction: `Pitch: ${ pitch } ${ level ? '(level)' : '' }  Yaw: ${ yaw } (${ zAlign }/${ xAlign })`,
                position: `Position: { x: ${ position.x } y: ${ position.y } z: ${ position.z } }`,
                tool: currentTool.title || currentTool.name || 'n/a',
            }

            return _info
        },

        /**
         * Compile info elements into string.
         *
         * infoElements [string] - Either strings to display verbatim or valid keys in the object returned by getInfo()
         *
         * Valid getInfo() keys: block, direction, tool, toolConfig, position
         */
        getInfoString( ...infoElements ) {
            const infoObj = this.getInfo()
            const infoMsg = []

            infoElements.forEach( ( el ) => {
                if ( infoObj[ el ] ) {
                    infoMsg.push( infoObj[ el ] )
                }
                else if ( typeof el === 'string' ){
                    infoMsg.push( el )
                }
            } )

            return infoMsg.join( '\n' )
        },

        carriedBlockHasChanged( hasChanged = true ) {
            playerData.isCarriedBlockChanged = hasChanged
        },

        /**
         * Save position returned by hit_result_continuous
         */
        setLookingAtPosition( pos = undefined ){
            playerData.lookingAtPosition = pos
        },

        setTool( toolName ) {
            info( 'setTool()', toolName )

            let tool = this.toolsUsed( toolName )

            if ( ! tool ) {
                playerData.currentTool = Tool( toolName, this )
                const { currentTool } = playerData

                info( 'Initialized tool.' )
                debug( 'currentTool (all data):', currentTool.getData(), 6 )

                if ( currentTool.isValid ) {
                    debug( 'currentTool:', currentTool )
                    playerData.toolsUsed[ toolName ] = currentTool
                }
            }
            else {
                playerData.currentTool = tool
                tool.wizard.reset()
            }

            let elements = []
            switch ( toolName ) {
                case 'build':
                    elements = this.block.name
                        ? [ 'tool', '\nRight click to activate and select start position.\n', 'block' ]
                        : [ 'tool', '\nNo block - select a block before using this tool.' ]
                    break
                case 'destroy':
                    elements = [ 'tool', '\nRight click to to activate and select start position.\n' ]
                    break
                case 'query':
                    elements = [ 'tool', '\nRight click to query block.\n' ]
                    break
                case 'teleport':
                    elements = [ 'tool', '\nRight click to teleport to nearest obstacle.\n' ]
                    break
            }

            if ( elements.length ) {
                displayMsg( this.getInfoString( ...elements ) )
            }
        },

        useTool() {
            log( 'useTool()' )
            const currentTool = this.currentTool()
            if ( currentTool.isConstructionTool ) {
                playerData.activeConstructionTool = currentTool
            }

            debug( 'currentTool (all data):', currentTool.getInfo( true ), 6 )
            debug( 'currentTool:', currentTool )

            switch ( currentTool.name ) {
                case 'build':
                    currentTool.use( {
                        block: this.block,
                        target: this.lookingAtPosition,
                    } )
                    break

                case 'destroy':
                    currentTool.use( {
                        target: this.lookingAtPosition,
                    } )
                    break

                case 'measure':
                    currentTool.use( {
                        target: this.lookingAtPosition,
                    } )
                    break

                case 'query':
                    currentTool.use( {
                        target: this.lookingAtPosition,
                        callback: ( block ) => {
                            if ( block.name ) {
                                playerData.block = block
                            }
                        },
                    } )
                    break

                case 'teleport':
                    currentTool.use( {
                        destination: this.lookingAtPosition,
                    } )
            }
        },

        unsetTool() {
            log( 'unsetTool()' )

            const currentTool = this.currentTool()
            if ( currentTool.isValid ) {
                playerData.toolsUsed[ currentTool.name ] = currentTool
            }
            playerData.currentTool = undefined
        },

        openUi() {
            const currentTool = this.currentTool()
            if ( currentTool.isValid && currentTool.enableUi ) {
                currentTool.wizard.reset()
                const toolData = currentTool.getData()
                const data = {
                    tool: { name: toolData.name, title: toolData.title },
                    toolType: toolData.type,
                    toolConfig: toolData.config,
                    toolDefaults: toolData.configDefaults,
                }

                system.sendToClient( 'open_tool_settings', data )

                // set active tool
                if ( currentTool.isConstructionTool ) {
                    playerData.activeConstructionTool = currentTool
                }
            }
        },

        init() {
            // Init any tool held in main hand
            const handContainer = getPlayerComponent( 'hand_container' )
            let mainHand = handContainer[ 0 ].item

            if ( mainHand ) {
                mainHand = getToolName( mainHand )
                TOOL_LIST.some( ( tool ) => {
                    if ( mainHand === tool ) {
                        playerApi.setTool( mainHand )
                        system.sendToClient( 'toggle_target_monitor', true )
                        system.sendToClient( 'toggle_target_monitor', false )
                        return true
                    }
                } )
            }
        },
    }

    // === Init ===
    playerApi.init()

    return playerApi

    // === Player components ===
    function getPlayerComponent( component ) {
        const data = system.getComponent( playerData.entity, `minecraft:${ component }` )
        return data && data.data
    }

    // === Event listener functions ===

    /**
     * Trigger when item/block carried in hand changes
     *
     * !! 1.17 update note !!
     * ! Versions 1.17.0 - 1.17.10 and counting break entity_use_item !
     *
     * #note: as a workaround, entity_carried_item_changed is used to execute custom item events - it is triggered when a custom item is used
     * If current item === previous item, it is interpreted as a click event
     */
    function onCarriedItemChange( eventData ) {
        const { carried_item, entity, hand, previous_carried_item } = eventData.data

        // Verify entity
        // Check which hand is used
        if ( entity.id !== player.entity().id || hand !== 'slot.weapon.mainhand' ) {
            return
        }

        const { item } = carried_item
        const tool = getToolName( item )

        debug( 'onCarriedItemChange', { item, tool }, 6 )

        if ( ! tool || ! TOOL_LIST.includes( tool ) ) {
            debug( 'onCarriedItemChange', { item, tool } )

            playerApi.unsetTool()
            playerApi.carriedBlockHasChanged()

            // Using a block - stop recording the player's lookingAt position
            system.sendToClient( 'toggle_target_monitor', false )
            playerApi.setLookingAtPosition()
            return
        }

        // Activate target monitor
        system.sendToClient( 'toggle_target_monitor', true )

        // If carried item has changed
        if ( item !== previous_carried_item.item ) {
            playerApi.carriedBlockHasChanged()
            playerApi.setTool( tool )
            return
        }

        // === Use tool ===
        // ! Workaround for item interaction
        // onCarriedItemChange is triggered when an item is used

        const currentTool = playerApi.currentTool()
        if ( currentTool.name === tool ) {
            playerApi.carriedBlockHasChanged( false )
            playerApi.useTool()
        }
        else {
            // error( 'Error debug data dump below, followed by error message.' )
            // log( 'Tool data', { currentTool }, 1 )
            // log( 'Player data', { carriedBlockHasChanged: playerApi.carriedBlockHasChanged(), playerData }, 1 )
            // log( 'Event data', { item, tool, data }, 1 )
            // log( 'Addon data', {
            //     TOOL_LIST,
            //     ADDON_SETTINGS,
            //     DEBUG_LOG,
            // }, 1 )

            error( `Cannot use ${ tool }, it has not been activated. This could be because Cheat Mode is turned off or has only just been enabled. Turn on Cheat Mode and reload the world.` )
        }
    }

    /**
     * Track last block placed by player
     * !!Check if player is carrying a tool, otherwise
     * Minimize resource use: sets block only if player.isCarriedBlockChanged is true
     * player.isCarriedBlockChanged is set by onCarriedItemChange()
     *
     * eventData: block position
     */
    function onPlayerPlacedBlock( eventData ) {

        debug( 'onPlayerPlacedBlock debug', { isCarriedBlockChanged: playerApi.isCarriedBlockChanged, activeConstructionTool: playerApi.activeConstructionTool() }, 6 )

        if ( playerApi.isCarriedBlockChanged && playerApi.activeConstructionTool().isBuildingTool ) {
            log( 'onPlayerPlacedBlock', '', 6 )

            playerApi.carriedBlockHasChanged( false )

            // Grab the block that was just created
            playerData.block = Block( { coordinates: eventData.data.block_position } )

            // if ( playerApi.activeConstructionTool().name ) {
            //     displayMsg( `Block: ${ playerApi.block.niceName.toUpperCase() }` )
            //     // info( 'Block placed', playerApi.block.niceName )
            // }
        }
    }

    /**
     * Trigger UI when player is sneaking.
     */
    function onSneakingChange( eventData ) {
        const { sneaking } = eventData.data

        if ( sneaking ) {
            playerApi.openUi()
        }
    }

    /**
     * Doesn't work for custom items after 1.17, but maybe it will again some day.
     */
    function onUseItem( eventData ) {
        const stack = eventData.data.item_stack
        const tool = getToolName( stack.item )

        if ( tool ) {
            log( 'onUseItem', tool )
        }
        // Tools are hand equipped, but blocks are not
        // If nothing in main hand, return
        // if ( ! stack ) {
        //     log( "" )
        //     log( "=== onUseItem (block) ===" )
        //     return
        // }
    }

}

/**
 * Tool factory
 */
function Tool( toolName = null, playerBinding = null ) {
    log( 'Initializing tool', toolName )

    // #todo: turn this into validation settings instead?
    const defaults = {
        build: {
            title: 'Building Tool',
            type: 'fill',
            isBuildingTool: true,
            enableUi: true,
            fillMode: 'replace',
            size: { width: 2, depth: 2, height: 2 },
            maxSize: 200,
            maxDistance: 5, // Minecraft default is 5
            targetBlock: 'anterior',
            buildDirections: { x: 'east', y: 'up', z: 'north' }, // #todo
            buildMode: 'hybrid', // #todo: hybrid: => configured end point; fixed: => configured start/end; dynamic: point to set start/end
        },
        destroy: {
            title: 'Destruction Tool',
            isDestructionTool: true,
            enableUi: true,
            type: 'fill',
            fillMode: 'replace',
            size: { width: 2, depth: 2, height: 2 },
            maxSize: 200,
            maxDistance: 5, // Minecraft default is 5
            targetBlock: 'posterior',
            buildDirections: { x: 'east', y: 'up' },
        },
        measure: {
            title: 'Measuring Tool',
            type: 'measure',
        },
        query: {
            title: 'Query Tool',
            type: 'query',
            targetBlock: 'posterior',
            enableUi: true,
        },
        teleport: {
            title: 'Teleport',
            type: 'teleport',
            maxDistance: 50, // #todo: make configurable
        },
    }

    const toolSet = {
        build: _build,
        destroy: _destroy,
        measure: _measure,
        query: _query,
        teleport: _teleport,
    }

    const toolData = {
        name: toolName,
        identifier: getToolIdentifier( toolName ),
        title: '',
        type: '',
        enableUi: false,
        isBuildingTool: false,
        isDestructionTool: false,
        player: playerBinding,
        wizard: {
            step: 0,
            data: {},
        },
        config: {},
        configDefaults: {},
    }

    if ( ! toolName ) {
        return toolData
    }

    const toolSetup = ADDON_SETTINGS.toolConfig[ toolName ] || {}
    const toolDefaults = defaults[ toolName ] || {}
    const configDefaults = mergeDeep( toolDefaults, toolSetup )

    toolData.title = extract( 'title', configDefaults )
    toolData.type = extract( 'type', configDefaults )
    toolData.enableUi = extract( 'enableUi', configDefaults )
    toolData.isBuildingTool = extract( 'isBuildingTool', configDefaults )
    toolData.isDestructionTool = extract( 'isDestructionTool', configDefaults )

    configure( configDefaults )

    // Save deep cloned copy for debugging
    toolData.configDefaults = mergeDeep( {}, toolData.config )

    // Return object
    const toolApi = {
        configure,

        get coordinates() {
            return build.coordinates
        },

        get identifier() {
            return toolData.identifier
        },

        get name() {
            return toolData.name
        },

        get title() {
            return toolData.title
        },

        get enableUi() {
            return toolData.enableUi
        },

        get wizard() {
            return {
                get data() {
                    return toolData.wizard.data
                },
                get step() {
                    return toolData.wizard.step
                },

                setStep( step ) {
                    toolData.wizard.step = step
                },

                setData( key, value ) {
                    toolData.wizard.data[ key ] = value
                },

                reset() {
                    toolData.wizard.step = 0
                    toolData.wizard.data = {}
                },
            }
        },

        get isValid() {
            return !! toolName
        },

        get isBuildingTool() {
            return toolData.isBuildingTool
        },

        get isDestructionTool() {
            return toolData.isDestructionTool
        },

        get isConstructionTool() {
            return toolData.isBuildingTool || toolData.isDestructionTool
        },

        getData() {
            return toolData
        },

        getInfo( key ) {
            if ( toolData.type === 'fill' ) {
                const { size, targetBlock } = toolData.config
                const info = {
                    size: `W: ${ size.width }  H: ${ size.height }  D: ${ size.depth }`,
                    targetBlock: `Relative target block: ${ targetBlock }`,
                }

                if ( key ) {
                    if ( key in info ) {
                        return info[ key ]
                    }
                    return ''
                }
            }
        },

        use ( data ) {
            toolSet[ toolData.name ]( data )
        },
    }

    return toolApi

    function configure( settings ) {
        // Merge with existing config
        let _config_ = toolData.config

        if ( 'maxDistance' in settings ) {
            _config_.maxDistance = parseInt( settings.maxDistance )
        }

        if ( 'targetBlock' in settings ) {
            _config_.targetBlock = settings.targetBlock
        }

        if ( toolData.type === 'fill' ) {
            const presetConfig = settings.preset && ADDON_SETTINGS.fillPresets[ settings.preset ]

            if ( presetConfig ) {
                mergeDeep( _config_, presetConfig )
                settings.size = presetConfig.size || settings.size
                settings.fillMode = presetConfig.fillMode || settings.fillMode
            }

            // toolData.config.buildMode = defaults.buildMode
            _config_.maxSize = settings.maxSize || _config_.maxSize
            _config_.buildDirections = merge( _config_.buildDirections || {}, settings.buildDirections )

            const fillConfig = build.setFillConfig( { size: settings.size, fillMode: settings.fillMode } )

            mergeDeep( _config_, fillConfig )
        }

        toolData.config = _config_
    }

    function isMaxDistanceExceeded( playerPosition, target, maxDistance = undefined, error = true ) {
        maxDistance = parseInt( maxDistance )
        if ( ! maxDistance ) {
            maxDistance = 5
        }

        if ( target === undefined ) {
            return false
        }

        if ( maxDistance ) {
            const distance = playerPosition.getRadialDistance( target )

            if ( distance > maxDistance ) {
                if ( ! error ) {
                    return true
                }

                log( `Target max distance exceeded (target distance = ${ distance }; max = ${ maxDistance }).` )
                displayMsg( `Too far away - pick somewhere closer.\n\n (target distance = ${ distance }; max distance = ${ maxDistance }).` )
                return true
            }
        }

        return false
    }

    /**
     * Build Tool
     */
    function _build( { target, block, targetBlock, playerDirection, playerPosition } ) {
        const { wizard } = toolApi
        info( toolData.title, `wizard.step=${ wizard.step }` )

        const _player = toolData.player
        playerDirection = playerDirection || _player.direction
        playerPosition = playerPosition || _player.position

        const { size, fillMode, buildDirections, maxDistance } = toolData.config
        targetBlock = targetBlock || toolData.config.targetBlock

        if ( ! block || ! block.name ) {
            displayMsg( 'Can\'t build anything yet - select a block first.' )
            wizard.reset()
            return
        }

        // Adjust start position based on player direction and selected block face
        const _target = target.targetAdjustment( { targetBlock, playerDirection } )

        if ( ! _target ) {
            displayMsg( 'No target selected or invalid target.' )
            wizard.reset()
            return
        }
        if ( isMaxDistanceExceeded( playerPosition, _target, maxDistance ) ) {
            wizard.reset()
            return
        }

        // === Building wizard ===
        if ( ! wizard.step ) {
            // Calculate offsets for end position
            const offsets = directionHelper().translateDimensionsToGlobalOffsets( size, buildDirections )

            // Calculate endPosition - opposite corner of the cube to fill in
            const endPosition = _target.getPositionFrom3dOffsets( offsets, playerDirection )

            wizard.setData( 'startPosition', _target )
            wizard.setData( 'endPosition', endPosition )

            let msg = 'Ready - select the same target again to execute.'
            msg += `\n\nStart position: ${ _target.toString() }`
            msg += `\nEnd position: ${ endPosition.toString() }`
            msg += `\nBlock: ${ block.niceName }`
            msg += `\nSize: ${ toolApi.getInfo( 'size' ) }`

            displayMsg( msg )

            wizard.setStep( 1 )
            return
        }

        // === Final wizard.step ===
        const { startPosition, endPosition } = wizard.data

        if ( ! startPosition.compare( _target ) ) {
            displayMsg( 'Operation cancelled. Select the same block twice to trigger command.' )
            wizard.reset()
            return
        }

        build.fill( {
            block,
            startPosition: startPosition.floor(),
            endPosition: endPosition.floor(),
            fillMode,
            // simulate: true,
        } )

        wizard.reset()
    }

    /**
     * Destroy Tool
     */
    function _destroy( { target, targetBlock, playerDirection, playerPosition } ) {
        const { wizard } = toolApi
        info( toolData.title, `wizard.step=${ wizard.step }` )

        const _player = toolData.player
        playerDirection = playerDirection || _player.direction
        playerPosition = playerPosition || _player.position

        const { size, fillMode, buildDirections, maxDistance } = toolData.config
        targetBlock = targetBlock || toolData.config.targetBlock

        const _target = target.targetAdjustment( { targetBlock, playerDirection } )

        if ( ! _target ) {
            displayMsg( 'No target selected or invalid target.' )
            wizard.reset()
            return
        }
        if ( isMaxDistanceExceeded( playerPosition, _target, maxDistance ) ) {
            wizard.reset()
            return
        }

        // === wizard.step wizard ===
        if ( ! wizard.step ) {
            // Calculate offsets for end position
            buildDirections.z = 'north'
            const offsets = directionHelper().translateDimensionsToGlobalOffsets( size, buildDirections )

            // Calculate endPosition - opposite corner of the cube to fill in
            const endPosition = _target.getPositionFrom3dOffsets( offsets, playerDirection )

            wizard.setData( 'startPosition', _target )
            wizard.setData( 'endPosition', endPosition )

            let msg = 'Ready - select the same target again to execute.'
            msg += `\n\nStart position: ${ _target.toString() }`
            msg += `\nEnd position: ${ endPosition.toString() }`
            msg += `\nSize: ${ toolApi.getInfo( 'size' ) }`

            displayMsg( msg )

            wizard.setStep( 1 )
            return
        }

        // === Final wizard.step ===
        const { startPosition, endPosition } = wizard.data

        if ( ! startPosition.compare( _target ) ) {
            displayMsg( 'Operation cancelled. Select the same block twice to trigger command.' )
            wizard.reset()
            return
        }

        build.fill( {
            block: Block( { name: 'air' } ),
            startPosition: startPosition.floor(),
            endPosition: endPosition.floor(),
            fillMode,
            // simulate: true,
        } )

        wizard.reset()
    }

    /**
     * Measuring Tool
     */
    function _measure( { target } ) {
        const { wizard } = toolApi
        const playerDirection = toolData.player.direction

        info( toolData.title, `wizard.step=${ wizard.step }` )

        if ( ! target || ! target.isValid() ) {
            displayMsg( 'No target selected.' )
            log( 'No target selected.' )
            debug( { target } )
            wizard.reset()
            return
        }

        const tool = player.activeConstructionTool()

        if ( ! wizard.step ) {
            let _target = target.targetAdjustment( { targetBlock: 'posterior', playerDirection } )
            const ifActiveToolMsg = tool.isValid ? `\n\nMeasured results will update settings for: ${ tool.title }` : ''

            let msg = 'Measure width, height or depth.'
            msg += '\n\nSelect another position along the axis you want to measure.'
            msg += '\nSelect the same position to cancel.'
            // msg += `\n\nAxes: left-right = ${ xDimension }forward-backwards = ${ xDimension }`
            msg += ifActiveToolMsg
            displayMsg( msg )

            wizard.setStep( 1 )
            wizard.setData( 'startPosition', _target )
            wizard.setData( 'direction', playerDirection )
        }
        else if ( wizard.step === 1 ) {
            const { startPosition, direction } = wizard.data
            const yawAdj = direction.alignment.major === 'x' ? 'north' : 'east'

            let endPosition = target.targetAdjustment( { targetBlock: 'posterior', playerDirection: direction } )

            if ( endPosition.compare( startPosition ) ) {
                info( 'Measuring Tool', 'End position matches start position, aborting.' )
                displayMsg( 'Measuring aborted: start and end positions match.\n\nReady to measure again.' )
                wizard.reset()
                return
            }

            const results = endPosition.getLateralDistance( startPosition, yawAdj, true )

            if ( ! results ) {
                displayMsg( 'Measuring failed, unknown error.' )
            }
            else {
                const { dimension, n } = results

                info( 'Measuring Results', `dimension = ${ n }` )

                let resultsMsg = `-- Measuring Results --\n\n${ dimension } = ${ n }`
                if ( tool.isValid ) {
                    resultsMsg += `\n\nClick the same position again to update settings for: ${ tool.title }`
                    displayMsg( resultsMsg )
                    info( resultsMsg )

                    wizard.setStep( 2 )
                    wizard.setData( 'endPosition', endPosition )
                    wizard.setData( 'results', results )
                }
                else {
                    displayMsg( resultsMsg )
                    wizard.reset()
                }
            }
        }
        else if ( wizard.step === 2 ) {
            const { endPosition, direction } = wizard.data
            let _target = target.targetAdjustment( { targetBlock: 'posterior', playerDirection: direction } )

            if ( ! _target.compare( endPosition ) ) {
                info( 'Measuring Tool', 'New position does not match previous end position, tool settings not updated.' )
                wizard.reset()
                _measure( { target } )
                return
            }

            const { results } = wizard.data
            const { dimension, n } = results

            tool.configure( { size: results } )

            info( `Measuring Tool updated ${ tool.title }`, `set ${ dimension } = ${ n }.` )
            displayMsg( `Updated settings for ${ tool.title }\n\n Set ${ dimension } = ${ n }.\n\nReady to measure again` )

            wizard.reset()
        }
    }

    /**
     * Query Tool
     */
    function _query( { target, callback } ) {
        info( toolData.title )

        if ( ! target || ! target.isValid() ) {
            displayMsg( 'No target selected.' )
            log( 'No target selected.' )
            debug( { target } )
            return
        }

        // Need to offset block coordinates depending on the direction of the player
        const playerDirection = toolData.player.direction
        const blockFaceData = target.getBlockFace( playerDirection )
        const { targetBlock } = toolData.config
        const _target = target.targetAdjustment( { targetBlock, blockFaceData } )

        if ( ! _target || ! _target.isValid() ) {
            displayMsg( 'Failed to query target because of an upstream error - see the log.' )
            error( 'Failed to query target because of an upstream error - see the log.' )
            log( 'Details', target, 1 )
            return
        }

        let isPartial = blockFaceData.blockFace === 'none' ? true : false
        const block = Block( { coordinates: _target }, isPartial )

        displayMsg( `Selected block: ${ block.niceName }` )
        callback( block )
    }

    /**
     * Teleport Tool
     */
    function _teleport( { destination, playerPosition, direction } ){
        info( toolData.title )

        direction = direction || toolData.player.direction
        playerPosition = playerPosition || toolData.player.position

        const { maxDistance } = toolData.config

        // ~ Modes: with and without valid destination ~
        // If destination, use mode 1 - move to destination unless it exceeds max distance
        // If no destination or max distance is exceeded, use mode 2 - move maxDistance in the specified direction

        // ~ Mode 1 ~
        let target
        if ( destination !== undefined ) {
            // Always get block in front of target (closer to player)
            target = destination.targetAdjustment( { targetBlock: 'anterior', playerDirection: direction } )

            if ( ! target ) {
                displayMsg( 'Error - could not determine end target.\n\nSee the log for details.' )
                error( 'Teleport aborted, invalid target. Caused by upstream error.' )
                return
            }
        }

        // ~ Mode 2 ~
        let distance = maxDistance
        if ( ! target || isMaxDistanceExceeded( playerPosition, target, maxDistance, false ) ) {
            // Calculate diagonal position based on max distance
            info( 'Teleport mode 2 - target invalid or too far away.' )
            // log( toolData )
            target = playerPosition.getRadialOffset( direction, maxDistance )
            log( 'New target', target )

            distance = `${ maxDistance } (max distance)`

            if ( ! target ) {
                error( 'Teleport failed, unknown error.' )
                return
            }
        }

        // Ensure there is enough vertical space
        let block = Block( { coordinates: target } )
        if ( block.name !== 'air' ) {
            block = Block( { coordinates: target.modify( { y: 1 } ) } )

            if ( block.name !== 'air' ) {
                block = Block( { coordinates: target.modify( { y: -1 }, true ) } )

                if ( block.name !== 'air' ) {
                    displayMsg( 'Not enough room to teleport.' )
                    return
                }
            }
        }

        // Measure distance
        if ( ! distance ) {
            target.getRadialDistance( playerPosition )
        }
        const successMsg = `Teleported ${ distance } blocks.`

        const { x, y, z } = target
        const command = 'tp'
        const argString = `${ player.name } ${ x } ${ y } ${ z } true`

        system.commandExecute( { command, argString, successMsg } )
    }
}

/**
 * Low-level building API factory. Doesnt' really need to be a factory, but as a function it gets hoisted to the top.
 */
function Build() {
    const fillModes = [ 'hollow', 'keep', 'outline', 'replace' ]

    return {

        /**
         * Fill cube with blocks.
         *
         * === Usage ===
         * fill({ startPosition, endPosition, block, [fillMode] })
         *
         * === Parameters ===
         * startPosition { Position object }
         * endPosition { Position object }
         * block: { Block object }
         * fillMode { 'destroy'|'hollow'|'keep'|'outline'|'replace' }
         *
         */
        fill( { startPosition, endPosition, block, fillMode, simulate = undefined } ) {
            log( 'build.fill()' )
            debug( { startPosition, endPosition, block, fillMode, simulate }, '', 6 )

            // Vanilla block state preparation
            let blockState = ''
            if ( block.state ) {
                blockState = JSON.stringify( block.state )
                blockState = blockState.slice( 1, -1 )
            }

            if ( ! this.isValidFillMode( fillMode ) ) {
                error( 'Operation aborted. Invalid fill mode: ', fillMode )
                displayMsg( 'Operation aborted. Invalid fill mode: ', fillMode )
                return
            }

            const command = getFillCommand( { block: block.name, blockState, startPosition, endPosition, fillMode, simulate } )

            system.commandExecute( command )
        },

        isValidFillMode( fillMode ) {
            return fillModes.includes( fillMode )
        },

        setFillConfig( { size = undefined, fillMode = undefined } ) {
            const fillData = {}

            if ( size ) {
                const fillSize = filterPositiveInt( size )
                if ( ! isEmpty( fillSize ) ) {
                    fillData.size = fillSize
                }
            }

            if ( fillMode ) {
                if ( ! this.isValidFillMode( fillMode ) ) {
                    error( `Invalid fill mode: ${ fillMode }` )
                    log( 'Valid fill modes: ', fillModes, 1 )
                }
                else {
                    fillData.fillMode = fillMode
                }
            }

            return fillData
        },

        setBlock() {
            // system.commandExecute( `/setblock ${x} ${y} ${z} ${block}
        },
    }

    function getFillCommand( { startPosition, endPosition, block, blockState, fillMode = 'replace' } ) {
        blockState = blockState ? `[${ blockState }]` : 0
        return {
            command: 'fill',
            argString: `${ startPosition.x } ${ startPosition.y } ${ startPosition.z } ${ endPosition.x } ${ endPosition.y } ${ endPosition.z } ${ block } ${ blockState } ${ fillMode }`,
        }
    }

}

/**
 * Block Factory
 *
 * Create block by string (block name), coordinates or raw block data
 */
function Block( { coordinates, name } = { coordinates: undefined, name: undefined }, isPartial = false ) {
    const blockData = {
        name: '',
        identifier: '',
        entity: undefined,
        state: undefined,
        isCustom: false,
        isPartial,
        position: undefined,
    }

    // Return object
    const block = {
        get name() {
            return blockData.name
        },

        get state() {
            if ( ! blockData.entity ) {
                return undefined
            }

            if ( blockData.state === undefined ) {
                const blockState = system.getComponent( blockData.entity, 'minecraft:blockstate' )
                blockData.state = isEmpty( blockState.data ) ? null : blockState.data
            }

            return blockData.state
        },

        get identifier() {
            return blockData.identifier
        },

        get namespace() {
            return blockData.namespace
        },

        get position() {
            return blockData.position
        },

        get isCustom() {
            return blockData.isCustom
        },

        get isPartial() {
            return blockData.isPartial
        },

        get niceState() {
            if ( ! this.state ) {
                return ''
            }

            let stateString = ''
            try {
                const s = Object.entries( blockData.state )
                stateString = s.reduce( ( result, e ) => {
                    const [ key, value ] = e
                    return result.push( `${ key }: ${ value }` ) && result
                }, [] ).join( ', ' )
            }
            catch ( e ) {
                error( 'Block processing error. Details: ', e )
                return ''
            }

            return stateString
        },

        get niceName() {
            return blockData.name + ( this.state ? ` (${ this.niceState })` : '' )
        },

        entity() {
            return blockData.entity
        },
    }

    if ( coordinates ) {
        const rawBlock = system.getBlockFromCoordinates( coordinates )
        blockData.entity = rawBlock
        blockData.identifier = rawBlock.__identifier__
        blockData.name = blockData.identifier
        blockData.position = rawBlock.block_position
    }
    else if ( name ) {
        blockData.identifier = name
        blockData.name = name
    }

    // Check if custom or built-in -- necessary for two reasons:
    // 1) The fill command needs the name of vanilla blocks without the 'minecraft' prefix
    // 2) To get block state
    const { identifier } = blockData
    const namespaceDivider = identifier.indexOf( ':' )
    if ( namespaceDivider > 0 ) {
        if ( /^minecraft:/.test( identifier ) ) {
            blockData.namespace = 'minecraft'
            blockData.name = /^minecraft:(.*)/.exec( identifier )[ 1 ]
        }
        else {
            blockData.namespace = identifier.substring( 0, namespaceDivider )
            blockData.isCustom = true
        }
    }
    else if ( identifier ) {
        blockData.namespace = 'minecraft'
    }

    log( 'Block:', block )

    return block
}

/**
 * Position object.
 *
 * positionObj: { x, y, z }
 */
class Position {
    constructor( positionObj, fixRoundingError = false ) {
        if ( isRawPosition( positionObj ) ) {
            // copy by value
            const { x, y, z } = positionObj
            this.setAll( { x, y, z } )

            if ( fixRoundingError ) {
                this.fixRoundingError()
            }
        }
    }

    /**
     * Set value of dimension if not set (undefined)
     */
    set( key, value, round = false ) {
        if ( key && value >= 0 ) {
            this[ key ] = round ? Math.floor( value ) : value
            return true
        }
        return false
    }

    setMissing( key, value, round = false ) {
        if ( this[ key ] === null && value >= 0 ) {
            this[ key ] = round ? Math.floor( value ) : value
            return true
        }
        return false
    }

    setAll( { x, y, z } ) {
        if ( x !== undefined ) {
            this.x = x
        }
        if ( y !== undefined ) {
            this.y = y
        }
        if ( z !== undefined ) {
            this.z = z
        }
    }

    compare( position, floor = true ) {
        let pos1 = new Position( this )
        let pos2 = new Position( position )

        if ( floor ) {
            pos1.floor( true )
            pos2.floor( true )
        }

        if ( pos1.x === pos2.x &&
            pos1.y === pos2.y &&
            pos1.z === pos2.z
        ) {
            return true
        }
        return false
    }

    /**
     * Round coordinates down
     * Mutates self if requested.
     * Returns new position.
     */
    floor( update = false ) {
        let pos = update ? this : new Position()
        pos.x = this.x ? Math.floor( this.x ) : this.x
        pos.y = this.y ? Math.floor( this.y ) : this.y
        pos.z = this.z ? Math.floor( this.z ) : this.z
        return pos
    }

    /**
     * Add or subtract from position values.
     * Mutates self if requested.
     * Returns new position.
     */
    modify( { x = 0, y = 0, z = 0 }, update ) {
        let pos = update ? this : new Position()
        pos.x = x ? this.x + x : this.x
        pos.y = y ? this.y + y : this.y
        pos.z = z ? this.z + z : this.z
        return pos
    }

    toString() {
        const pos = this.floor()
        return `x = ${ pos.x }, y = ${ pos.y }, x = ${ pos.z }`
    }

    /**
     * Check if all coordinate values are set/valid.
     */
    isValid() {
        return ( ! isNil( this.x ) && ! isNil( this.y ) && ! isNil( this.z ) )
    }

    /**
     * === There's a bug in the bedrock, dear Mojang, dear Mojang... ===
     * Minecraft bug where the selected block face sometimes is not a round number.
     * When querying a block at { x: 0, z: 0, y: [any] } with hit_result_continuous,
     * Minecraft sometimes returns a float rather than a whole number.
     * These floats contain very small fractions above/below 0 or 1.
     * A whole number is expected for the axis of the selected block face.
     *
     * ~ Examples ~
     * Example values returned by Minecraft
     * ~1.19e-7
     * 0.9999998807907104
     * 1.00000011920929
     *
     * ~ Details ~
     * The following appears to be true:
     * 1) Erroneous coordinate number always start with (+/-) 0.00000..., 0.99999... or 1.00000...
     * 2) The problem occurs when pointing cross hairs near the vertical and horizontal centre of the block face.
     *
     * ~ Triggering the bug: ~
     * The bug can be triggered at any distance, but this was is reliable:
     * 1) Place block at { x: 0, z: 0 } at the same y as the player
     * 2) Move to two blocks along either z or x axis (either way), still at the same y plane
     * 3) Using hit_result_continuous, query the facing vertical block face near the centre
     * 4) For each coordinate set {x, y, z}, check if value === Math.floor(value)
     *
     * ~ Workaround ~
     * Determine which value contains the rounding error and ensure it's rounded to a whole number.
     */
    fixRoundingError() {
        if ( ! this.isValid() ) {
            return
        }

        const adjPos = this.floor()

        // One of these should be equal - one value should always be round if the position is received from Minecraft
        if ( this.x !== adjPos.x &&
                this.y !== adjPos.y &&
                this.z !== adjPos.z
        ) {
            // Find the axis with the rounding error
            // if the fraction is extremely close to a whole number, we found the offending coordinate value
            const x = Math.abs( this.x % 1 )
            const y = Math.abs( this.y % 1 )
            const z = Math.abs( this.z % 1 )

            let axis

            if ( x < 0.00001 || x > 0.99999 ) {
                axis = 'x'
            }
            else if ( y < 0.00001 || y > 0.99999 ) {
                axis = 'y'
            }
            else if ( z < 0.00001 || z > 0.99999 ) {
                axis = 'z'
            }

            if ( ! axis ){
                log( 'Note! No round coordinate values received.' )
                log( 'Raw position', this )
                return
            }

            log( 'Warning', 'A rounding error was detected in position data received from Minecraft. Attempting recovery to determine selected block face. May be unstable!' )
            log( 'Details', `The value for the ${ axis } is erroneous. Expected whole number.` )

            const a = this[ axis ]
            const b = a.toFixed( 15 )

            this[ axis ] = Math.round( this[ axis ] )

            log( 'Verbose error details', {
                axis,
                rawValue: a,
                decimalValue: b,
                fixedValue: this[ axis ],
            }, 6 )
        }
    }

    /**
     * Return taxicab distance between two positions.
     *
     * #unused.
     */
    getTaxicabDistance( compareCoordinates ) {
        const sum = absDiff( this.x, compareCoordinates.x )
                + absDiff( this.y, compareCoordinates.y )
                + absDiff( this.z, compareCoordinates.z )

        return sum
    }

    /**
     * Calculate lateral distances along each axis between two positions.
     *
     * Axes are mapped to sizes based on player direction.
     */
    getLateralDistance( compareCoordinates, yaw, getMax = false ) {
        log( 'getLateralDistance()', '', 6 )

        const diff = {
            x: absDiff( this.x, compareCoordinates.x ) + 1,
            y: absDiff( this.y, compareCoordinates.y ) + 1,
            z: absDiff( this.z, compareCoordinates.z ) + 1,
        }

        if ( getMax ) {
            let asPosition = diff
            asPosition = directionHelper().getRelativeCoordinates( diff, yaw )

            const x = Math.abs( asPosition.x )
            const y = Math.abs( asPosition.y )
            const z = Math.abs( asPosition.z )
            const max = Math.max( x, y, z )

            const maxObj = {
                n: max,
            }

            if ( x === max ) {
                maxObj.axis = 'x'
                maxObj.dimension = 'width'
            }
            else if ( y === max ) {
                maxObj.axis = 'y'
                maxObj.dimension = 'height'
            }
            else if ( z === max ) {
                maxObj.axis = 'z'
                maxObj.dimension = 'depth'
            }

            maxObj[ maxObj.dimension ] = max
            return maxObj
        }
        return diff
    }

    /**
     * Get distance to another position as if it was the point on a sphere around a centre point.
     *
     * Returns whole number.
     */
    getRadialDistance( position ) {
        log( 'getRadialDistance()', '', 6 )

        const p1 = this
        const p2 = position

        // get hypothenuse of first plane (base)
        const ax = absDiff( p1.x, p2.x )
        const az = absDiff( p1.z, p2.z )
        const ah = Math.sqrt( Math.pow( ax, 2 ) + Math.pow( az, 2 ) )

        // get hypothenuse of diagonal plane (distance)
        const by = absDiff( p1.y, p2.y )
        const bh = Math.sqrt( Math.pow( ah, 2 ) + Math.pow( by, 2 ) )

        return Math.floor( bh )
    }

    /**
     * Calculate coordinates at a given distance from another position.
     *
     * Returns new position.
     */
    getRadialOffset( direction, distance, floor = true ){

        log( 'getRadialOffset()', '', 6 )
        log( { distance }, '', 6 )

        const n = parseInt( distance )
        if ( ! n || n < 1 ) {
            return
        }

        // Calc diagonals from direction coefficients
        const coefficients = direction.coefficients()
        let xN = n * coefficients.x
        let yN = n * coefficients.y
        let zN = n * coefficients.z

        // debug( { coefficients } )

        let x = this.x + xN
        let y = this.y + yN
        let z = this.z + zN

        const pos = new Position( { x, y, z } ).floor()
        return floor ? pos.floor() : pos
    }

    /**
     * Calc new position based on 3D offsets relative to player.
     *
     * offset: { x, y, z} - Global offsets
     *
     * Returns new position.
     */
    getPositionFrom3dOffsets( relativeOffsets, { yaw } ) {
        const pos = new Position( this )
        log( 'getPositionFrom3dOffsets', '', 6 )

        const _offsets = directionHelper().getRelativeCoordinates( relativeOffsets, yaw )

        pos.x += _offsets.x
        pos.y += _offsets.y
        pos.z += _offsets.z

        log( 'getPositionFrom3dOffsets offsets ==> ', _offsets, 6 )

        return pos
    }

    /**
     * Determine block face from position and player direction, for positions generated by hit_result_continuous.
     *
     * The axis of the block face will have a round number (but see bug).
     *
     * Argument:
     * { xAlign, zAlign, yAlign } = playerDirection
     *
     * Returns 'none' if a partial block is selected (slabs, plants, etc.)
     */
    getBlockFace( playerDirection ) {
        log( 'getBlockFace()', this, 6 )
        const { x: xAlign, y: yAlign, z: zAlign } = playerDirection.alignment

        const adjPos = this.floor()
        let blockFaceAlignment

        if ( this.x === adjPos.x ) {
            blockFaceAlignment = 'x'
        }
        else if ( this.y === adjPos.y ) {
            blockFaceAlignment = 'y'
        }
        else if ( this.z === adjPos.z ) {
            blockFaceAlignment = 'z'
        }
        else {
            info( 'Probably selected partial block.' )
        }

        let blockFace = 'none'
        if ( blockFaceAlignment ) {
            if ( blockFaceAlignment === 'y' ) {
                blockFace = yAlign === 'down' ? 'top' : 'bottom'
            }
            else if ( blockFaceAlignment === 'z' ) {
                blockFace = zAlign === 'north' ? 'south' : 'north'
            }
            else if ( blockFaceAlignment === 'x' ) {
                blockFace = xAlign === 'west' ? 'east' : 'west'
            }

            info( 'Target block face', blockFace )
        }

        return {
            blockFaceAlignment,
            blockFace,
        }
    }

    /**
     * Adjust target coordinates based on relative direction of player and desired target block - the empty block in front of the selected block face or the filled block behind it.
     *
     * If no block face is selected (partial block), return unadjusted position.
     *
     * Arguments:
     * { posterior | anterior } targetBlock - Which block to select relative to the active block face and the direction of the player
     * - posterior: get block behind selected block face (away from player)
     * - anterior: get block in front of selected block face (closer to player)
     * { playerDirection } playerDirection
     * { x, y, z} customOffsets - offset target coordinates by custom numbers (in global space)
     * { blockFaceData } blockFaceData - Output from getBlockFace()
     */
    targetAdjustment( { targetBlock, playerDirection, customOffsets, blockFaceData } ) {
        log( 'targetAdjustment()', '', 6 )

        const adjPos = this.floor()

        if ( ! blockFaceData ) {
            blockFaceData = this.getBlockFace( playerDirection )
            if ( ! blockFaceData ) {
                error( 'Failed to get block face because of an upstream error.' )
                return
            }
        }

        const { blockFace, blockFaceAlignment } = blockFaceData

        // No block face
        if ( blockFace === 'none' ){
            return adjPos
        }

        // Offsets labelled by block face
        let targetOffsets = {
            top: 0,
            bottom: 0,
            north: 0,
            south: 0,
            east: 0,
            west: 0,
        }

        if ( targetBlock === 'posterior' ) {
            targetOffsets.top = 1
            targetOffsets.south = 1
            targetOffsets.east = 1
        }
        else if ( targetBlock === 'anterior' ) {
            targetOffsets.bottom = 1
            targetOffsets.north = 1
            targetOffsets.west = 1
        }

        customOffsets = customOffsets || {}
        if ( blockFaceAlignment === 'y' ) {
            adjPos.y -= targetOffsets[ blockFace ]
            if ( customOffsets.y ) {
                adjPos.y += customOffsets.y
            }
        }
        else if ( blockFaceAlignment === 'z' ) {
            adjPos.z -= targetOffsets[ blockFace ]
            if ( customOffsets.z ) {
                adjPos.z += customOffsets.z
            }
        }
        else if ( blockFaceAlignment === 'x' ) {
            adjPos.x -= targetOffsets[ blockFace ]
            if ( customOffsets.x ) {
                adjPos.x += customOffsets.x
            }
        }

        return adjPos
    }
}

/**
 * Direction parser utility.
 *
 * Parse head rotation for human readable directions, incl
 * - Yaw: compass direction
 * - Pitch: head tilt
 * - Orientation: main axis alignment
 *
 * rotationObj: { x, y }
 */
function directionHelper() {
    /**
     * Map relative directions, axes and coordinate values between player and global coordinates.
     */
    const directionMap = {
        north: {
            axis: 'z',
            dimension: 'depth',
            x: { relAxis: 'z', adj: 1 },
            z: { relAxis: 'x', adj: -1 },
        },

        east: {
            axis: 'x',
            dimension: 'width',
            x: { relAxis: 'x', adj: 1 },
            z: { relAxis: 'z', adj: 1 },
        },

        south: {
            axis: 'z',
            dimension: 'depth',
            x: { relAxis: 'z', adj: -1 },
            z: { relAxis: 'x', adj: 1 },
        },

        west: {
            axis: 'x',
            dimension: 'width',
            x: { relAxis: 'x', adj: -1 },
            z: { relAxis: 'z', adj: -1 },
        },

        up: {
            axis: 'y',
            dimension: 'height',
            y: { relAxis: 'y', adj: 1 },
        },

        down: {
            axis: 'y',
            dimension: 'height',
            y: { relAxis: 'y', adj: -1 },
        },
    }

    const levelThresholds = {
        up: -40,
        down: 40,
    }

    const api = {
        directionMap: directionMap,

        /**
         * Convert coordinates relative to direction.
         */
        getRelativeCoordinates( coordinates, yaw ) {
            const mapping = directionMap[ yaw ]
            log( `getRelativeCoordinates (${ yaw })` )
            log( 'mapping', mapping, 6 )

            const newPos = Object.keys( coordinates ).reduce( ( _newPos, axis ) =>{
                if ( mapping[ axis ] ){
                    const { relAxis, adj } = mapping[ axis ]
                    _newPos[ axis ] = coordinates[ relAxis ] * adj
                    // log( { map: mapping[ axis ], [ axis ]: _newPos[ axis ] } )
                }
                else {
                    _newPos[ axis ] = coordinates[ axis ]
                }
                return _newPos
            }, {} )

            log( 'New position', newPos )

            return new Position( newPos )
        },

        /**
         * Convert dimensions to relative offsets according to alignment.
         */
        translateDimensionsToGlobalOffsets( dimensions, buildDirections ) {
            const { width, depth, height } = dimensions

            log( 'translateDimensionsToGlobalOffsets()', { dimensions, buildDirections }, 6 )

            const absOffsets = new Position( {
                x: width - 1,
                y: height - 1,
                z: depth - 1,
            } )

            // Adjust abs offsets for relative building directions
            // west = x = 10 => 10(-1) = -10
            // north = z = 4 => 4(-1) = -4
            const offsets = Object.entries( buildDirections ).reduce( ( _offsets, [ axis, dir ] ) => {
                const mapping = directionMap[ dir ]
                _offsets[ axis ] = absOffsets[ axis ]
                if ( axis in mapping ){
                    const { adj } = mapping[ axis ]
                    _offsets[ axis ] = _offsets[ axis ] * adj
                }
                return _offsets
            }, {} )

            // Normalize offsets
            const globalOffsets = directionHelper().getRelativeCoordinates( offsets, 'south' )

            log( 'globalOffsets', offsets, 6 )

            return globalOffsets
        },

        /**
         * Convert head rotation to human readable information.
         */
        parseRotation( rotationObj ) {
            const direction = {
                yaw: '', // east, west, north, south
                pitch: '', // up, down
                level: false,
                alignment: {}, // x,y,z,minor,major
                rotation: rotationObj,

                coefficients() {
                    const { x, y } = rotationObj
                    const coefficients = {}

                    // ~ Calculate direction coefficients ~
                    // Relative proportion or weight of each direction
                    // Used for calculating diagonal lines
                    let absX = Math.abs( x )
                    let absY = Math.abs( y )

                    // X rotation is up/down
                    const coeffCalcs = {}
                    coeffCalcs.y = absX / 90
                    coeffCalcs.x = absY > 90
                        ? ( 1 - ( ( absY - 90 ) / 90 ) )
                        : absY / 90
                    coeffCalcs.z = 1 - coeffCalcs.x

                    // Re-weight the coefficients 3 ways: x, y, z
                    // Add sign
                    let sumCoeff = coeffCalcs.x + coeffCalcs.y + coeffCalcs.z

                    const pitchAdj = directionMap[ this.pitch ]
                    coefficients.y = ( coeffCalcs.y / sumCoeff ) * pitchAdj.y.adj

                    const yawAdj = directionMap[ this.yaw ]
                    coefficients.x = ( coeffCalcs.x / sumCoeff ) * yawAdj.x.adj
                    coefficients.z = ( coeffCalcs.z / sumCoeff ) * yawAdj.z.adj

                    return coefficients
                },
            }

            const { x, y } = rotationObj

            if ( ! rotationObj ) {
                error( 'getDirection: invalid rotationObj.' )
                log( 'Details', { rotationObj }, 1 )
                rotationObj = { x: 0, y: 0 }
                return direction
            }

            const { alignment } = direction

            /**
             * ~ Calc yaw ~
             * y == yaw
             *
             * N = 180/-180; <= 180 && > 135 || <= -135
             * E = -90; <= -45 && > -135
             * S = 0; <= 45 && > -45
             * W = 90; <= 135 && > 45
             *
             */
            if ( y <= -45 && y > -135 ) {
                direction.yaw = 'east'
            }
            else if ( y <= 135 && y > 45 ) {
                direction.yaw = 'west'
            }
            else if ( y <= 45 && y > -45 ) {
                direction.yaw = 'south'
            }
            else {
                direction.yaw = 'north'
            }

            if ( y >= 90 || y < -90 ) {
                alignment.z = 'north'
            }
            else {
                alignment.z = 'south'
            }

            if ( y <= 180 && y > 0 ) {
                alignment.x = 'west'
            }
            else {
                direction.x = 'east'
            }

            direction.alignment.major = directionMap[ direction.yaw ].axis
            direction.alignment.minor = alignment.major === 'z' ? 'x' : 'z'

            // ~ Calc pitch ~
            // Hinge on x axis
            if ( x <= 0 ) {
                direction.pitch = 'up'
                alignment.y = 'up'
            }
            else {
                direction.pitch = 'down'
                alignment.y = 'down'
            }

            if ( x < levelThresholds.up && x > levelThresholds.down ) {
                direction.level = true
            }

            return direction
        },
    }

    return api
}

/**
 * DisplayInfo factory. Utility for displaying messages using /title command.
 *
 * #todo: title and subtitle messages?
 */
function DisplayInfo( playerName ) {
    // Minecraft defaults: 10 (0.5 seconds), 70 (3.5 seconds), and 20 (1 second).
    // Defined in seconds
    const defaultTimings = {
        fadeIn: 0.5,
        stay: 4,
        fadeOut: 1,
    }

    const command = 'title'
    const type = 'actionbar' // or title, subtitle

    // set default timings
    // #todo: timing doesn't work
    // setTimings()

    const func = ( message, timeout = undefined ) => {
        timeout = timeout && parseFloat( timeout )

        if ( timeout ) {
            // setTimings( timeout )
        }
        const argString = `${ playerName } ${ type } ${ message }`
        system.commandExecute( { command, argString, callback: false } )

        // reset timings
        // setTimings()
    }

    // eslint-disable-next-line no-unused-vars
    function setTimings( timeout = undefined ) {
        const { fadeIn, stay: defaultStay, fadeOut } = defaultTimings
        const stay = timeout || defaultStay

        // title <player: target> times <fadeIn: int> <stay: int> <fadeOut: int>
        const argString = `${ playerName } times ${ parseInt( fadeIn * 20 ) } ${ parseInt( stay * 20 ) } ${ parseInt( fadeOut * 20 ) }`

        system.commandExecute( { command, argString, callback: false } )
    }

    return func
}

// ##### Misc game utilities #####

function isRawPosition( posObject ) {
    if ( ! posObject ) {
        return false
    }

    const validKeys = [ 'x', 'y', 'z' ]
    const positionKeys = Object.keys( posObject )
    const hasPosKeys = positionKeys.some( ( key ) => validKeys.includes( key ) )
    return hasPosKeys
}

// ##### Language utilities #####

/**
 * Parse single value or object.
 */
function advParseInt( n ) {
    if ( Object( n ) === n ) {
        let obj = n
        if ( Array.isArray( obj ) ) {
            return n.map( ( x ) => parseInt( x ) )
        }

        return Object.entries( n ).reduce( ( acc, [ key, value ] ) => {
            const val = parseInt( value )
            if ( val !== undefined ) {
                acc[ key ] = val
            }
            return acc
        }, {} )

    }
    return parseInt( n )
}

function absDiff( v1, v2 ) {
    return Math.abs( Math.floor( v1 ) - Math.floor( v2 ) )
}

/**
 * Check if number is positive, otherwise reset.
 */
function filterPositiveInt( n ) {
    function _filterFunc( _n ){
        _n = parseInt( _n )
        return _n > 0 ? _n : undefined
    }

    if ( Object( n ) === n ) {
        let obj = n
        if ( Array.isArray( obj ) ) {
            return n.map( ( x ) => _filterFunc( x ) )
        }

        return Object.entries( n ).reduce( ( acc, [ key, value ] ) => {
            const val = _filterFunc( value )
            if ( val !== undefined ) {
                acc[ key ] = val
            }
            return acc
        }, {} )

    }

    return _filterFunc( n )
}

function isNil( x ) {
    return x === undefined || x === null
}

/**
 * Check if variable is an object, but not an array.
 */
function isObject( item ) {
    return ( Object( item ) === item && ! Array.isArray( item ) )
}

function isEmpty( obj ) {
    if ( Object( obj ) === obj ) {
        return ! Object.keys( obj ).length
    }
    return null
}

/**
 * Object merge with safeguard.
 */
function merge( target, ...sources ) {
    if ( ! isObject( target ) ) {
        return
    }
    if ( ! sources.length ) {
        return target
    }

    const source = sources.shift()
    if ( isObject( source ) ) {
        Object.assign( target, source )
    }
    return merge( target, ...sources )
}

function mergeDeep( target, ...sources ) {
    if ( ! sources.length ) {
        return target
    }
    const source = sources.shift()

    if ( isObject( target ) && isObject( source ) ) {
        Object.keys( source ).forEach( ( key ) => {
            if ( isObject( source[ key ] ) ) {
                if ( ! target[ key ] ) {
                    Object.assign( target, { [ key ]: {} } )
                }
                mergeDeep( target[ key ], source[ key ] )
            }
            else {
                Object.assign( target, { [ key ]: source[ key ] } )
            }
        } )
    }

    return mergeDeep( target, ...sources )
}

/**
 * Extract value from object and remove key.
 */
function extract( key, obj ) {
    if ( key in obj ) {
        const value = obj[ key ]
        delete obj[ key ]
        return value
    }
}
