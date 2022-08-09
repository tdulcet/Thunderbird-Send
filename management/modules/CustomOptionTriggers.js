/**
 * This modules contains the custom triggers for some options that are added.
 *
 * @module modules/CustomOptionTriggers
 */

import * as AutomaticSettings from "/common/modules/AutomaticSettings/AutomaticSettings.js";
import * as AddonSettings from "/common/modules/AddonSettings/AddonSettings.js";
import * as CommonMessages from "/common/modules/MessageHandler/CommonMessages.js";

// communication type
const VERIFY = "verify";

let accountId = null;

/**
 * Adjusts account setting for saving.
 *
 * @private
 * @param {Object} param
 * @param {Object} param.optionValue the value of the option to be loaded
 * @param {string} param.option the name of the option that has been changed
 * @param {HTMLElement} param.elOption where the data is supposed to be loaded
 *                     into
 * @param {Object} param.optionValues result of a storage.[�].get call, which
 *                  contains the values that should be applied to the file
 *                  Please prefer "optionValue" instead of this, as this may not
 *                  always contain a value here.
 * @returns {Promise}
 */
function get(param) {
	// console.log(param.optionValue, param.optionValues);

	// Use the existing or the default option
	return AutomaticSettings.Trigger.overrideContinue(param.optionValues.account?.[accountId]?.[param.option] || param.optionValue);
}

/**
 * Adjusts account setting for saving.
 *
 * @private
 * @param {Object} param
 * @param {Object} param.optionValue the value of the changed option
 * @param {string} param.option the name of the option that has been changed
 * @param {Array} param.saveTriggerValues all values returned by potentially
 *                                          previously run safe triggers
 * @returns {Promise}
 */
async function set(param) {
	// console.log(param.optionValue);

	// Get the existing + default options
	let account = await AddonSettings.get(param.option);
	// Remove the default options
	account = Object.entries(account).reduce((a, [k, v]) => v === Object(v) ? (a[k] = v, a) : a, {});
	// Set the new options
	account[accountId] = param.optionValue;

	return AutomaticSettings.Trigger.overrideContinue(account);
}

/**
 * Apply the new account settings.
 *
 * @private
 * @param  {Object} optionValue
 * @param  {string} [option]
 * @param  {Object} [event]
 * @returns {void}
 */
function apply(optionValue) {
	// console.log(optionValue);

	browser.cloudFile.updateAccount(accountId, { configured: true, uploadSizeLimit: optionValue.size * 1024 * 1024 * 1024 });
}

/**
 * Verify Send server version.
 *
 * @param  {Object} event
 * @returns {void}
 */
function verify(event) {
	const service = document.getElementById("service");

	if (service.value) {
		// disable button (which triggered this) until process is finished
		event.target.disabled = true;
		service.disabled = true;

		browser.runtime.sendMessage({
			type: VERIFY,
			service: service.value
		}).then((message) => {
			// console.log(message);
			if (message.type === VERIFY) {
				if (message.value) {
					CommonMessages.showSuccess("Send server verified!", true);
				} else {
					CommonMessages.showError("Unable to verify Send server", true);
				}
			}
		}).finally(() => {
			// re-enable button
			event.target.disabled = false;
			service.disabled = false;
		});
	}
}

document.getElementById("verify").addEventListener("click", verify);

/**
 * Binds the triggers.
 *
 * This is basically the "init" method.
 *
 * @returns {void}
 */
export function registerTrigger() {
	accountId = new URL(location.href).searchParams.get("accountId");

	AutomaticSettings.Trigger.addCustomLoadOverride("service", get);
	AutomaticSettings.Trigger.addCustomLoadOverride("downloads", get);
	AutomaticSettings.Trigger.addCustomLoadOverride("time", get);
	AutomaticSettings.Trigger.addCustomLoadOverride("size", get);

	AutomaticSettings.Trigger.addCustomSaveOverride("account", set);

	AutomaticSettings.Trigger.registerSave("account", apply);
}
