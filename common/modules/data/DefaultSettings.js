/**
 * Specifies the default settings of the add-on.
 *
 * @module data/DefaultSettings
 */

/**
 * An object of all default settings.
 *
 * @private
 * @constant
 * @type {object}
 */
const defaultSettings = {
	settings: {
		send: true,
		composeAction: true,
		link: false
	},
	account: {
		service: "https://send.vis.ee",
		downloads: 1,
		time: 1440, // Minutes
		size: 2.5 // GiB
	}
};

// freeze the inner objects, this is strongly recommend
Object.values(defaultSettings).map(Object.freeze);

/**
 * Export the default settings to be used.
 *
 * @public
 * @constant
 * @type {object}
 */
export const DEFAULT_SETTINGS = Object.freeze(defaultSettings);
