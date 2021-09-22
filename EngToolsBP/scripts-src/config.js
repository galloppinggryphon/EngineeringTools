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
