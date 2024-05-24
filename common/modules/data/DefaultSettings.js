/**
 * Specifies the default settings of the add-on.
 *
 * @module data/DefaultSettings
 */

/**
 * An object of all default settings.
 *
 * @private
 * @const
 * @type {Object}
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
 * @const
 * @type {Object}
 */
export const DEFAULT_SETTINGS = Object.freeze(defaultSettings);
