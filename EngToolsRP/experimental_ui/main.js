'use strict'

/*
 * Name: Engineering Tools
 * Author: Bjornar Egede-Nissen
 * License: GNU General Public License v3.0 (GPL-v3)
 */

const state = {
    data: {},
    changed: {},
    error: false,
}

const { error, log, debug, debugObj, resetLog } = Console( 0 )
const notifications = Notifications()

// === onLoad event ===
// Get a handle to the scripting interface on creation.
// The script interface can trigger events to the client script
let uiInterface = null
engine.on( 'facet:updated:core.scripting', function ( mcInterface ) {
    uiInterface = mcInterface

    // Send uiLoaded signal to client
    const eventData = JSON.stringify( { action: 'ui_loaded' } )
    log( 'UI loaded' )
    uiInterface.triggerEvent( eventData )
} )

engine.trigger( 'facet:request', [ 'core.scripting' ] )

// === Receive data from the client script ===
engine.on( 'onLoadCallback', function ( clientData ) {
    log( 'onLoadCallback' )

    // stringified event data from the client script. Parse it back into a JSON object.
    const { data } = JSON.parse( clientData )
    state.data = data

    const { title, name } = data.tool
    log( `Configuring tool: ${ title } (${ name })` )
    debugObj( { data } )
    setHtml( 'tool-name', title || 'unknown' )


    // === Click event ===
    // Note: querySelector does not work because nodeList is not supported
    document.getElementById( '_body_' ).addEventListener( 'click', onClick )
    // document.getElementById("_fillSize--width_").addEventListener("blur", onInputBlur)

    // === Stop if no valid tool ===
    if ( data.toolType !== 'fill' && data.toolType !== 'query' ) {
        notifications.notice( 'No configuration options for current tool.', false )
        return
    }

    // === Configure input elements ===
    const inputElements = document.getElementsByClassName( 'input-text' )
    forEachEl( inputElements, ( el ) => {
        // todo: case converter
        const { tooltype: toolType, prop, subprop } = el.dataset

        // Hide if the tool type does not match
        if ( ! toolType === data.toolType ) {
            hide( el )
            return
        }
        el.id = getInputId( toolType, prop, subprop )
        el.addEventListener( 'blur', onInputBlur )
    } )

    // Radio group structure: input-radio-group > input-radio-group-wrapper > input-radio-option
    const radioGroups = document.getElementsByClassName( 'input-radio-group' )
    forEachEl( radioGroups, ( group, i ) => {
        const { prop, key, tool } = group.dataset
        group.id = getInputId( prop, key ) // `input-radio-group-${ toolType }` //input-radio-element-

        // debug( `Radio group #${ i }: ${ group.id }` )
        // debugObj( { prop, key } )
        // debug( 'VALUE ==> ', getValueDeep( data, [ 'toolConfig', prop, key ] ) )

        // Hide control if there is no default value
        if ( getValueDeep( data, [ 'toolDefaults', prop, key ] ) === undefined ) {
            log( `Hiding radio group ${ group.id }.` )
            hide( group )
            return
        }

        // Hide if tool name doesn't match include filter
        if ( tool && tool !== name ) {
            log( `Hiding radio group ${ group.id }.` )
            hide( group )
            return
        }

        forEachEl( group.firstElementChild.children, ( el, j ) => {
            el.id = getInputId( prop, key, j )
            el.dataset[ 'group' ] = prop
            el.dataset[ 'key' ] = key || ''

            // debugObj( { group: el.dataset[ 'group' ], key: el.dataset[ 'key' ] } )
            // debug( `${ j }: ${ el.id } ==> ${ el.dataset.value } / ${ el.dataset.selected || 'false' }` )

            forEachEl( el.children, ( subEl ) => {
                subEl.dataset.type = 'radio'
                subEl.dataset.parent = el.id
            } )

            // toggleRadioButton( el )
        } )
    } )

    // === Show options based on current tool ===
    GetElements( 'shared-config' ).each( ( inputEl ) => inputEl.show() )
    if ( data.toolType === 'fill' ) {
        GetElements( 'fill-config' ).each( ( inputEl ) => inputEl.show() )
    }

    resetForm()
    log( 'UI has finished loading.' )
} )


// === Event handlers ===

function onClick( e ) {
    let target = e.target && e.target.id
    let inputType = e.target.dataset.type

    log( 'onClick()' )
    debugObj( { target, className: e.target.className, inputType, currentTarget: e.currentTarget.id } )

    const clickFunc = clickEventHandlers[ inputType ]

    if ( clickFunc ) {
        clickFunc( e.target )
    }
}

/**
 * Keys: dataset.type
 */
const clickEventHandlers = {
    debugSave: () =>{
        let eventData = {}
        eventData.action = 'update_tool_settings'
        eventData.data = state.changed
        eventData = JSON.stringify( eventData )
        debugObj( eventData )
    },

    save(){
        let eventData = {}
        if ( ! state.error && isFormDirty() ) {
            eventData.action = 'update_tool_settings'
            eventData.data = state.changed
        }
        else {
            eventData.action = 'close'
        }

        eventData = JSON.stringify( eventData )
        uiInterface.triggerEvent( eventData )
    },

    reset(){
        setTimeout( () => {
            resetForm()
        }, 10 )
    },

    hide( target ){
        const targetEl = GetElement( target.dataset.target )
        targetEl.hide()
    },

    consoleMenu( target ){
        if ( target.id === 'console-reset' ) {
            resetLog()
        }
        else if ( target.id === 'console-get-state' ) {
            debugObj( state )
        }
    },

    number( el ) {
        const len = el.value.length
        el.setSelectionRange( len, len )
    },

    radio( el ) {
        const { parent } = el.dataset

        // debug( 'type:', el.dataset.type )
        // debug( 'parent:', el.dataset.parent )

        if ( parent ) {
            el = document.getElementById( parent )
        }

        toggleRadioButton( el )
    },
}

function onInputBlur( e ) {
    const target = e.target

    log( 'Blur:', target.id, ' ==> ', target.value )

    const { tooltype: toolType, prop, subprop, type } = target.dataset

    const { maxSize } = state.data.toolConfig || 100
    const minSize = 1

    let value = parseInt( target.value )
    value = Number.isNaN( value ) ? minSize : value
    value = value < minSize ? minSize : value
    value = value > maxSize ? maxSize : value

    validateFillSize()

    if ( value !== target.value ) {
        setInput( value, prop, subprop, type, toolType )
    }

    const path = [ 'toolConfig', prop, subprop ].filter( ( x ) => x )

    if ( value !== getValueDeep( state.data, path ) ) {
        setState( 'changed', path, value )
        debugObj( state.changed )
    }

    toggleDirtyForm()
}

// === Form functions ===
function resetForm() {
    const { toolType, toolConfig } = state.data

    log( 'Resetting form values.' )

    const { size, targetBlock, buildDirections } = toolConfig

    if ( toolType === 'fill' ) {
        if ( 'size' in toolConfig ) {
            setInput( size.width, 'size', 'width', 'number', 'fill' )
            setInput( size.height, 'size', 'height', 'number', 'fill' )
            setInput( size.depth, 'size', 'depth', 'number', 'fill' )
        }

        if ( 'buildDirections' in toolConfig ) {
            setInput( buildDirections.x, 'buildDirections', 'x', 'radio' )
            setInput( buildDirections.y, 'buildDirections', 'y', 'radio' )
            setInput( buildDirections.z, 'buildDirections', 'z', 'radio' )
        }
    }

    if ( 'targetBlock' in toolConfig ) {
        setInput( targetBlock, 'targetBlock', undefined, 'radio' )
    }

    state.changed = {}
    state.error = false
    toggleDirtyForm()
}

function toggleRadioButton( e ) {
    log( 'Toggle radio button', e.id )

    const selectedValue = e.dataset.value
    const { group, key } = e.dataset
    // debugObj( { group, key, selectedValue } )
    const initialValue = getValueDeep( state.data, [ 'toolConfig', group, key ] )
    // debugObj( { initialValue } )
    const groupElementId = getInputId( group, key )
    // debugObj( { groupElementId } )
    const groupEl = document.getElementById( groupElementId )

    // debugObj( { group, key, groupElementId, htmlEl: groupEl.id, initialValue, selectedValue } )

    if ( initialValue !== selectedValue ) {
        setState( 'changed', [ 'toolConfig', group, key ], selectedValue )
    }
    else {
        setState( 'changed', [ 'toolConfig', group, key ], null )
    }

    e.dataset.selected = 'true'
    e.classList.add( 'input-radio-selected' )

    const { warning } = e.dataset
    if ( warning ) {
        log( warning )
        notifications.warning( warning )
    }

    if ( groupEl ) {
        forEachEl( groupEl.firstElementChild.children, ( el ) => {
            if ( el.dataset.value !== selectedValue ) {
                el.dataset.selected = 'false'
                el.classList.remove( 'input-radio-selected' )
            }
        } )
    }

    toggleDirtyForm()
}

function getInput( toolType, prop, subprop, defaultValue = 0 ) {
    const id = getInputId( toolType, prop, subprop )
    const el = document.getElementById( id )

    if ( el ) {
        return el.value || defaultValue
    }
    return defaultValue
}

function setInput( value, prop, subprop, inputType, toolType = undefined ) {
    const id = getInputId( toolType, prop, subprop )

    log( 'setInput()', stringify( { id, toolType, prop, subprop, inputType, value } ) )

    const el = document.getElementById( id )

    if ( ! el ) {
        error( `setInput() - element not found (${ id })` )
        return
    }

    switch ( inputType ) {
        case 'number':
            el.value = parseInt( value )
            break

        case 'radio':
            forEachEl( el.firstElementChild.children, ( radioEl ) => {
                if ( radioEl.dataset.value === value ) {
                    toggleRadioButton( radioEl )
                }
            } )
            break
    }
}

function setState( store, path, value ) {
    log( 'Update state', `[${ path.join( '.' ) }] = `, value )
    state[ store ] = setValueDeep( state[ store ], path, value )
}

function getInputId( ...path ) {
    path.unshift( 'input' )
    return path.filter( ( x ) => Object( x ) !== x && ( x || x === 0 ) ).join( '-' )
}

function isFormDirty() {
    return Object.keys( state.changed ).length
}

function toggleDirtyForm() {
    const saveBtn = document.getElementById( 'save-form' )
    if ( ! state.error ) {
        notifications.hide()

        if ( isFormDirty() ) {
            saveBtn.innerHTML = 'Save'
            saveBtn.classList.add( 'button-save' )
            return true
        }
    }

    saveBtn.innerHTML = 'Close'
    saveBtn.classList.remove( 'button-save' )
    return false
}

function validateFillSize() {
    const width = getInput( 'fill', 'size', 'width', 1 )
    const height = getInput( 'fill', 'size', 'height', 1 )
    const depth = getInput( 'fill', 'size', 'depth', 1 )

    const fillSize = width * height * depth
    if ( fillSize > 32768 ){
        state.error = true
        notifications.error( 'Too big! The product of all sides cannot exceed 32,768 blocks.' )
    }
    else {
        state.error = false
    }
}


// === Utility functions ===

function setValueDeep( obj, path, value ) {
    const _path = path.filter( ( x ) => x )
    const k = _path.shift()

    if ( ! _path.length ) {
        if ( value === null ) {
            delete obj[ k ]
        }
        else {
            obj[ k ] = value

        }
        return obj
    }
    obj[ k ] = k in obj ? obj[ k ] : {}
    obj[ k ] = setValueDeep( obj[ k ], _path, value )

    return obj
}

/**
 * Retrieve value from object by nested path.
 * Automatically culls undefined keys.
 */
function getValueDeep( obj, path, ifValidPath = false ) {
    const _path = path.filter( ( x ) => x )
    const k = _path.shift()
    if ( ! _path.length ) {
        return obj[ k ]
    }

    if ( k in obj ) {
        return ifValidPath ? true : getValueDeep( obj[ k ], _path )
    }

    return
}

/**
 * Replacement for forEach() - not supported by HTML collection objects.
 *
 * callback: (HTMLelement, index) => void
 */
function forEachEl( htmlCollection, callback ) {
    if ( ! htmlCollection.length ) {
        return
    }
    for ( let i = 0; i < htmlCollection.length; i++ ) {
        callback( htmlCollection[ i ], i )
    }
}

function stringify( str ){
    return JSON.stringify( str, null, 3 )
}

function show( target ) {
    if ( typeof target === 'string' ) {
        target = document.getElementById( target )
    }
    if ( target.tagName ) {
        target.classList.remove( 'hide' )
    }
}

function hide( target ) {
    if ( typeof target === 'string' ) {
        target = document.getElementById( target )
    }
    if ( target.tagName ) {
        target.classList.add( 'hide' )
    }
}

function setHtml( target, content, visibility = undefined ) {
    let el = target
    if ( typeof target === 'string' ) {
        el = document.getElementById( target )
    }
    if ( ! el.tagName ) {
        error( 'An error occurred in setHtml() - unknown target `', el, '`. Writing content:', content )
        return
    }

    if ( visibility === true ) {
        show( el )
    }
    else if ( visibility === false ) {
        hide( el )
    }

    el.innerHTML = content
    return el
}

function GetElement( target ){
    let el = target
    if ( typeof target === 'string' ) {
        el = document.getElementById( target )
    }

    if ( ! el || ! el.tagName ) {
        error( 'An error occurred in GetElement() - unknown target `', el, '`.' )
        return
    }

    return {
        get el(){
            return el
        },
        get classList(){
            return el.classList
        },
        html( content ) {
            el.innerHTML = content
        },
        value( value = undefined ) {
            if ( value !== undefined ) {
                el.value = value
            }
            return el.value
        },
        show(){
            show( el )
        },
        hide(){
            hide( el )
        },
        toggle( value ){
            if ( value ) {
                show( el )
            }
            else {
                hide( el )
            }
        },
    }
}


function GetElements( className ){
    let targets = document.getElementsByClassName( className )

    debug( 'GetElements -- Targets length: ', targets.length )
    debug( 'Target[0]: ', targets[ 0 ].className )


    if ( ! targets.length ) {
        error( 'An error occurred in GetElements() - unknown target .`', className, '`.' )
        return
    }

    return {
        each( callback ) {
            forEachEl( targets, ( el ) => {
                // debug( 'EACH EL', el.className )

                const e = GetElement( el )
                callback( e )
                // debug( 'AFTER', el.className )

            } )
        },
    }
}

function Notifications(){
    const msgBox = GetElement( 'notification-box' )
    const msgEl = GetElement( 'notification-msg' )
    const msgBtn = GetElement( 'notification-button' )

    return {
        info( msg ){
            msgEl.html( msg )
            removeClasses( 'error', 'warning', 'notice' )
            msgBox.classList.add( 'info' )
            msgBtn.toggle( true )
            msgBox.show()
        },
        notice( msg, button = true ){
            msgEl.html( msg )
            removeClasses( 'error', 'warning', 'info' )
            debug( 'removeClasses done' )
            msgBox.classList.add( 'notice' )
            msgBtn.toggle( button )
            msgBox.show()


        },
        warning( msg ){
            msgEl.html( msg )
            removeClasses( 'error', 'info', 'notice' )
            msgBox.classList.add( 'warning' )
            msgBtn.toggle( true )
            msgBox.show()
        },
        error( msg ){
            msgEl.html( msg )
            removeClasses( 'info', 'warning', 'notice' )
            msgBox.classList.add( 'error' )
            msgBtn.toggle( true )
            msgBox.show()
        },
        hide(){
            msgBox.hide()
        },
    }

    function removeClasses( ...classes ) {
        classes.map( ( x )=>{

        } )
        classes.forEach( ( c )=>{
            msgBox.classList.remove( c )
        } )
    }
}

/**
 * Logger and ersatz console. Factory function.
 *
 * CANNOT handle complex objects, only object literals.
 * JSON.stringify() will crash the whole script engine silently if used on a complex object.
 *
 * Log levels:
 * 1: error
 * 2: log
 * 3: debug
 * 4: verbose debug
 *
 * If level = 1, console is invisible until an error occurs
 */
function Console( logLevel = 1, reverse = false ) {
    if ( ! logLevel ) {
        return { error(){}, debug(){}, debugObj(){}, log(){}, resetLog(){} }
    }

    const separator = '-----------------------------------------------------------------------------------------------------'

    const consoleBox = GetElement( 'console' )
    const consoleContainer = GetElement( 'console-panel' )

    if ( logLevel > 1 ) {
        consoleContainer.show()
    }

    let logData = []
    return {
        error( ...msg ){
            _logMsg( [ '[ERROR]', ...msg ], 1 )
            consoleContainer.show()
        },
        log( label, ...msg ){
            _logMsg( [ `[${ label }]`, ...msg ], 2 )
        },
        debug( ...msg ) {
            // msg = msg || '(undefined)'
            // msg = `${ separator }\n${ msg }`

            _logMsg( msg, 3 )
        },
        debugObj( msg ){
            // _logMsg( 'OBJECT' )
            // _logMsg( msg )
            msg = stringify( msg )
            // consoleBox.value = `${ consoleBox.value }\n\n\n\n${ msg }`
            _logMsg( msg, 4 )
        },
        resetLog(){
            logData = []
            consoleBox.value( '' )
            return
        },
    }

    function _logMsg( messages, level ) {
        if ( level > logLevel ) {
            return
        }

        const msgStr = Array.isArray( messages ) ? messages.join( ' ' ) : messages

        if ( reverse ) {
            logData.unshift( separator )
            logData.unshift( msgStr )
        }
        else {
            logData.push( separator )
            logData.push( msgStr )
        }

        consoleBox.value( logData.join( '\n' ) )
    }


}
